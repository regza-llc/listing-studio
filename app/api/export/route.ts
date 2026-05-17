import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const CSV_HEADER = [
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

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

function safeFolderName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 36);
}

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
        `id, created_at, status, title, category_hint, condition,
         storage_location, start_price, notes,
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
    const csvLines: string[] = [rowToCsv(CSV_HEADER)];

    for (const p of products) {
      const folder = safeFolderName(p.id);
      const photos = (p.product_photos ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index);

      const photoFilenames: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const ext = photo.storage_path.split(".").pop() ?? "jpg";
        const filename = `photo_${String(i + 1).padStart(2, "0")}.${ext}`;
        const localPath = `${folder}/${filename}`;

        const { data: blob, error: dlErr } = await supabase.storage
          .from("product-photos")
          .download(photo.storage_path);

        if (dlErr || !blob) {
          console.error(`[export] download失敗: ${photo.storage_path}`, dlErr);
          continue;
        }

        const buffer = Buffer.from(await blob.arrayBuffer());
        zip.file(localPath, buffer);
        photoFilenames.push(localPath);
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
    }

    const csvBody = csvLines.join("\r\n");
    const csvWithBom = "﻿" + csvBody;
    zip.file("okutown_import.csv", csvWithBom);

    const readme = `# listing-studio エクスポート

エクスポート日時: ${new Date().toISOString()}
対象商品数: ${products.length}

## フォルダ構成

- okutown_import.csv: 商品情報一覧（UTF-8 BOM・Excelで直接開けます）
- {商品ID}/photo_*.jpg: 商品ごとの写真フォルダ

## オークタウン取込みの想定手順

1. okutown_import.csv を Excel で開いて、カラム名をオークタウン公式テンプレに合わせる
2. 商品ID フォルダの写真をオークタウンの画像アップロードに使う
3. 不要な項目は削除して保存

※ CSV のカラムは v0.1 暫定です。5/20 MTG でおきちゃんに確認後、オークタウン公式仕様にマッピングします。
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
        "Content-Disposition": `attachment; filename="roka_export_${today}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
