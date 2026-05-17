"use client";

import {
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { listProducts, type ProductListItem } from "@/lib/products";

export default function Home() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [marking, setMarking] = useState(false);
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

  const draftCount = useMemo(
    () => products?.filter((p) => p.status === "draft").length ?? 0,
    [products],
  );
  const readyCount = useMemo(
    () => products?.filter((p) => p.status === "ready").length ?? 0,
    [products],
  );

  function handleSelectChange(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (next) set.add(id);
      else set.delete(id);
      return set;
    });
  }

  function toggleSelectAll() {
    if (!products) return;
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setExportError(null);
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
    <main className="container mx-auto max-w-5xl px-4 py-6 pb-32">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">listing-studio</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            撮って AI に判別してもらう出品ワークフロー
          </p>
        </div>

        {!selectMode && products && products.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectMode(true)}
          >
            <CheckCircle2 className="size-4" />
            選択
          </Button>
        )}
      </header>

      {!selectMode && products && products.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <Badge variant="neutral">{products.length} 件</Badge>
          {draftCount > 0 && (
            <Badge variant="info" className="gap-1">
              <Loader2 className="size-3 animate-spin" />
              AI 推定中 {draftCount}
            </Badge>
          )}
          {readyCount > 0 && (
            <Badge variant="success">完成 {readyCount}</Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => fetchList(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            更新
          </Button>
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
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-zinc-100">
            <Plus className="size-5 text-zinc-500" />
          </div>
          <p className="text-sm font-medium">まだ商品がありません</p>
          <p className="mt-1 text-xs text-muted-foreground">
            右下の「+」ボタンから撮影を始めてください
          </p>
        </div>
      )}

      {products && products.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
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

      {/* 通常モード: FAB */}
      {!selectMode && (
        <Button
          asChild
          size="lg"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full p-0 shadow-xl"
          aria-label="新しい商品を追加"
        >
          <Link href="/products/new">
            <Plus className="size-6" />
          </Link>
        </Button>
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
                    {products && selectedIds.size === products.length
                      ? "全て解除"
                      : "全て選択"}
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || deleting || marking || exporting}
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
