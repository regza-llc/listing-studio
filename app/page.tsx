"use client";

import {
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card/ProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProducts, type ProductListItem } from "@/lib/products";

export default function Home() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={exitSelectMode}
                disabled={exporting}
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
                  disabled={exporting}
                >
                  {products && selectedIds.size === products.length
                    ? "全て解除"
                    : "全て選択"}
                </button>
              </div>
              <Button
                size="lg"
                onClick={handleExport}
                disabled={selectedIds.size === 0 || exporting}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {exporting ? "エクスポート中..." : "エクスポート"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
