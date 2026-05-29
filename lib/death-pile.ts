import type { ProductListItem } from "@/lib/products";

/**
 * 死蔵（撮影済みなのに未出品＝death pile）の判定ロジックを一元化する。
 * 「撮ったのに出品されていない」滞留商品を炙り出し、出品量回復につなげるのが目的。
 */

/** 滞留の段階しきい値（日数）。古いほど危険度が上がる。 */
export const STALE_TIERS = { notice: 3, warn: 7, danger: 14 } as const;

export type StaleTier = "none" | "notice" | "warn" | "danger";

/** ISO 日時から経過日数を返す。 */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * 未出品判定。`exported`（ZIP 書き出し済み＝出品フローに乗った）以外はすべて未出品扱い。
 * draft / reviewing / ready はまだ出品データになっていない。
 */
export function isUnlisted(p: { status: string }): boolean {
  return p.status !== "exported";
}

/** 経過日数を滞留段階に変換する。 */
export function staleTier(days: number): StaleTier {
  if (days >= STALE_TIERS.danger) return "danger";
  if (days >= STALE_TIERS.warn) return "warn";
  if (days >= STALE_TIERS.notice) return "notice";
  return "none";
}

/** 商品が死蔵（未出品 かつ minDays 以上滞留）かどうか。 */
export function isDeathPile(
  p: ProductListItem,
  minDays: number = STALE_TIERS.notice,
): boolean {
  return isUnlisted(p) && daysSince(p.created_at) >= minDays;
}

export type DeathPileEntry = { product: ProductListItem; days: number };

/**
 * 死蔵商品を滞留日数の降順（古い順）で返す。
 * created_at を「最初の撮影時刻」の代理として使う。
 */
export function deathPileItems(
  products: ProductListItem[],
  minDays: number = STALE_TIERS.notice,
): DeathPileEntry[] {
  return products
    .filter((p) => isUnlisted(p) && daysSince(p.created_at) >= minDays)
    .map((p) => ({ product: p, days: daysSince(p.created_at) }))
    .sort((a, b) => b.days - a.days);
}
