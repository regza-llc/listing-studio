#!/usr/bin/env node
/**
 * listing-studio v0.2 PC バッチエクスポートスクリプト
 *
 * Supabase から商品データと写真を取得して、ローカルフォルダに展開する。
 * 大量バッチ向け。アプリ内エクスポート（/api/export）と同じ構造の出力を行う。
 *
 * 使い方:
 *   node scripts/export.mjs                       # status=ready の全商品を出力
 *   node scripts/export.mjs --status all          # 全ステータス
 *   node scripts/export.mjs --output C:\\Yahoo\\exports\\2026-05-20
 *   node scripts/export.mjs --since 2026-05-15
 *   node scripts/export.mjs --ids id1,id2,id3
 *
 * 出力構成（既定: C:\\Yahoo\\exports\\YYYY-MM-DD\\）:
 *   ├── product-{商品ID}/01.jpg, 02.jpg, ..., metadata.json
 *   ├── ...
 *   └── README.txt
 *
 * v0.1 → v0.2 変更点:
 *   - AI 由来カラム参照を撤去（#10 Option A）
 *   - オークタウン CSV 生成を撤去 → Claude 側で生成する前提
 *   - 商品ごとに metadata.json を出力（Claude 投入用）
 *   - 配送方法を shipping_methods マスタから取得（#15）
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CARRIER_LABEL = {
  japan_post: "日本郵便",
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
};

function parseArgs(argv) {
  const args = { status: "ready" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status") args.status = argv[++i];
    else if (a === "--output") args.output = argv[++i];
    else if (a === "--since") args.since = argv[++i];
    else if (a === "--ids") args.ids = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function loadEnv() {
  const path = resolve(__dirname, "..", ".env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
}

function safeFolderName(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36);
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatShipping(sm) {
  if (!sm) return null;
  const carrier = CARRIER_LABEL[sm.carrier] ?? sm.carrier;
  return sm.size ? `${carrier} / ${sm.name}（${sm.size}）` : `${carrier} / ${sm.name}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`使い方:
  node scripts/export.mjs [options]

オプション:
  --status <ready|draft|exported|all>  対象ステータス (既定: ready)
  --output <path>                      出力先 (既定: C:\\Yahoo\\exports\\YYYY-MM-DD)
  --since <YYYY-MM-DD>                 この日付以降に作成された商品のみ
  --ids <id1,id2,...>                  特定の商品IDのみ
  --help                               このヘルプ`);
    process.exit(0);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const outputDir = args.output ?? `C:\\Yahoo\\exports\\${todayString()}`;
  console.log(`📦 出力先: ${outputDir}`);
  console.log(`🔍 対象ステータス: ${args.status}`);

  let query = supabase
    .from("products")
    .select(
      `id, created_at, status, title, category_hint, condition,
       storage_location, start_price, notes,
       shipping_method:shipping_methods ( carrier, name, size ),
       product_photos ( storage_path, order_index )`,
    )
    .order("created_at", { ascending: false });

  if (args.status !== "all") query = query.eq("status", args.status);
  if (args.since) query = query.gte("created_at", args.since);
  if (args.ids && args.ids.length > 0) query = query.in("id", args.ids);

  const { data: products, error } = await query;

  if (error) {
    console.error("❌ 商品取得失敗:", error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log("対象の商品がありません");
    process.exit(0);
  }

  console.log(`✓ ${products.length} 件取得`);

  await mkdir(outputDir, { recursive: true });

  let totalPhotos = 0;
  let downloadErrors = 0;

  for (const [idx, p] of products.entries()) {
    const folder = `product-${safeFolderName(p.id)}`;
    const productDir = join(outputDir, folder);
    await mkdir(productDir, { recursive: true });

    const photos = (p.product_photos ?? [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index);

    const photoFilenames = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = photo.storage_path.split(".").pop() ?? "jpg";
      const filename = `${String(i + 1).padStart(2, "0")}.${ext}`;

      const { data: blob, error: dlErr } = await supabase.storage
        .from("product-photos")
        .download(photo.storage_path);

      if (dlErr || !blob) {
        console.warn(`  ⚠ DL失敗: ${photo.storage_path}`);
        downloadErrors++;
        continue;
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      await writeFile(join(productDir, filename), buffer);
      photoFilenames.push(filename);
      totalPhotos++;
    }

    const metadata = {
      product_id: p.id,
      created_at: p.created_at,
      status: p.status,
      title: p.title,
      category_hint: p.category_hint,
      condition: p.condition,
      storage_location: p.storage_location,
      start_price: p.start_price,
      shipping_method: formatShipping(p.shipping_method),
      notes: p.notes,
      photos: photoFilenames,
    };

    await writeFile(
      join(productDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    console.log(
      `  [${idx + 1}/${products.length}] ${p.title?.slice(0, 30) ?? "(無題)"} - ${photos.length}枚`,
    );
  }

  const readme = `# listing-studio v0.2 エクスポート

エクスポート日時: ${new Date().toISOString()}
対象商品数: ${products.length}
写真総数: ${totalPhotos}

## Claude 投入の手順

1. このフォルダを ZIP 化 or そのまま Claude へ投入
2. 「これらの商品について、metadata.json と写真からヤフオク用タイトル / カテゴリ ID / 開始価格を生成してオークタウン CSV にしてください」と依頼
3. 出力された CSV をオークタウンへ手動アップロード

## v0.1 → v0.2 変更点

- AI 自動分析を撤去（撮影 → メタ入力までを listing-studio で完結）
- 出力先媒体ごとの CSV 生成は Claude に委譲
- 配送方法はマスタからの選択値を JSON に含める
`;
  await writeFile(join(outputDir, "README.txt"), readme, "utf8");

  console.log("");
  console.log(`✅ エクスポート完了`);
  console.log(`   商品: ${products.length} 件`);
  console.log(`   写真: ${totalPhotos} 枚`);
  if (downloadErrors > 0) console.log(`   ⚠ DL失敗: ${downloadErrors} 件`);
  console.log(`   出力先: ${outputDir}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
