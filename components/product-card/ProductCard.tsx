"use client";

import { AlertTriangle, ImageOff, Images } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProductListItem } from "@/lib/products";
import { daysSince, isUnlisted, staleTier } from "@/lib/death-pile";
import { useLazySignedUrl } from "@/lib/use-lazy-signed-url";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<
  string,
  { label: string; variant: BadgeVariant; tooltip: string }
> = {
  draft: {
    label: "下書き",
    variant: "neutral",
    tooltip: "撮影済。タップしてメタ入力できます。",
  },
  reviewing: {
    label: "完成",
    variant: "success",
    tooltip: "メタ入力完了。ZIP エクスポートに進めます。",
  },
  ready: {
    label: "完成",
    variant: "success",
    tooltip: "出品準備OK。ZIP エクスポート対象です。",
  },
  exported: {
    label: "出力済",
    variant: "secondary",
    tooltip: "ZIP 書き出し済み。Claude へ投入してください。",
  },
};

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

export type ProductCardProps = {
  product: ProductListItem;
  selectMode?: boolean;
  selected?: boolean;
  onSelectChange?: (id: string, next: boolean) => void;
};

export function ProductCard({
  product,
  selectMode = false,
  selected = false,
  onSelectChange,
}: ProductCardProps) {
  const photos = product.product_photos
    ?.slice()
    .sort((a, b) => a.order_index - b.order_index);
  const firstPhoto = photos?.[0];
  const photoCount = photos?.length ?? 0;

  const {
    ref: thumbRef,
    url: thumbUrl,
    failed,
  } = useLazySignedUrl(firstPhoto?.storage_path);
  const [imgError, setImgError] = useState(false);
  const thumbError = failed || imgError;

  const statusInfo = STATUS_LABEL[product.status] ?? STATUS_LABEL.draft;
  const isReady =
    product.status === "ready" || product.status === "reviewing";

  // 死蔵（撮影済み未出品）の滞留段階。グリッドでも一目で分かるようにバッジを出す。
  const staleDays = daysSince(product.created_at);
  const tier = isUnlisted(product) ? staleTier(staleDays) : "none";

  const innerClassName = cn(
    "block rounded-2xl bg-card transition-all duration-300",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    selectMode
      ? "cursor-pointer"
      : "hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-900/10",
    selected && "ring-2 ring-primary ring-offset-2",
  );

  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70",
        isReady && "gradient-border-emerald",
      )}
    >
      <div ref={thumbRef} className="relative aspect-square w-full">
        {thumbUrl && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={product.title ?? "商品画像"}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-zinc-400">
            <ImageOff className="size-10" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <Badge
            variant={statusInfo.variant}
            className="shadow-sm backdrop-blur-sm"
            title={statusInfo.tooltip}
          >
            {statusInfo.label}
          </Badge>
          {tier !== "none" && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur-sm",
                tier === "danger" && "bg-red-600 text-white",
                tier === "warn" && "bg-orange-500 text-white",
                tier === "notice" && "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
              )}
              title={`撮影から ${staleDays} 日、未出品のままです`}
            >
              <AlertTriangle className="size-2.5" />
              {staleDays}日滞留
            </span>
          )}
        </div>

        {photoCount > 1 && (
          <div className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Images className="size-3" />
            {photoCount}
          </div>
        )}

        {selectMode && (
          <div className="absolute inset-0 flex items-start justify-end p-2">
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelectChange?.(product.id, v)}
              className="size-8 border-2 bg-white/95 shadow-md data-[state=checked]:border-primary"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5 bg-card px-3 py-3">
        <p className="line-clamp-2 min-h-[2.5em] text-sm font-medium leading-snug">
          {product.title ?? (
            <span className="italic text-zinc-400">未推定</span>
          )}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-base font-bold tabular-nums">
            {product.start_price != null ? (
              `¥${product.start_price.toLocaleString()}`
            ) : (
              <span className="text-xs font-normal text-zinc-400">
                価格未設定
              </span>
            )}
          </span>
          <span className="text-[10px] text-zinc-400">
            {relativeTime(product.created_at)}
          </span>
        </div>
      </div>
    </div>
  );

  if (selectMode) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectChange?.(product.id, !selected)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectChange?.(product.id, !selected);
          }
        }}
        className={innerClassName}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/products/${product.id}`} className={innerClassName}>
      {inner}
    </Link>
  );
}
