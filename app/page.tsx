"use client";

import {
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowGuide } from "@/components/home/WorkflowGuide";
import { BorderBeam } from "@/components/ui/border-beam";
import { Input } from "@/components/ui/input";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ShinyText } from "@/components/ui/shiny-text";
import { createClient } from "@/lib/supabase/client";
import { listProducts, type ProductListItem } from "@/lib/products";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "draft" | "ready" | "exported";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: "下書き" },
  { value: "ready", label: "完成" },
  { value: "exported", label: "出力済" },
];

function topCategory(hint: string | null | undefined): string | null {
  if (!hint) return null;
  // "食器・キッチン > 食器 > 洋食器 > 皿" → "食器・キッチン"
  const top = hint.split(/[>＞›/／]/)[0]?.trim();
  return top || null;
}

export default function Home() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  function showToast(message: string, tone: "success" | "error" = "success") {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 2500);
  }

  // === 検索・フィルタ ===
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fetchList = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    const result = await listProducts();
    if ("error" in result) setError(result.error);
    else {
      setProducts(result.products);
      setError(null);
    }
    if (showSpinner) setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!products) return;
    const hasDraft = products.some((p) => p.status === "draft");
    if (!hasDraft) return;

    const interval = setInterval(() => fetchList(), 3000);
    return () => clearInterval(interval);
  }, [products, fetchList]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: products?.length ?? 0,
      draft: 0,
      ready: 0,
      exported: 0,
    };
    products?.forEach((p) => {
      // 旧 "reviewing" は ready に丸める（互換性）
      const s = p.status === "reviewing" ? "ready" : (p.status as StatusFilter);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [products]);

  const topCategories = useMemo(() => {
    const set = new Set<string>();
    products?.forEach((p) => {
      const top = topCategory(p.category_hint);
      if (top) set.add(top);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return null;
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const effectiveStatus = p.status === "reviewing" ? "ready" : p.status;
      if (statusFilter !== "all" && effectiveStatus !== statusFilter)
        return false;
      if (categoryFilter && topCategory(p.category_hint) !== categoryFilter)
        return false;
      if (q) {
        const haystack = [
          p.title ?? "",
          p.category_hint ?? "",
          p.notes ?? "",
          p.storage_location ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, searchQuery, statusFilter, categoryFilter]);

  const draftCount = statusCounts.draft;

  function handleSelectChange(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (next) set.add(id);
      else set.delete(id);
      return set;
    });
  }

  function toggleSelectAll() {
    if (!filteredProducts) return;
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setExportError(null);
  }

  async function handleBulkRevertToDraft() {
    if (selectedIds.size === 0 || reverting) return;
    const ids = Array.from(selectedIds);
    const targets = products?.filter(
      (p) => ids.includes(p.id) && p.status !== "draft",
    );
    if (!targets || targets.length === 0) {
      showToast("選択した商品はすべて既に下書きです", "error");
      return;
    }

    setReverting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("products")
        .update({ status: "draft" })
        .in(
          "id",
          targets.map((p) => p.id),
        );
      if (error) {
        showToast(`下書きへ戻す処理失敗: ${error.message}`, "error");
        return;
      }
      showToast(`✓ ${targets.length} 件を下書きに戻しました`);
      exitSelectMode();
      fetchList(true);
    } finally {
      setReverting(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || deleting) return;
    const count = selectedIds.size;
    const ok = window.confirm(
      `選択した ${count} 件を削除しますか？\n\n写真も含めて完全に削除されます（元に戻せません）。`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/delete-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      showToast(
        `✓ ${data.deleted_products} 件削除しました（写真 ${data.deleted_photos} 枚）`,
      );
      exitSelectMode();
      fetchList(true);
    } catch (e) {
      showToast(
        `削除失敗: ${e instanceof Error ? e.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkMarkReady() {
    if (selectedIds.size === 0 || marking) return;
    const ids = Array.from(selectedIds);

    // 既に ready のものは対象外
    const targets = products?.filter(
      (p) => ids.includes(p.id) && p.status !== "ready",
    );
    if (!targets || targets.length === 0) {
      showToast("選択した商品はすべて既に完成しています", "error");
      return;
    }

    setMarking(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("products")
        .update({ status: "ready" })
        .in(
          "id",
          targets.map((p) => p.id),
        );

      if (error) {
        showToast(`完成にする処理失敗: ${error.message}`, "error");
        return;
      }
      showToast(`✓ ${targets.length} 件を完成にしました`);
      exitSelectMode();
      fetchList(true);
    } finally {
      setMarking(false);
    }
  }

  async function handleExport() {
    if (selectedIds.size === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `roka_export_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      exitSelectMode();
      fetchList(true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "エクスポート失敗");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 pb-32 animate-fade-up">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-500 bg-clip-text text-[28px] font-bold leading-tight tracking-tight text-transparent">
            listing-studio
          </h1>
          <p className="mt-1 text-sm font-medium text-zinc-700">
            3秒で、撮ったものが出品データになる。
          </p>
        </div>

        {!selectMode && products && products.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectMode(true)}
            className="rounded-full"
          >
            <CheckCircle2 className="size-4" />
            選択
          </Button>
        )}
      </header>

      {/* 4 ステップフロー + 次のアクションガイド */}
      {!selectMode && products && (
        <WorkflowGuide
          counts={{
            draft: statusCounts.draft,
            ready: statusCounts.ready,
            exported: statusCounts.exported,
            total: products.length,
          }}
          onShowDrafts={() => {
            setSearchQuery("");
            setCategoryFilter(null);
            setStatusFilter("draft");
          }}
          onStartExport={() => {
            setSearchQuery("");
            setCategoryFilter(null);
            setStatusFilter("ready");
            setSelectMode(true);
          }}
        />
      )}

      {!selectMode && products && products.length > 0 && (
        <div className="mb-4 space-y-3">
          {/* 検索バー */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="商品名・カテゴリ・備考で検索"
                className="h-11 rounded-full border-zinc-200 bg-white/80 pl-10 pr-10 text-sm shadow-sm backdrop-blur-sm placeholder:text-zinc-400 focus-visible:border-zinc-300 focus-visible:ring-zinc-300"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="検索をクリア"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fetchList(true)}
              disabled={refreshing}
              aria-label="更新"
              className="size-11 rounded-full bg-white/60 backdrop-blur-sm hover:bg-white"
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
            </Button>
          </div>

          {/* ステータスフィルタ */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((s) => {
              const count = statusCounts[s.value] ?? 0;
              const isActive = statusFilter === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  className={cn(
                    "group relative flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                    isActive
                      ? "bg-zinc-900 text-white shadow-lg shadow-zinc-900/20"
                      : "bg-white/70 text-zinc-700 ring-1 ring-zinc-200 backdrop-blur-sm hover:bg-white hover:ring-zinc-300",
                  )}
                >
                  <span>{s.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-zinc-100 text-zinc-500",
                    )}
                  >
                    <NumberTicker value={count} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* カテゴリフィルタ */}
          {topCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={cn(
                  "flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors",
                  categoryFilter === null
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-border bg-card text-foreground hover:bg-zinc-50",
                )}
              >
                すべてのカテゴリ
              </button>
              {topCategories.map((c) => {
                const isActive = c === categoryFilter;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoryFilter(isActive ? null : c)}
                    className={cn(
                      "flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors",
                      isActive
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-border bg-card text-foreground hover:bg-zinc-50",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {/* 件数表示 + フィルタ解除 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                <span className="font-semibold tabular-nums text-foreground">
                  <NumberTicker value={filteredProducts?.length ?? 0} />
                </span>
                <span> / {products.length} 件</span>
              </span>
              {draftCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                  <Loader2 className="size-3 animate-spin" />
                  <ShinyText>AI 推定中 {draftCount}</ShinyText>
                </span>
              )}
            </div>
            {(searchQuery ||
              statusFilter !== "all" ||
              categoryFilter !== null) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setCategoryFilter(null);
                }}
                className="text-primary underline-offset-2 hover:underline"
              >
                フィルタを解除
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          一覧の取得に失敗しました: {error}
        </div>
      )}

      {!error && products === null && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">読み込み中...</span>
        </div>
      )}

      {!error && products?.length === 0 && (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-12 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-zinc-900 to-zinc-700 text-white shadow-lg">
            <Plus className="size-6" />
          </div>
          <p className="text-base font-semibold tracking-tight">
            最初の商品を撮影しよう
          </p>
          <p className="mt-1.5 text-xs text-zinc-500">
            右下の <span className="font-semibold">＋</span>{" "}
            ボタンから連続撮影で始めます
          </p>
        </div>
      )}

      {filteredProducts && filteredProducts.length === 0 && products && products.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-zinc-100">
            <Search className="size-5 text-zinc-500" />
          </div>
          <p className="text-sm font-medium">検索条件に一致する商品がありません</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setCategoryFilter(null);
            }}
            className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
          >
            フィルタを解除する
          </button>
        </div>
      )}

      {filteredProducts && filteredProducts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              selectMode={selectMode}
              selected={selectedIds.has(p.id)}
              onSelectChange={handleSelectChange}
            />
          ))}
        </div>
      )}

      {/* 通常モード: FAB（Border Beam 装飾付き） */}
      {!selectMode && (
        <Link
          href="/products/new"
          aria-label="新しい商品を追加"
          className="group fixed bottom-6 right-6 flex size-16 items-center justify-center rounded-full bg-zinc-900 text-white shadow-2xl shadow-zinc-900/40 transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          <BorderBeam />
          <Plus className="relative size-7 transition-transform group-hover:rotate-90" />
        </Link>
      )}

      {/* 選択モード: 下部ツールバー */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-md">
          <div className="container mx-auto max-w-5xl px-4 py-3">
            {exportError && (
              <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {exportError}
              </div>
            )}
            <div className="space-y-2">
              {/* 上段: 選択件数 + 全選択/解除 + 削除 + 閉じる */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={exitSelectMode}
                  disabled={exporting || marking || deleting}
                >
                  <X className="size-5" />
                </Button>
                <div className="flex-1 text-sm">
                  <span className="font-semibold">{selectedIds.size}</span>
                  <span className="text-muted-foreground"> 件選択中</span>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="ml-3 text-xs text-primary underline-offset-2 hover:underline"
                    disabled={exporting || marking || deleting}
                  >
                    {filteredProducts &&
                    selectedIds.size === filteredProducts.length
                      ? "全て解除"
                      : "全て選択"}
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBulkRevertToDraft}
                  disabled={
                    selectedIds.size === 0 ||
                    reverting ||
                    deleting ||
                    marking ||
                    exporting
                  }
                  className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="下書きに戻す"
                  title="選択を下書きに戻す"
                >
                  {reverting ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || deleting || marking || exporting || reverting}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="選択を削除"
                >
                  {deleting ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Trash2 className="size-5" />
                  )}
                </Button>
              </div>

              {/* 下段: アクション 2 ボタン */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                  onClick={handleBulkMarkReady}
                  disabled={selectedIds.size === 0 || marking || exporting || deleting}
                >
                  {marking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {marking ? "処理中..." : "✓ 完成にする"}
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleExport}
                  disabled={selectedIds.size === 0 || exporting || marking || deleting}
                >
                  {exporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {exporting ? "出力中..." : "エクスポート"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <X className="size-5 flex-shrink-0" />
            )}
            <p className="text-sm font-semibold">{toast.message}</p>
          </div>
        </div>
      )}
    </main>
  );
}
