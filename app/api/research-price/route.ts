import { NextRequest, NextResponse } from "next/server";
import { researchProductPrice } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = body?.product_id as string | undefined;
    const additionalPrompt = (body?.additional_prompt as string | undefined)?.trim() || null;

    if (!productId) {
      return NextResponse.json(
        { error: "product_id required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: product, error: fetchErr } = await supabase
      .from("products")
      .select("id, title, category_hint, condition, notes")
      .eq("id", productId)
      .single();

    if (fetchErr || !product) {
      return NextResponse.json(
        { error: fetchErr?.message ?? "商品が見つかりません" },
        { status: 404 },
      );
    }

    if (!product.title) {
      return NextResponse.json(
        {
          error:
            "商品タイトルが未設定です。先に AI 推定を実行してから相場リサーチしてください。",
        },
        { status: 400 },
      );
    }

    const started = Date.now();
    const result = await researchProductPrice({
      title: product.title,
      category_hint: product.category_hint,
      condition: product.condition,
      notes: product.notes,
      additional_prompt: additionalPrompt,
    });
    const elapsedMs = Date.now() - started;

    const { error: updateErr } = await supabase
      .from("products")
      .update({
        suggested_price_min: result.min,
        suggested_price_max: result.max,
        price_research_summary: result.summary,
        price_research_sources: result.sources,
        price_researched_at: new Date().toISOString(),
        sold_comps: result.comps,
        price_confidence: result.confidence,
      })
      .eq("id", productId);

    if (updateErr) {
      console.error("[research-price] DB update failed:", updateErr);
    }

    return NextResponse.json({
      ok: true,
      product_id: productId,
      elapsed_ms: elapsedMs,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[research-price] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
