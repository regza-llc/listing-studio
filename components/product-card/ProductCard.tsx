"use client";

import { ImageOff, Images } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getPhotoSignedUrl } from "@/lib/products";
import type { ProductListItem } from "@/lib/products";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "下書き", variant: "neutral" },
  reviewing: { label: "AI 推定済", variant: "info" },
  ready: { label: "完成", variant: "success" },
  exported: { label: "出力済", variant: "secondary" },
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
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);

  const photos = product.product_photos
    ?.slice()
    .sort((a, b) => a.order_index - b.order_index);
  const firstPhoto = photos?.[0];
  const photoCount = photos?.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    if (!firstPhoto) return;
    getPhotoSignedUrl(firstPhoto.storage_path).then((url) => {
      if (cancelled) return;
      if (url) setThumbUrl(url);
      else setThumbError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [firstPhoto]);

  const statusInfo = STATUS_LABEL[product.status] ?? STATUS_LABEL.draft;
  const isReady = product.status === "ready";
  const spotlightRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = spotlightRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }

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
      ref={spotlightRef}
      onMouseMove={handleMouseMove}
      className={cn(
        "spotlight-card group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70",
        isReady && "gradient-border-emerald",
      )}
    >
      <div className="relative aspect-square w-full">
        {thumbUrl && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={product.title ?? "商品画像"}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-zinc-400">
            <ImageOff className="size-10" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <Badge variant={statusInfo.variant} className="shadow-sm backdrop-blur-sm">
            {statusInfo.label}
          </Badge>
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
              className="size-6 bg-white/90 shadow-md"
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
