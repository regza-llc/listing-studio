"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import type { ProductListItem } from "@/lib/products";
import { deathPileItems, STALE_TIERS } from "@/lib/death-pile";
import { cn } from "@/lib/utils";

/**
 * 死蔵バナー：撮影済みなのに未出品のまま滞留している商品を、表示モードに関わらず
 * 画面上部に常設で警告する。「撮ったのに出品されない」死蔵を構造で炙り出し、
 * 出品量回復（週42→100品）につなげるのが狙い。
 *
 * 「滞留を確認」を押すと一覧を滞留商品だけに絞り込む（onShowStale）。
 */
export function DeathPileBanner({
  products,
  onShowStale,
}: {
  products: ProductListItem[];
  onShowStale: () => void;
}) {
  const { count, maxDays, hasDanger } = useMemo(() => {
    const pile = deathPileItems(products);
    return {
      count: pile.length,
      maxDays: pile[0]?.days ?? 0,
      hasDanger: pile.some((e) => e.days >= STALE_TIERS.danger),
    };
  }, [products]);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onShowStale}
      className={cn(
        "mb-4 flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all",
        hasDanger
          ? "border-red-300 bg-red-50 hover:bg-red-100"
          : "border-orange-300 bg-orange-50 hover:bg-orange-100",
      )}
    >
      <div
        className={cn(
          "flex size-9 flex-shrink-0 items-center justify-center rounded-full text-white",
          hasDanger ? "bg-red-600" : "bg-orange-500",
        )}
      >
        <AlertTriangle className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-bold",
            hasDanger ? "text-red-800" : "text-orange-800",
          )}
        >
          撮影済みなのに未出品が{" "}
          <span className="tabular-nums">{count}</span> 件
          <span className="ml-1 font-normal">
            （最長 <span className="tabular-nums">{maxDays}</span> 日滞留）
          </span>
        </p>
        <p
          className={cn(
            "text-xs",
            hasDanger ? "text-red-600" : "text-orange-600",
          )}
        >
          タップで滞留中の商品だけ表示。古いものから出品すると売上につながります。
        </p>
      </div>
      <ChevronRight
        className={cn(
          "size-5 flex-shrink-0",
          hasDanger ? "text-red-400" : "text-orange-400",
        )}
      />
    </button>
  );
}
