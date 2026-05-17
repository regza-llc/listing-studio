"use client";

import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CameraCapture,
  type CapturedPhoto,
} from "@/components/camera/CameraCapture";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProduct, saveDraftProduct } from "@/lib/products";
import type { ProductDetail } from "@/lib/products";
import { createClient } from "@/lib/supabase/client";

type Phase =
  | { kind: "shooting" }
  | { kind: "saving" }
  | { kind: "analyzing"; productId: string; elapsed: number }
  | { kind: "result"; productId: string; product: ProductDetail }
  | { kind: "error"; message: string };

const ANALYZE_EXPECTED = 15;

export default function WorthItPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "shooting" });

  // analyzing 中の経過秒数
  useEffect(() => {
    if (phase.kind !== "analyzing") return;
    const interval = setInterval(() => {
      setPhase((p) =>
        p.kind === "analyzing" ? { ...p, elapsed: p.elapsed + 1 } : p,
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [phase.kind]);

  // analyzing 中は product のステータス変化を polling
  useEffect(() => {
    if (phase.kind !== "analyzing") return;
    const id = phase.productId;
    const t = setInterval(async () => {
      const result = await getProduct(id);
      if ("error" in result) return;
      // status が ready になったら結果表示へ
      if (
        result.product.status === "ready" ||
        result.product.status === "reviewing"
      ) {
        setPhase({ kind: "result", productId: id, product: result.product });
        clearInterval(t);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [phase.kind]);

  async function handleAnalyze(photos: CapturedPhoto[]) {
    if (photos.length === 0) return false;
    setPhase({ kind: "saving" });
    const result = await saveDraftProduct(
      photos.map((p) => ({ processed: p.processed })),
    );
    if ("error" in result) {
      setPhase({ kind: "error", message: result.error });
      return false;
    }
    // AI 分析トリガー（バックグラウンド）
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: result.id }),
    }).catch((e) => console.error("[worth-it] analyze trigger failed:", e));

    setPhase({ kind: "analyzing", productId: result.id, elapsed: 0 });
    return true;
  }

  async function handleDiscard() {
    if (phase.kind !== "result") return;
    const id = phase.productId;
    const ok = window.confirm(
      "この査定結果を破棄します（写真も含めて削除されます）。よろしいですか？",
    );
    if (!ok) return;

    try {
      await fetch("/api/delete-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: [id] }),
      });
      setPhase({ kind: "shooting" });
    } catch (e) {
      console.error("[worth-it] discard failed:", e);
    }
  }

  function handleAccept() {
    if (phase.kind !== "result") return;
    // すでに DB に保存されているので、詳細画面に遷移するだけ
    router.push(`/products/${phase.productId}`);
  }

  function handleReshoot() {
    if (phase.kind === "result" || phase.kind === "error") {
      // 既存の保存データを破棄して再撮影
      if (phase.kind === "result") {
        const id = phase.productId;
        const supabase = createClient();
        // ベストエフォートで削除
        supabase.from("products").delete().eq("id", id).then();
        fetch("/api/delete-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_ids: [id] }),
        }).catch(() => {});
      }
    }
    setPhase({ kind: "shooting" });
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 pb-32">
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="bg-gradient-to-br from-emerald-700 to-teal-600 bg-clip-text text-xl font-bold tracking-tight text-transparent">
            🔍 仕入れ前査定
          </h1>
          <p className="text-[11px] text-zinc-500">
            出品せずに「いくらで売れる？」を 15 秒で判定
          </p>
        </div>
      </header>

      {/* 撮影フェーズ */}
      {phase.kind === "shooting" && (
        <CameraCapture
          onComplete={handleAnalyze}
        />
      )}

      {/* 保存中 / 分析中 */}
      {(phase.kind === "saving" || phase.kind === "analyzing") && (
        <Card className="space-y-4 p-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-violet-100">
            <Sparkles className="size-7 animate-pulse text-sky-600" />
          </div>
          <div>
            <p className="text-lg font-semibold">
              {phase.kind === "saving"
                ? "写真をアップロード中..."
                : "AI が査定中..."}
            </p>
            {phase.kind === "analyzing" && (
              <p className="mt-1 text-xs tabular-nums text-zinc-500">
                {phase.elapsed}s / 約 {ANALYZE_EXPECTED}s
              </p>
            )}
          </div>
          {phase.kind === "analyzing" && (
            <div className="mx-auto h-2 w-full max-w-xs overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-500"
                style={{
                  width: `${Math.min(100, (phase.elapsed / ANALYZE_EXPECTED) * 100)}%`,
                }}
              />
            </div>
          )}
        </Card>
      )}

      {/* 結果表示 */}
      {phase.kind === "result" && <WorthItResult product={phase.product} />}

      {/* 結果のアクション */}
      {phase.kind === "result" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md">
          <div className="container mx-auto max-w-3xl space-y-2 px-4 py-3">
            <p className="text-center text-[11px] text-muted-foreground">
              この査定結果を保存して本登録するか、破棄して終了します
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={handleDiscard}
              >
                破棄する
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleReshoot}
              >
                <RotateCcw className="size-4" />
                撮り直す
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleAccept}
              >
                <Check className="size-4" />
                本登録する
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* エラー */}
      {phase.kind === "error" && (
        <Card className="space-y-3 border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <p className="font-semibold">査定に失敗しました</p>
          </div>
          <p className="text-sm">{phase.message}</p>
          <Button onClick={handleReshoot} className="w-full">
            <Camera className="size-4" />
            やり直す
          </Button>
        </Card>
      )}
    </main>
  );
}

function WorthItResult({ product }: { product: ProductDetail }) {
  const min = product.suggested_price_min;
  const max = product.suggested_price_max;
  const median =
    min != null && max != null ? Math.round((min + max) / 2) : null;
  const confidence = product.price_confidence ?? 0.5;
  const stars = Math.round(confidence * 5);
  const confLabel =
    confidence >= 0.8
      ? "高"
      : confidence >= 0.5
        ? "中"
        : confidence >= 0.3
          ? "低"
          : "推測";

  const comps = Array.isArray(product.sold_comps) ? product.sold_comps : [];

  return (
    <div className="space-y-4">
      {/* 商品名 */}
      <Card className="p-4">
        <p className="text-xs text-zinc-500">識別結果</p>
        <p className="mt-1 text-lg font-bold">
          {product.title ?? "（判別不能）"}
        </p>
        {product.yahoo_category_path && (
          <p className="mt-1 text-[11px] text-zinc-500">
            {product.yahoo_category_path}
          </p>
        )}
        {product.condition && (
          <p className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs">
            状態: {product.condition} ランク
          </p>
        )}
      </Card>

      {/* 想定相場（メイン） */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase opacity-80">
              想定落札価格
            </p>
            <span
              className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold"
              title={`信頼度 ${confLabel} (${Math.round(confidence * 100)}%)`}
            >
              <span aria-hidden>{"★".repeat(stars)}</span> 信頼度{confLabel}
            </span>
          </div>
          {median != null && (
            <p className="mt-2 text-4xl font-bold tabular-nums">
              ¥{median.toLocaleString()}
            </p>
          )}
          {min != null && max != null && (
            <p className="mt-1 text-sm opacity-90 tabular-nums">
              レンジ ¥{min.toLocaleString()} 〜 ¥{max.toLocaleString()}
            </p>
          )}
          {product.price_research_summary && (
            <p className="mt-3 text-xs leading-relaxed opacity-90">
              {product.price_research_summary}
            </p>
          )}
        </div>

        {/* 落札事例 */}
        {comps.length > 0 && (
          <div className="border-t border-zinc-200 p-3">
            <p className="mb-2 text-[11px] font-semibold text-zinc-600">
              <TrendingUp className="mr-1 inline size-3" />
              根拠の落札事例 {comps.length} 件
            </p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {comps.slice(0, 8).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
                >
                  <p className="line-clamp-1 text-[11px] text-zinc-700">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </p>
                  <span className="flex-shrink-0 text-xs font-bold tabular-nums text-emerald-700">
                    ¥{c.price.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
