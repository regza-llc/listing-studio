/**
 * オークタウン公式 CSV テンプレート（ヤフオク出品用）対応ユーティリティ
 *
 * テンプレ仕様: C:/Users/genza/projects/project-docs/01_Projects/roka_style/Document/auctown_template_sample/
 * - 26 列固定（カテゴリ / タイトル / 説明 / 開始価格 / 個数 / 開催期間 / 終了時間 /
 *   商品の状態 / 返品の可否 / 商品発送元の都道府県 / 送料負担 / 代金支払い /
 *   yahoo!簡単決済 / 発送までの日数 / 自動延長 / 早期終了 / 画像1〜画像10）
 * - 値はダブルクォート囲み・カンマ区切り
 * - 画像はファイル名のみ（ZIP 内フラット配置を想定）
 */

export const AUCTOWN_CSV_HEADER = [
  "カテゴリ",
  "タイトル",
  "説明",
  "開始価格",
  "個数",
  "開催期間",
  "終了時間",
  "商品の状態",
  "返品の可否",
  "商品発送元の都道府県",
  "送料負担",
  "代金支払い",
  "yahoo!簡単決済",
  "発送までの日数",
  "自動延長",
  "早期終了",
  "画像1",
  "画像2",
  "画像3",
  "画像4",
  "画像5",
  "画像6",
  "画像7",
  "画像8",
  "画像9",
  "画像10",
] as const;

export const AUCTOWN_IMAGE_SLOTS = 10;

/**
 * ROKA STYLE のデフォルト固定値。
 * 環境変数で個別オーバーライド可能（Vercel に設定）。
 */
export const AUCTOWN_DEFAULTS = {
  quantity: "1", // 個数
  duration_days: process.env.AUCTOWN_DURATION_DAYS?.trim() || "5", // 開催期間（日）
  end_time_hour: process.env.AUCTOWN_END_TIME?.trim() || "22", // 終了時間（時）
  returns: process.env.AUCTOWN_RETURNS?.trim() || "返品不可",
  seller_prefecture:
    process.env.AUCTOWN_SELLER_PREFECTURE?.trim() || "富山県",
  shipping_payer: process.env.AUCTOWN_SHIPPING_PAYER?.trim() || "落札者",
  payment_method: process.env.AUCTOWN_PAYMENT_METHOD?.trim() || "先払い",
  yahoo_kantan: process.env.AUCTOWN_YAHOO_KANTAN?.trim() || "はい",
  shipping_days: process.env.AUCTOWN_SHIPPING_DAYS?.trim() || "2日〜3日",
  auto_extension: process.env.AUCTOWN_AUTO_EXTENSION?.trim() || "はい",
  early_close: process.env.AUCTOWN_EARLY_CLOSE?.trim() || "はい",
} as const;

/**
 * listing-studio 内部の状態ランク（A/B/C/D）→ ヤフオク公式の状態区分文字列マッピング。
 *
 * ROKA STYLE は古物商なので「未使用」「未使用に近い」は使わない想定。
 * 必要に応じておきちちゃん運用で個別修正できるようマッピング表は1か所に集約。
 */
export function mapConditionToYahooLabel(
  condition: string | null | undefined,
): string {
  switch ((condition ?? "").toUpperCase()) {
    case "A":
      return "目立った傷や汚れなし";
    case "B":
      return "やや傷や汚れあり";
    case "C":
      return "傷や汚れあり";
    case "D":
      return "全体的に状態が悪い";
    default:
      return "目立った傷や汚れなし";
  }
}

/**
 * ZIP 内に配置する画像ファイル名を生成する。
 *
 * 公式テンプレは商品ごとフォルダではなくフラット配置（item001_1.jpg ...）なので、
 * 商品 ID の先頭8文字 + 連番で衝突を回避する。
 */
export function buildAuctownImageFilename(
  productId: string,
  index: number,
  ext: string,
): string {
  const prefix = productId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "item";
  const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  return `${prefix}_${String(index + 1).padStart(2, "0")}.${cleanExt}`;
}

/**
 * 開始価格を文字列化（null/0/負数は空に）。
 * ヤフオクの最低開始価格は 1 円だが、ここでは値の有無のみ判定。
 */
export function formatStartPrice(price: number | null | undefined): string {
  if (price == null) return "";
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.floor(n));
}

/**
 * 採寸情報を CSV の説明文末尾に挿入する文字列に変換。
 * [{label: "身幅", value: 52, unit: "cm"}] → "身幅 52cm / 着丈 70cm / ..."
 */
export function formatDimensions(
  dimensions: unknown,
): string {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return "";
  return dimensions
    .map((d: { label?: string; value?: number; unit?: string }) =>
      `${d.label ?? ""} ${d.value ?? ""}${d.unit ?? ""}`.trim(),
    )
    .filter((s) => s.length > 0)
    .join(" / ");
}

/**
 * 傷・難ありリストを説明文末尾に追記する文字列に変換。
 */
export function formatFlaws(flaws: unknown): string {
  if (!Array.isArray(flaws) || flaws.length === 0) return "";
  return flaws
    .map(
      (f: { location?: string; severity?: string; description?: string }) => {
        const sev =
          f.severity === "major"
            ? "【大】"
            : f.severity === "moderate"
              ? "【中】"
              : "【小】";
        return `${sev} ${f.location ?? ""}: ${f.description ?? ""}`.trim();
      },
    )
    .join("\n");
}

/**
 * 出品説明文を組み立てる。
 * AI 生成の description を本体に、採寸・傷情報を末尾に追記。
 */
export function buildDescription(args: {
  description: string | null | undefined;
  dimensions: unknown;
  flaws: unknown;
  notes: string | null | undefined;
}): string {
  const parts: string[] = [];
  if (args.description && args.description.trim()) {
    parts.push(args.description.trim());
  }
  const dim = formatDimensions(args.dimensions);
  if (dim) parts.push(`■ 採寸\n${dim}`);
  const fl = formatFlaws(args.flaws);
  if (fl) parts.push(`■ 状態詳細\n${fl}`);
  if (args.notes && args.notes.trim()) {
    parts.push(`■ 備考\n${args.notes.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * CSV 1 セルのエスケープ（ヤフオク向けはダブルクォート必須）。
 */
export function escapeAuctownCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export function rowToAuctownCsv(values: unknown[]): string {
  return values.map(escapeAuctownCsvCell).join(",");
}
