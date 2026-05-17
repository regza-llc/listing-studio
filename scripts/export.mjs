#!/usr/bin/env node
/**
 * listing-studio PC 同期スクリプト
 *
 * Supabase から商品データと写真を取得して、ローカルフォルダに展開する。
 * 案A（アプリ内エクスポート）の PC 版。大量バッチ向け。
 *
 * 使い方:
 *   node scripts/export.mjs                       # status=ready の全商品を出力
 *   node scripts/export.mjs --status all          # 全ステータス
 *   node scripts/export.mjs --status reviewing    # AI推定済のみ
 *   node scripts/export.mjs --output C:\Yahoo\exports\2026-05-17
 *   node scripts/export.mjs --since 2026-05-15
 *   node scripts/export.mjs --ids id1,id2,id3
 *
 * 出力構成（既定: C:\Yahoo\exports\YYYY-MM-DD\）:
 *   ├── {商品ID}/photo_01.jpg, photo_02.jpg, ...
 *   └── okutown_import.csv
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
  return env;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(values) {
  return values.map(escapeCsv).join(",");
}

function safeFolderName(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36);
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`使い方:
  node scripts/export.mjs [options]

オプション:
  --status <ready|reviewing|draft|exported|all>  対象ステータス (既定: ready)
  --output <path>                                出力先 (既定: C:\\Yahoo\\exports\\YYYY-MM-DD)
  --since <YYYY-MM-DD>                           この日付以降に作成された商品のみ
  --ids <id1,id2,...>                            特定の商品IDのみ
  --help                                         このヘルプ`);
    process.exit(0);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です",
    );
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
       product_photos ( storage_path, order_index )`,
    )
    .order("created_at", { ascending: false });

  if (args.status !== "all") {
    query = query.eq("status", args.status);
  }
  if (args.since) {
    query = query.gte("created_at", args.since);
  }
  if (args.ids && args.ids.length > 0) {
    query = query.in("id", args.ids);
  }

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

  const csvHeader = [
    "商品ID",
    "タイトル",
    "カテゴリ",
    "状態",
    "しまう場所",
    "開始価格",
    "備考",
    "写真ファイル",
    "ステータス",
    "作成日時",
  ];
  const csvLines = [rowToCsv(csvHeader)];

  let totalPhotos = 0;
  let downloadErrors = 0;

  for (const [idx, p] of products.entries()) {
    const folder = safeFolderName(p.id);
    const productDir = join(outputDir, folder);
    await mkdir(productDir, { recursive: true });

    const photos = (p.product_photos ?? [])
      .slice()
      .sort((a, b) => a.order_index - b.order_index);

    const photoFilenames = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = photo.storage_path.split(".").pop() ?? "jpg";
      const filename = `photo_${String(i + 1).padStart(2, "0")}.${ext}`;

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
      photoFilenames.push(`${folder}/${filename}`);
      totalPhotos++;
    }

    csvLines.push(
      rowToCsv([
        p.id,
        p.title ?? "",
        p.category_hint ?? "",
        p.condition ?? "",
        p.storage_location ?? "",
        p.start_price ?? "",
        p.notes ?? "",
        photoFilenames.join("|"),
        p.status,
        p.created_at,
      ]),
    );

    console.log(
      `  [${idx + 1}/${products.length}] ${p.title?.slice(0, 30) ?? "(無題)"} - ${photos.length}枚`,
    );
  }

  const csvBody = csvLines.join("\r\n");
  const csvWithBom = "﻿" + csvBody;
  await writeFile(join(outputDir, "okutown_import.csv"), csvWithBom, "utf8");

  console.log("");
  console.log(`✅ エクスポート完了`);
  console.log(`   商品: ${products.length} 件`);
  console.log(`   写真: ${totalPhotos} 枚`);
  if (downloadErrors > 0) {
    console.log(`   ⚠ DL失敗: ${downloadErrors} 件`);
  }
  console.log(`   出力先: ${outputDir}`);
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
