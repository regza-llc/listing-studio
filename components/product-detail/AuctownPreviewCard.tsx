"use client";

import { AlertTriangle, FileSpreadsheet, ImageIcon } from "lucide-react";
import {
  type AuctownProductLike,
  buildAuctownImageFilename,
  buildAuctownRow,
} from "@/lib/auctown";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  product: AuctownProductLike;
  photoCount: number;
};

export function AuctownPreviewCard({ product, photoCount }: Props) {
  const imageFilenames = Array.from({ length: Math.min(photoCount, 10) }, (_, i) =>
    buildAuctownImageFilename(product.id, i, "jpg"),
  );

  const row = buildAuctownRow(product, imageFilenames);
  const hasWarn = row.warnings.length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-4 shadow-sm",
        hasWarn ? "border-amber-300" : "border-zinc-200",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-zinc-600" />
          <h2 className="text-sm font-bold text-zinc-900">
            オークタウン CSV プレビュー
          </h2>
        </div>
        {hasWarn ? (
          <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <AlertTriangle className="size-3" />
            {row.warnings.length} 件警告
          </Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            出力 OK
          </Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <Field
          label="カテゴリID"
          value={row.dynamic.category_id || "（未取得）"}
          warn={!row.dynamic.category_id}
        />
        <Field
          label="開始価格"
          value={row.dynamic.start_price ? `¥${row.dynamic.start_price}` : "（未設定）"}
          warn={!row.dynamic.start_price}
        />
        <Field label="状態" value={row.dynamic.condition_label} />
        <Field
          label="画像枚数"
          value={`${row.dynamic.image_filenames.length} / 10`}
          warn={row.dynamic.image_filenames.length === 0}
          icon={<ImageIcon className="size-3 text-zinc-400" />}
        />
        <Field
          label="説明文"
          value={
            row.dynamic.description
              ? `${row.dynamic.description.length} 字`
              : "（未生成）"
          }
          warn={!row.dynamic.description}
        />
        <Field
          label="タイトル"
          value={row.dynamic.title ? `${row.dynamic.title.length} 字` : "（未設定）"}
          warn={!row.dynamic.title}
        />
      </dl>

      {hasWarn && (
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {row.warnings.map((w, i) => (
            <li key={i}>• {w.message}</li>
          ))}
        </ul>
      )}

      <details className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/60">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-zinc-600">
          出品設定（全商品共通・11 列） ▼
        </summary>
        <FixedColumnsGrid />
      </details>
    </div>
  );
}

function Field({
  label,
  value,
  warn = false,
  icon,
}: {
  label: string;
  value: string;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        {icon}
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

function FixedColumnsGrid() {
  // 環境変数依存値はクライアントでは undefined → デフォルト固定値で表示
  // Vercel 側で AUCTOWN_* を上書きしている場合は実出力時に反映される
  const entries: Array<[string, string]> = [
    ["個数", "1"],
    ["開催期間（日）", "5"],
    ["終了時間（時）", "22"],
    ["返品の可否", "返品不可"],
    ["発送元都道府県", "富山県"],
    ["送料負担", "落札者"],
    ["代金支払い", "先払い"],
    ["yahoo!簡単決済", "はい"],
    ["発送までの日数", "2日〜3日"],
    ["自動延長", "はい"],
    ["早期終了", "はい"],
  ];

  return (
    <div className="border-t border-zinc-100 px-3 py-3">
      <p className="mb-2 text-[10px] text-zinc-500">
        ※ Vercel 環境変数（AUCTOWN_*）で上書き可能 / 編集は将来 UI 化予定
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[9px] text-zinc-500">{k}</dt>
            <dd className="font-medium text-zinc-700">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
