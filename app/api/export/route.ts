import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { applyFrame } from "@/lib/frame-overlay";
import { isFrameKey } from "@/lib/frame-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const CARRIER_LABEL: Record<string, string> = {
  japan_post: "日本郵便",
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productIds = body?.product_ids as string[] | undefined;
    const frame = isFrameKey(body?.frame) ? body.frame : "none";

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
         storage_location, start_price, notes, shipping_method_id,
         shipping_method:shipping_methods ( carrier, name, size ),
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
    const warnings: string[] = [];

    for (const p of products) {
      const photos = (p.product_photos ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .slice(0, 10);

      const productFolder = `product-${p.id}`;
      const photoFilenames: string[] = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        const { data: blob, error: dlErr } = await supabase.storage
          .from("product-photos")
          .download(photo.storage_path);

        if (dlErr || !blob) {
          warnings.push(`商品 ${p.id} の画像 ${i + 1} がダウンロード失敗`);
          continue;
        }

        let buffer: Buffer = Buffer.from(await blob.arrayBuffer());
        let ext = photo.storage_path.split(".").pop() ?? "jpg";

        // 1 枚目（サムネ）にだけ枠線フレームを合成（Option B・非破壊）
        if (i === 0 && frame !== "none") {
          try {
            buffer = await applyFrame(buffer, frame);
            ext = "jpg"; // applyFrame は常に JPEG を返す
          } catch (e) {
            warnings.push(
              `商品 ${p.id} の 1 枚目フレーム合成に失敗（元画像で出力）`,
            );
            console.error("[export] applyFrame failed:", e);
          }
        }

        const filename = `${String(i + 1).padStart(2, "0")}.${ext}`;
        zip.file(`${productFolder}/${filename}`, buffer);
        photoFilenames.push(filename);
      }

      const sm = (p as { shipping_method?: { carrier?: string; name?: string; size?: string | null } })
        .shipping_method;
      const shippingLabel = sm
        ? sm.size
          ? `${CARRIER_LABEL[sm.carrier ?? ""] ?? sm.carrier} / ${sm.name}（${sm.size}）`
          : `${CARRIER_LABEL[sm.carrier ?? ""] ?? sm.carrier} / ${sm.name}`
        : null;

      const metadata = {
        product_id: p.id,
        created_at: p.created_at,
        status: p.status,
        title: p.title,
        category_hint: p.category_hint,
        condition: p.condition,
        storage_location: p.storage_location,
        start_price: p.start_price,
        shipping_method: shippingLabel,
        notes: p.notes,
        photos: photoFilenames,
      };

      zip.file(
        `${productFolder}/metadata.json`,
        JSON.stringify(metadata, null, 2),
      );
    }

    const readme = `# listing-studio v0.2 エクスポート ZIP

エクスポート日時: ${new Date().toISOString()}
対象商品数: ${products.length}

## ファイル構成

各商品ごとに以下のフォルダが生成されます:

  product-{商品ID}/
    ├── 01.jpg, 02.jpg, ... (撮影写真・最大 10 枚)
    └── metadata.json       (商品メタデータ)

## metadata.json のスキーマ

- product_id        : 商品 ID
- created_at        : 作成日時 (ISO 8601)
- status            : ステータス (draft / ready / exported)
- title             : 商品タイトル (任意・空欄の場合は Claude 側で生成)
- category_hint     : カテゴリヒント
- condition         : 商品の状態 (新品同様 / 美品 / 良品 / 可 / 難あり)
- storage_location  : しまう場所
- start_price       : 開始価格（円・任意）
- shipping_method   : 配送方法 (キャリア / 商品名 / サイズ)
- notes             : 備考
- photos            : 写真ファイル名の配列

## Claude による仕訳・出品データ生成

この ZIP をそのまま Claude（外部 AI）に投入することで:
- 商品タイトルの生成
- ヤフオク / オークタウン用カテゴリ ID の判定
- 開始価格の推定
- オークタウン CSV の生成

までを Claude 側で実行できます。
${
  warnings.length > 0
    ? `\n## ⚠ 警告\n\n${warnings.map((w) => `- ${w}`).join("\n")}\n`
    : ""
}
`;
    zip.file("README.txt", readme);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

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
        "Content-Disposition": `attachment; filename="listing-studio_${today}.zip"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
