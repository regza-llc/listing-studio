import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import {
  AUCTOWN_CSV_HEADER,
  AUCTOWN_DEFAULTS,
  AUCTOWN_IMAGE_SLOTS,
  buildAuctownImageFilename,
  buildAuctownRow,
  rowToAuctownCsv,
} from "@/lib/auctown";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productIds = body?.product_ids as string[] | undefined;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "product_ids (array) が必要です" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select(
        `id, created_at, status, title, category_hint,
         yahoo_category_path, yahoo_category_id,
         description, condition, storage_location, start_price,
         suggested_price_min, suggested_price_max, shipping_hint, notes,
         dimensions, flaws,
         product_photos ( storage_path, order_index )`,
      )
      .in("id", productIds);

    if (productsErr) {
      return NextResponse.json({ error: productsErr.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json(
        { error: "対象商品が見つかりません" },
        { status: 404 },
      );
    }

    const zip = new JSZip();
    const csvLines: string[] = [rowToAuctownCsv(Array.from(AUCTOWN_CSV_HEADER))];

    // 警告メッセージ蓄積（カテゴリID未取得など）
    const warnings: string[] = [];

    for (const p of products) {
      const photos = (p.product_photos ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .slice(0, AUCTOWN_IMAGE_SLOTS); // 10枚まで

      // 画像をフラットに ZIP へ追加 + ファイル名配列を作る
      const imageFilenames: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const ext = photo.storage_path.split(".").pop() ?? "jpg";
        const filename = buildAuctownImageFilename(p.id, i, ext);

        const { data: blob, error: dlErr } = await supabase.storage
          .from("product-photos")
          .download(photo.storage_path);

        if (dlErr || !blob) {
          console.error(`[export] download失敗: ${photo.storage_path}`, dlErr);
          warnings.push(`商品 ${p.id} の画像 ${i + 1} がダウンロード失敗`);
          continue;
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        zip.file(filename, buffer);
        imageFilenames.push(filename);
      }

      const row = buildAuctownRow(p, imageFilenames);
      for (const w of row.warnings) {
        warnings.push(`商品 ${w.product_id}: ${w.message}`);
      }
      csvLines.push(rowToAuctownCsv(row.cells));
    }

    // UTF-8 BOM + CRLF（Excel/オークタウン両方で読める）
    const csvBody = csvLines.join("\r\n");
    const csvWithBom = "﻿" + csvBody;
    zip.file("auctown_listing.csv", csvWithBom);

    // README
    const readme = `# listing-studio オークタウン出品 ZIP

エクスポート日時: ${new Date().toISOString()}
対象商品数: ${products.length}

## ファイル構成

- auctown_listing.csv : オークタウン公式テンプレ準拠の出品 CSV（UTF-8 BOM・26 列）
- *.jpg : 出品用画像（CSV の「画像1〜10」列で参照）

## オークタウン取込手順

1. ZIP を解凍する（フォルダ階層なしのフラット展開）
2. オークタウン管理画面 → 一括出品 → CSV インポート
3. auctown_listing.csv をアップロード
4. 画像を一括アップロード（ZIP 解凍後のすべての .jpg を選択）
5. プレビュー確認 → 問題なければ出品実行

## 固定値（settings）

以下はすべての商品に共通で入る値（環境変数で上書き可能）:

| 列 | 値 | 環境変数 |
|---|---|---|
| 個数 | ${AUCTOWN_DEFAULTS.quantity} | AUCTOWN_QUANTITY |
| 開催期間（日）| ${AUCTOWN_DEFAULTS.duration_days} | AUCTOWN_DURATION_DAYS |
| 終了時間（時）| ${AUCTOWN_DEFAULTS.end_time_hour} | AUCTOWN_END_TIME |
| 返品の可否 | ${AUCTOWN_DEFAULTS.returns} | AUCTOWN_RETURNS |
| 発送元都道府県 | ${AUCTOWN_DEFAULTS.seller_prefecture} | AUCTOWN_SELLER_PREFECTURE |
| 送料負担 | ${AUCTOWN_DEFAULTS.shipping_payer} | AUCTOWN_SHIPPING_PAYER |
| 代金支払い | ${AUCTOWN_DEFAULTS.payment_method} | AUCTOWN_PAYMENT_METHOD |
| yahoo!簡単決済 | ${AUCTOWN_DEFAULTS.yahoo_kantan} | AUCTOWN_YAHOO_KANTAN |
| 発送までの日数 | ${AUCTOWN_DEFAULTS.shipping_days} | AUCTOWN_SHIPPING_DAYS |
| 自動延長 | ${AUCTOWN_DEFAULTS.auto_extension} | AUCTOWN_AUTO_EXTENSION |
| 早期終了 | ${AUCTOWN_DEFAULTS.early_close} | AUCTOWN_EARLY_CLOSE |

## 状態ランクのマッピング

listing-studio 内部の A/B/C/D は以下の通り公式区分にマッピングされます:

- A → 目立った傷や汚れなし
- B → やや傷や汚れあり
- C → 傷や汚れあり
- D → 全体的に状態が悪い

(古物商前提のため「未使用」「未使用に近い」は使用しません)

${
  warnings.length > 0
    ? `## ⚠ 警告\n\n${warnings.map((w) => `- ${w}`).join("\n")}\n\n→ カテゴリ ID が空欄の行は、オークタウン側で取込前に手動で補完してください。\n`
    : ""
}
`;
    zip.file("README.txt", readme);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // exported ステータスへ更新（ベストエフォート）
    await supabase
      .from("products")
      .update({ status: "exported" })
      .in("id", productIds)
      .neq("status", "exported");

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="auctown_${today}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
