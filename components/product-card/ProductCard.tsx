"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getPhotoSignedUrl } from "@/lib/products";
import type { ProductListItem } from "@/lib/products";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: {
    label: "下書き",
    className: "bg-secondary text-secondary-foreground",
  },
  reviewing: {
    label: "AI 推定済",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  ready: {
    label: "完成",
    className: "bg-green-500/10 text-green-700 dark:text-green-300",
  },
  exported: {
    label: "出力済",
    className: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
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

export function ProductCard({ product }: { product: ProductListItem }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);

  const firstPhoto = product.product_photos
    ?.slice()
    .sort((a, b) => a.order_index - b.order_index)?.[0];

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

  return (
    <Card className="overflow-hidden p-0 gap-0">
      <div className="aspect-square w-full bg-muted relative">
        {thumbUrl && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={product.title ?? "商品画像"}
            className="size-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="size-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
        {product.product_photos && product.product_photos.length > 1 && (
          <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-black/60 text-white">
            +{product.product_photos.length - 1}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-sm font-medium line-clamp-2 min-h-[2.5em]">
          {product.title ?? (
            <span className="text-muted-foreground italic">未推定</span>
          )}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {relativeTime(product.created_at)}
        </p>
      </div>
    </Card>
  );
}
