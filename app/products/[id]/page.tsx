"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  TrendingUp,
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
  draft: {
    label: "下書き",
    tone: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  },
  // 旧 reviewing は ready と同等に表示（互換性のため）
  reviewing: {
    label: "完成",
    tone: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  },
  ready: {
    label: "完成",
    tone: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  },
  exported: {
    label: "出力済",
    tone: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  },
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
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);

  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [researchingPrice, setResearchingPrice] = useState(false);
  const [priceResearchError, setPriceResearchError] = useState<string | null>(
    null,
  );

  function showToast(message: string, tone: "success" | "info" = "success") {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2500);
  }

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
      showToast(`保存失敗: ${result.error}`, "info");
    } else {
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      showToast("✓ 変更を保存しました");
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

  async function handleResearchPrice() {
    if (!product || researchingPrice) return;
    if (!form.title.trim()) {
      setPriceResearchError(
        "先に商品タイトルを設定してください（AI 推定 or 手動入力）",
      );
      return;
    }
    setResearchingPrice(true);
    setPriceResearchError(null);
    try {
      const res = await fetch("/api/research-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: product.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await fetchProduct();
      showToast("✓ 相場リサーチ完了");
    } catch (e) {
      setPriceResearchError(
        e instanceof Error ? e.message : "相場リサーチ失敗",
      );
    } finally {
      setResearchingPrice(false);
    }
  }

  function adoptPrice(value: number | null) {
    if (value == null) return;
    setForm((f) => ({ ...f, start_price: String(value) }));
    showToast(`✓ 開始価格に ¥${value.toLocaleString()} を採用`);
  }

  async function handleRevertToDraft() {
    if (!product || reverting || product.status === "draft") return;
    setReverting(true);
    const result = await updateProduct(product.id, { status: "draft" });
    if ("error" in result) {
      showToast(`下書きへ戻す処理失敗: ${result.error}`, "info");
    } else {
      showToast("✓ 下書きに戻しました");
      await fetchProduct();
    }
    setReverting(false);
  }

  async function handleDelete() {
    if (!product || deleting) return;
    const ok = window.confirm(
      `この商品を削除しますか？\n\n写真も含めて完全に削除されます（元に戻せません）。`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/delete-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: [product.id] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      showToast("✓ 削除しました — ホームへ戻ります");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 700);
    } catch (e) {
      showToast(
        `削除失敗: ${e instanceof Error ? e.message : "Unknown error"}`,
        "info",
      );
      setDeleting(false);
    }
  }

  async function handleMarkReady() {
    if (!product) return;
    setSaving(true);

    const startPriceNum = form.start_price.trim()
      ? Number(form.start_price)
      : null;

    const saveResult = await updateProduct(product.id, {
      title: form.title.trim() || null,
      category_hint: form.category_hint.trim() || null,
      condition: form.condition.trim() || null,
      storage_location: form.storage_location.trim() || null,
      start_price:
        startPriceNum !== null && Number.isFinite(startPriceNum)
          ? Math.round(startPriceNum)
          : null,
      notes: form.notes.trim() || null,
      status: "ready",
    });

    if ("error" in saveResult) {
      setError(saveResult.error);
      showToast(`完了処理失敗: ${saveResult.error}`, "info");
      setSaving(false);
      return;
    }

    showToast("✓ 仕分け完了 — ホームへ戻ります");
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 700);
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
        <Button asChild variant="ghost" size="icon" disabled={deleting}>
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
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={deleting || saving}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="この商品を削除"
        >
          {deleting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Trash2 className="size-5" />
          )}
        </Button>
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

      {/* 相場リサーチカード */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="size-4 text-emerald-600" /> 相場リサーチ
          </h2>
          {product.price_researched_at && (
            <span className="text-[10px] text-muted-foreground">
              最終: {new Date(product.price_researched_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {priceResearchError && (
          <div className="flex gap-1 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5" />
            {priceResearchError}
          </div>
        )}

        {product.suggested_price_min || product.suggested_price_max ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-emerald-700">想定相場帯</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-900 tabular-nums">
                  ¥{product.suggested_price_min?.toLocaleString() ?? "?"}
                </span>
                <span className="text-emerald-700">〜</span>
                <span className="text-2xl font-bold text-emerald-900 tabular-nums">
                  ¥{product.suggested_price_max?.toLocaleString() ?? "?"}
                </span>
              </div>
              {product.price_research_summary && (
                <p className="mt-2 text-xs leading-relaxed text-emerald-900/80">
                  {product.price_research_summary}
                </p>
              )}
            </div>

            {/* 採用ボタン */}
            <div className="flex flex-wrap gap-2">
              {product.suggested_price_min != null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adoptPrice(product.suggested_price_min)}
                >
                  下限 ¥{product.suggested_price_min.toLocaleString()} を採用
                </Button>
              )}
              {product.suggested_price_min != null &&
                product.suggested_price_max != null && (
                  <Button
                    size="sm"
                    onClick={() =>
                      adoptPrice(
                        Math.round(
                          (product.suggested_price_min! +
                            product.suggested_price_max!) /
                            2,
                        ),
                      )
                    }
                  >
                    中央値 ¥
                    {Math.round(
                      (product.suggested_price_min +
                        product.suggested_price_max) /
                        2,
                    ).toLocaleString()}{" "}
                    を採用
                  </Button>
                )}
              {product.suggested_price_max != null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adoptPrice(product.suggested_price_max)}
                >
                  上限 ¥{product.suggested_price_max.toLocaleString()} を採用
                </Button>
              )}
            </div>

            {/* 出典URL */}
            {Array.isArray(product.price_research_sources) &&
              product.price_research_sources.length > 0 && (
                <details className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    参照したソース（{product.price_research_sources.length}件）
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {product.price_research_sources.map((s, i) => (
                      <li key={i} className="truncate">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="size-3 flex-shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

            <Button
              size="sm"
              variant="ghost"
              onClick={handleResearchPrice}
              disabled={researchingPrice}
              className="w-full"
            >
              {researchingPrice ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <TrendingUp className="size-3.5" />
              )}
              再リサーチ
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              ヤフオク・メルカリ等の落札相場を AI が Web 検索して取得します（3〜5秒）
            </p>
            <Button
              size="lg"
              onClick={handleResearchPrice}
              disabled={researchingPrice || !form.title.trim()}
              className="w-full"
            >
              {researchingPrice ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> リサーチ中...
                </>
              ) : (
                <>
                  <TrendingUp className="size-4" /> 相場を調べる
                </>
              )}
            </Button>
            {!form.title.trim() && (
              <p className="text-[10px] text-muted-foreground">
                先に商品タイトルを設定してください
              </p>
            )}
          </div>
        )}
      </Card>

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

      <div className="fixed bottom-0 inset-x-0 bg-background/95 border-t border-border backdrop-blur-md">
        <div className="container mx-auto max-w-3xl px-4 py-3 space-y-2">
          {product.status !== "draft" && (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleRevertToDraft}
                disabled={reverting || saving}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
              >
                {reverting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                下書きに戻す
              </button>
            </div>
          )}
          {product.status !== "ready" && (
            <p className="text-center text-[11px] text-muted-foreground">
              <span className="font-semibold">変更を保存</span>{" "}
              ＝編集内容のみ保存（ステータスはそのまま）/{" "}
              <span className="font-semibold">仕分け完了</span>{" "}
              ＝保存してホームへ戻る（CSV書き出し対象に）
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              変更を保存
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={handleMarkReady}
              disabled={saving || product.status === "ready"}
            >
              {product.status === "ready" ? (
                <>
                  <CheckCircle2 className="size-4" /> 仕分け完了済み
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  ✓ 仕分け完了 → ホームへ
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-[80] mx-auto max-w-md px-4">
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg backdrop-blur-md ${
              toast.tone === "success"
                ? "bg-emerald-500 text-white"
                : "bg-zinc-900 text-white"
            }`}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 className="size-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="size-5 flex-shrink-0" />
            )}
            <p className="text-sm font-semibold">{toast.message}</p>
          </div>
        </div>
      )}
    </main>
  );
}
