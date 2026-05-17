import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    // 1. 削除対象商品の写真パスを取得
    const { data: photos, error: photosErr } = await supabase
      .from("product_photos")
      .select("storage_path")
      .in("product_id", productIds);

    if (photosErr) {
      return NextResponse.json(
        { error: `写真パス取得失敗: ${photosErr.message}` },
        { status: 500 },
      );
    }

    // 2. Storage から写真ファイルを削除
    const storagePaths = (photos ?? []).map((p) => p.storage_path);
    if (storagePaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from("product-photos")
        .remove(storagePaths);
      if (storageErr) {
        console.error("[delete] Storage削除失敗:", storageErr);
        // Storage削除失敗してもDB側の削除は続行（孤児ファイルは後で掃除可能）
      }
    }

    // 3. product_photos を削除
    const { error: photosDelErr } = await supabase
      .from("product_photos")
      .delete()
      .in("product_id", productIds);
    if (photosDelErr) {
      return NextResponse.json(
        { error: `写真レコード削除失敗: ${photosDelErr.message}` },
        { status: 500 },
      );
    }

    // 4. products を削除
    const { error: productsDelErr } = await supabase
      .from("products")
      .delete()
      .in("id", productIds);
    if (productsDelErr) {
      return NextResponse.json(
        { error: `商品削除失敗: ${productsDelErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      deleted_products: productIds.length,
      deleted_photos: storagePaths.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[delete] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
