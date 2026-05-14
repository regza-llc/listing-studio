import { NextRequest, NextResponse } from "next/server";
import { analyzeProductImages } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PHOTOS_TO_ANALYZE = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = body?.product_id as string | undefined;

    if (!productId) {
      return NextResponse.json(
        { error: "product_id required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: photos, error: photosErr } = await supabase
      .from("product_photos")
      .select("storage_path, order_index")
      .eq("product_id", productId)
      .order("order_index", { ascending: true })
      .limit(MAX_PHOTOS_TO_ANALYZE);

    if (photosErr) {
      return NextResponse.json({ error: photosErr.message }, { status: 500 });
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: "No photos found for product" },
        { status: 404 }
      );
    }

    const imageBase64List: string[] = [];
    for (const photo of photos) {
      const { data, error } = await supabase.storage
        .from("product-photos")
        .download(photo.storage_path);

      if (error || !data) {
        console.error(
          `[analyze] download failed: ${photo.storage_path}`,
          error
        );
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      imageBase64List.push(buffer.toString("base64"));
    }

    if (imageBase64List.length === 0) {
      return NextResponse.json(
        { error: "Failed to download any images" },
        { status: 500 }
      );
    }

    const started = Date.now();
    const analysis = await analyzeProductImages(imageBase64List);
    const elapsedMs = Date.now() - started;

    const firstTitle =
      Array.isArray(analysis?.title_candidates) &&
      analysis.title_candidates.length > 0
        ? analysis.title_candidates[0]
        : null;

    const { error: updateErr } = await supabase
      .from("products")
      .update({
        title: firstTitle,
        category_hint: analysis?.category_hint ?? null,
        condition: analysis?.condition ?? null,
        storage_location: analysis?.storage_location_hint ?? null,
        ai_analysis: analysis as unknown as Record<string, unknown>,
        status: "reviewing",
      })
      .eq("id", productId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      product_id: productId,
      photos_analyzed: imageBase64List.length,
      elapsed_ms: elapsedMs,
      analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[analyze] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
