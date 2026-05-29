"use client";

import { AlertTriangle, ImageOff } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { ProductListItem } from "@/lib/products";
import { daysSince, STALE_TIERS } from "@/lib/death-pile";
import { useLazySignedUrl } from "@/lib/use-lazy-signed-url";
import { cn } from "@/lib/utils";

const DAILY_TARGET = 100; // 1日100件目標
const STALE_DAYS_THRESHOLD = STALE_TIERS.warn; // 7日以上未出品で赤フラグ

type Column = {
  key: "draft" | "ready" | "exported";
  label: string;
  emoji: string;
  accentColor: string;
};

const COLUMNS: Column[] = [
  {
    key: "draft",
    label: "下書き",
    emoji: "📷",
    accentColor: "border-zinc-300 bg-zinc-50",
  },
  {
    key: "ready",
    label: "完成・出品待ち",
    emoji: "✓",
    accentColor: "border-emerald-300 bg-emerald-50",
  },
  {
    key: "exported",
    label: "出力済",
    emoji: "📦",
    accentColor: "border-sky-300 bg-sky-50",
  },
];

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function KanbanView({ products }: { products: ProductListItem[] }) {
  const grouped = useMemo(() => {
    const result: Record<Column["key"], ProductListItem[]> = {
      draft: [],
      ready: [],
      exported: [],
    };
    products.forEach((p) => {
      const s =
        p.status === "reviewing"
          ? "ready"
          : (p.status as Column["key"]);
      if (result[s]) result[s].push(p);
    });
    return result;
  }, [products]);

  // 本日のスループット = 今日 exported された件数
  const todayExported = useMemo(
    () =>
      products.filter(
        (p) => p.status === "exported" && isToday(p.updated_at),
      ).length,
    [products],
  );

  const progressPercent = Math.min(
    100,
    Math.round((todayExported / DAILY_TARGET) * 100),
  );

  return (
    <div className="space-y-4">
      {/* 進捗バー */}
      <div className="rounded-2xl border border-zinc-200 bg-white/70 p-3.5 backdrop-blur-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-zinc-500">本日のスループット</p>
            <p className="text-2xl font-bold tabular-nums">
              {todayExported}
              <span className="ml-1 text-sm font-normal text-zinc-400">
                / {DAILY_TARGET} 件
              </span>
            </p>
          </div>
          <p className="text-xs font-semibold tabular-nums text-emerald-600">
            {progressPercent}%
          </p>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cn(
              "h-full transition-all duration-500",
              progressPercent >= 100
                ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                : "bg-gradient-to-r from-sky-500 to-violet-500",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3 列カンバン */}
      <div className="grid grid-cols-3 gap-2">
        {COLUMNS.map((col) => {
          const items = grouped[col.key];
          const staleCount = items.filter(
            (p) => daysSince(p.created_at) >= STALE_DAYS_THRESHOLD,
          ).length;
          return (
            <div
              key={col.key}
              className={cn(
                "rounded-2xl border-2 p-2",
                col.accentColor,
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-zinc-700">
                  <span className="mr-1">{col.emoji}</span>
                  {col.label}
                </h3>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {items.length}
                </span>
              </div>
              {staleCount > 0 && col.key !== "exported" && (
                <div className="mb-2 flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-1 text-[10px] font-semibold text-red-700">
                  <AlertTriangle className="size-3" />
                  {staleCount} 件が {STALE_DAYS_THRESHOLD}日超
                </div>
              )}
              <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
                {items.length === 0 && (
                  <p className="px-1 py-4 text-center text-[10px] text-zinc-400">
                    （0 件）
                  </p>
                )}
                {items.map((p) => (
                  <KanbanCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ product }: { product: ProductListItem }) {
  const firstPhoto = product.product_photos
    ?.slice()
    .sort((a, b) => a.order_index - b.order_index)?.[0];
  const { ref: thumbRef, url: thumbUrl } = useLazySignedUrl(
    firstPhoto?.storage_path,
  );

  const days = daysSince(product.created_at);
  const isStale = days >= STALE_DAYS_THRESHOLD;

  return (
    <Link
      href={`/products/${product.id}`}
      className={cn(
        "block overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:shadow-md",
        isStale && product.status !== "exported"
          ? "border-red-300 ring-1 ring-red-200"
          : "border-zinc-200",
      )}
    >
      <div ref={thumbRef} className="aspect-square w-full bg-zinc-100">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-zinc-300">
            <ImageOff className="size-5" />
          </div>
        )}
      </div>
      <div className="px-1.5 py-1">
        <p className="line-clamp-2 text-[10px] leading-tight font-medium">
          {product.title ?? (
            <span className="italic text-zinc-400">未推定</span>
          )}
        </p>
        <div className="mt-0.5 flex items-center justify-between text-[9px] text-zinc-400">
          {product.start_price != null && (
            <span className="font-bold tabular-nums text-zinc-700">
              ¥{product.start_price.toLocaleString()}
            </span>
          )}
          <span className={cn(isStale && "font-bold text-red-600")}>
            {days}日
          </span>
        </div>
      </div>
    </Link>
  );
}
