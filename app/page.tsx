"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "@/components/product-card/ProductCard";
import { Button } from "@/components/ui/button";
import { listProducts, type ProductListItem } from "@/lib/products";

export default function Home() {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

    const interval = setInterval(() => {
      fetchList();
    }, 3000);
    return () => clearInterval(interval);
  }, [products, fetchList]);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">listing-studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          v0.1 ミニマル MVP — 動作確認版（2026-05-22 判断ゲート）
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          一覧の取得に失敗しました: {error}
        </div>
      )}

      {!error && products === null && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">読み込み中...</span>
        </div>
      )}

      {!error && products?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            まだ商品がありません。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            右下の「+」ボタンから撮影を始めてください。
          </p>
        </div>
      )}

      {products && products.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {products.length} 件の下書き
              {products.some((p) => p.status === "draft") && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <Loader2 className="size-3 animate-spin" />
                  AI 推定中...
                </span>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchList(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
              更新
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}

      <Button
        asChild
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg p-0"
        aria-label="新しい商品を追加"
      >
        <Link href="/products/new">
          <Plus className="size-6" />
        </Link>
      </Button>
    </main>
  );
}
