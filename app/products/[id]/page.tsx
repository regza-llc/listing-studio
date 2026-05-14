"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  getPhotoSignedUrl,
  getProduct,
  updateProduct,
  type ProductDetail,
} from "@/lib/products";

type AiAnalysis = {
  title_candidates?: string[];
  category_hint?: string;
  condition?: string;
  storage_location_hint?: string;
  notes?: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: "下書き", tone: "bg-secondary text-secondary-foreground" },
  reviewing: { label: "AI 推定済", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  ready: { label: "完成", tone: "bg-green-500/10 text-green-700 dark:text-green-300" },
  exported: { label: "出力済", tone: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300" },
};

const CONDITIONS = ["A", "B", "C", "D"] as const;

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const [form, setForm] = useState({
    title: "",
    category_hint: "",
    condition: "",
    storage_location: "",
    start_price: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    const result = await getProduct(productId);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setProduct(result.product);
    setForm({
      title: result.product.title ?? "",
      category_hint: result.product.category_hint ?? "",
      condition: result.product.condition ?? "",
      storage_location: result.product.storage_location ?? "",
      start_price: result.product.start_price?.toString() ?? "",
      notes: result.product.notes ?? "",
    });
    setError(null);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  useEffect(() => {
    if (!product) return;
    const photos = [...product.product_photos].sort(
      (a, b) => a.order_index - b.order_index
    );

    let cancelled = false;
    Promise.all(
      photos.map(async (p) => {
        const url = await getPhotoSignedUrl(p.storage_path);
        return [p.id, url] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) {
        if (url) next[id] = url;
      }
      setThumbUrls(next);
    });

    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    if (!product || product.status !== "draft") return;
    const t = setInterval(fetchProduct, 3000);
    return () => clearInterval(t);
  }, [product, fetchProduct]);

  const ai = useMemo<AiAnalysis | null>(() => {
    if (!product?.ai_analysis) return null;
    return product.ai_analysis as AiAnalysis;
  }, [product]);

  const photosSorted = useMemo(() => {
    if (!product) return [];
    return [...product.product_photos].sort(
      (a, b) => a.order_index - b.order_index
    );
  }, [product]);

  const activePhoto = photosSorted[activePhotoIdx];
  const statusInfo = product
    ? (STATUS_LABEL[product.status] ?? STATUS_LABEL.draft)
    : STATUS_LABEL.draft;

  async function handleSave() {
    if (!product || saving) return;
    setSaving(true);

    const startPriceNum = form.start_price.trim()
      ? Number(form.start_price)
      : null;

    const result = await updateProduct(product.id, {
      title: form.title.trim() || null,
      category_hint: form.category_hint.trim() || null,
      condition: form.condition.trim() || null,
      storage_location: form.storage_location.trim() || null,
      start_price:
        startPriceNum !== null && Number.isFinite(startPriceNum)
          ? Math.round(startPriceNum)
          : null,
      notes: form.notes.trim() || null,
    });

    if ("error" in result) {
      setError(result.error);
    } else {
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      await fetchProduct();
    }
    setSaving(false);
  }

  async function handleReanalyze() {
    if (!product || reanalyzing) return;
    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchProduct();
    } catch (e) {
      setReanalyzeError(e instanceof Error ? e.message : "再推定失敗");
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleMarkReady() {
    if (!product) return;
    setSaving(true);
    await handleSave();
    await updateProduct(product.id, { status: "ready" });
    await fetchProduct();
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-12 flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" /> 戻る
          </Link>
        </Button>
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "商品が見つかりません"}
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 pb-32 space-y-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">
            {product.title ?? "未推定"}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusInfo.tone}`}
            >
              {statusInfo.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {photosSorted.length} 枚
            </span>
            {product.status === "draft" && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                <Loader2 className="size-3 animate-spin" />
                AI 推定中
              </span>
            )}
          </div>
        </div>
      </header>

      <Card className="p-3 gap-3">
        <div className="aspect-square bg-muted rounded-md overflow-hidden relative">
          {activePhoto && thumbUrls[activePhoto.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrls[activePhoto.id]}
              alt="商品画像"
              className="size-full object-contain"
            />
          ) : (
            <div className="size-full flex items-center justify-center text-muted-foreground">
              <ImageOff className="size-8" />
            </div>
          )}
        </div>

        {photosSorted.length > 1 && (
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {photosSorted.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePhotoIdx(idx)}
                className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                  idx === activePhotoIdx
                    ? "border-primary"
                    : "border-transparent"
                }`}
              >
                {thumbUrls[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrls[p.id]}
                    alt={`${idx + 1}枚目`}
                    className="size-16 object-cover"
                  />
                ) : (
                  <div className="size-16 bg-muted" />
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {ai && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="size-4 text-blue-500" /> AI 推定結果
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              {reanalyzing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              再 AI 推定
            </Button>
          </div>

          {reanalyzeError && (
            <div className="text-xs text-destructive flex gap-1">
              <AlertCircle className="size-3.5 mt-0.5" />
              {reanalyzeError}
            </div>
          )}

          {ai.title_candidates && ai.title_candidates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">タイトル候補</p>
              <div className="flex flex-wrap gap-1.5">
                {ai.title_candidates.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, title: t }))}
                    className="px-2 py-1 rounded-md text-xs bg-secondary hover:bg-secondary/70 text-secondary-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {ai.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">所見</p>
              <p className="text-xs leading-relaxed">{ai.notes}</p>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-semibold">編集</h2>

        <div className="space-y-1.5">
          <Label htmlFor="title">商品タイトル</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="例: ウェッジウッド 食器 6枚セット"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">カテゴリ</Label>
          <Input
            id="category"
            value={form.category_hint}
            onChange={(e) =>
              setForm((f) => ({ ...f, category_hint: e.target.value }))
            }
            placeholder="例: 食器・キッチン > 食器 > 洋食器 > 皿"
          />
        </div>

        <div className="space-y-1.5">
          <Label>商品の状態</Label>
          <RadioGroup
            value={form.condition || ""}
            onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}
            className="flex flex-wrap gap-3"
          >
            {CONDITIONS.map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <RadioGroupItem value={c} id={`cond-${c}`} />
                <Label htmlFor={`cond-${c}`} className="cursor-pointer text-sm">
                  {c} ランク
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="storage">しまう場所</Label>
            <Input
              id="storage"
              value={form.storage_location}
              onChange={(e) =>
                setForm((f) => ({ ...f, storage_location: e.target.value }))
              }
              placeholder="例: 棚A-3"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start_price">開始価格（円）</Label>
            <Input
              id="start_price"
              type="number"
              inputMode="numeric"
              value={form.start_price}
              onChange={(e) =>
                setForm((f) => ({ ...f, start_price: e.target.value }))
              }
              placeholder="例: 4500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">備考</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="気になる傷・付属品の有無など"
            rows={3}
          />
        </div>

        {savedAt && (
          <p className="text-xs text-muted-foreground">
            最終保存: {savedAt}
          </p>
        )}
      </Card>

      <div className="fixed bottom-0 inset-x-0 bg-background border-t border-border">
        <div className="container mx-auto max-w-3xl px-4 py-3 flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            保存
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={handleMarkReady}
            disabled={saving || product.status === "ready"}
          >
            {product.status === "ready" ? (
              <>
                <CheckCircle2 className="size-4" /> 完成済み
              </>
            ) : (
              <>レビュー完了</>
            )}
          </Button>
        </div>
      </div>
    </main>
  );
}
