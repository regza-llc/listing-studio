import { NextRequest, NextResponse } from "next/server";
import {
  AUCTOWN_CSV_HEADER,
  buildAuctownImageFilename,
  buildAuctownRow,
  type AuctownDynamicRow,
  type AuctownFixedRow,
  type AuctownRowWarning,
} from "@/lib/auctown";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type PreviewRow = {
  product_id: string;
  dynamic: AuctownDynamicRow;
  fixed: AuctownFixedRow;
  warnings: AuctownRowWarning[];
  cells: string[];
};

export type PreviewResponse = {
  header: readonly string[];
  rows: PreviewRow[];
  total_warnings: number;
};

/**
 * 指定 product_ids の CSV 行プレビューを JSON で返す。
 * ZIP 生成・ステータス更新は行わない（軽量・冪等）。
 */
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
        `id, title, description, notes, condition, start_price,
         suggested_price_min, yahoo_category_id, yahoo_category_path,
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

    // product_ids の順序を保ったまま並べる
    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderedProducts = productIds
      .map((id) => productMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p != null);

    const rows: PreviewRow[] = orderedProducts.map((p) => {
      const photos = (p.product_photos ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .slice(0, 10);

      const imageFilenames = photos.map((photo, i) => {
        const ext = photo.storage_path.split(".").pop() ?? "jpg";
        return buildAuctownImageFilename(p.id, i, ext);
      });

      const row = buildAuctownRow(p, imageFilenames);
      return {
        product_id: p.id,
        dynamic: row.dynamic,
        fixed: row.fixed,
        warnings: row.warnings,
        cells: row.cells,
      };
    });

    const totalWarnings = rows.reduce((sum, r) => sum + r.warnings.length, 0);

    const response: PreviewResponse = {
      header: AUCTOWN_CSV_HEADER,
      rows,
      total_warnings: totalWarnings,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[export/preview] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
