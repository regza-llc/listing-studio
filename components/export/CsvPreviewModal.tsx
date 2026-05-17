"use client";

import { AlertTriangle, Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  AuctownDynamicRow,
  AuctownFixedRow,
  AuctownRowWarning,
} from "@/lib/auctown";
import { cn } from "@/lib/utils";

type PreviewRow = {
  product_id: string;
  dynamic: AuctownDynamicRow;
  fixed: AuctownFixedRow;
  warnings: AuctownRowWarning[];
  cells: string[];
};

type PreviewResponse = {
  header: string[];
  rows: PreviewRow[];
  total_warnings: number;
};

type Props = {
  open: boolean;
  productIds: string[];
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  confirming?: boolean;
};

export function CsvPreviewModal({
  open,
  productIds,
  onClose,
  onConfirm,
  confirming = false,
}: Props) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || productIds.length === 0) {
      setData(null);
      setError(null);
      return;
    }
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch("/api/export/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: productIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as PreviewResponse;
      })
      .then((json) => {
        if (!aborted) setData(json);
      })
      .catch((e) => {
        if (!aborted)
          setError(e instanceof Error ? e.message : "プレビュー取得失敗");
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, productIds]);

  if (!open) return null;

  const hasWarnings = (data?.total_warnings ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              オークタウン CSV プレビュー
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              出力前の最終確認 — カテゴリID 欠損や説明文不足をチェック
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
              <Loader2 className="mr-2 size-4 animate-spin" />
              プレビュー生成中...
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {data && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                <div className="text-sm text-zinc-700">
                  対象商品: <span className="font-bold">{data.rows.length}</span> 件
                </div>
                {hasWarnings ? (
                  <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <AlertTriangle className="size-3" />
                    {data.total_warnings} 件の警告
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    全項目 OK
                  </Badge>
                )}
              </div>

              {/* Dynamic fields per product */}
              <div className="space-y-3">
                {data.rows.map((row, idx) => (
                  <ProductPreviewCard key={row.product_id} row={row} index={idx + 1} />
                ))}
              </div>

              {/* Fixed columns accordion */}
              {data.rows[0] && (
                <details className="rounded-lg border border-zinc-200 bg-white">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-700">
                    出品設定（全商品共通・11 列） ▼
                  </summary>
                  <FixedColumnsTable fixed={data.rows[0].fixed} />
                </details>
              )}

              {/* Raw CSV (collapsed) */}
              <details className="rounded-lg border border-zinc-200 bg-white">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-700">
                  生 CSV テキスト ▼
                </summary>
                <pre className="max-h-60 overflow-auto bg-zinc-50 px-4 py-3 text-[11px] leading-relaxed text-zinc-700">
                  {[
                    data.header.map((h) => `"${h}"`).join(","),
                    ...data.rows.map((r) =>
                      r.cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
                    ),
                  ].join("\n")}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-4">
          <div className="text-xs text-zinc-500">
            {hasWarnings ? (
              <span className="text-amber-700">
                ⚠ 警告があります。取込後の手動補完が必要な場合があります。
              </span>
            ) : (
              <span className="text-emerald-700">
                ✓ そのまま ZIP 出力できます
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={confirming}>
              キャンセル
            </Button>
            <Button
              onClick={() => onConfirm()}
              disabled={loading || !!error || !data || confirming}
              className={cn(
                hasWarnings && "bg-amber-600 hover:bg-amber-700",
              )}
            >
              {confirming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {confirming ? "出力中..." : "ZIP をダウンロード"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductPreviewCard({
  row,
  index,
}: {
  row: PreviewRow;
  index: number;
}) {
  const { dynamic, warnings } = row;
  const hasWarn = warnings.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-4",
        hasWarn ? "border-amber-300 bg-amber-50/30" : "border-zinc-200",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">
            #{index}
          </span>
          <span className="text-sm font-medium text-zinc-900">
            {dynamic.title || "（タイトル未設定）"}
          </span>
        </div>
        {hasWarn && (
          <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="size-3" />
            {warnings.length}
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field
          label="カテゴリID"
          value={dynamic.category_id || "（未取得）"}
          warn={!dynamic.category_id}
        />
        <Field
          label="開始価格"
          value={dynamic.start_price ? `¥${dynamic.start_price}` : "（未設定）"}
          warn={!dynamic.start_price}
        />
        <Field label="商品の状態" value={dynamic.condition_label} />
        <Field
          label="画像枚数"
          value={`${dynamic.image_filenames.length} / 10 枚`}
          warn={dynamic.image_filenames.length === 0}
        />
      </dl>

      {dynamic.description && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-600">
            説明文（{dynamic.description.length} 字） ▼
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 px-3 py-2 text-[11px] leading-relaxed text-zinc-700">
            {dynamic.description}
          </pre>
        </details>
      )}

      {hasWarn && (
        <ul className="mt-3 space-y-1 rounded bg-amber-100/60 px-3 py-2 text-[11px] text-amber-900">
          {warnings.map((w, i) => (
            <li key={i}>• {w.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-medium",
          warn ? "text-amber-700" : "text-zinc-900",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function FixedColumnsTable({ fixed }: { fixed: AuctownFixedRow }) {
  const entries: Array<[string, string]> = [
    ["個数", fixed.quantity],
    ["開催期間（日）", fixed.duration_days],
    ["終了時間（時）", fixed.end_time_hour],
    ["返品の可否", fixed.returns],
    ["発送元都道府県", fixed.seller_prefecture],
    ["送料負担", fixed.shipping_payer],
    ["代金支払い", fixed.payment_method],
    ["yahoo!簡単決済", fixed.yahoo_kantan],
    ["発送までの日数", fixed.shipping_days],
    ["自動延長", fixed.auto_extension],
    ["早期終了", fixed.early_close],
  ];

  return (
    <div className="border-t border-zinc-100 px-4 py-3">
      <p className="mb-2 text-[11px] text-zinc-500">
        ※ Vercel 環境変数（AUCTOWN_*）で全商品共通の値を上書き可能
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] text-zinc-500">{k}</dt>
            <dd className="font-medium text-zinc-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
