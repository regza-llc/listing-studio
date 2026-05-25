/**
 * 1 枚目（サムネ）に合成する枠線テンプレート。
 * v0.2 MVP は枠線のみ（ロゴウォーターマークは #14 フォローアップ）。
 * クライアント（設定 UI / CSS プレビュー）とサーバ（sharp 合成）で共有する。
 */
export type FrameKey = "none" | "border-black" | "border-white";

export const FRAME_OPTIONS: { value: FrameKey; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "border-black", label: "黒枠" },
  { value: "border-white", label: "白枠" },
];

/** 枠線の色（border 系のみ）。none は null。 */
export function frameBorderColor(key: FrameKey): string | null {
  switch (key) {
    case "border-black":
      return "#000000";
    case "border-white":
      return "#ffffff";
    default:
      return null;
  }
}

/** 枠線幅 = 長辺に対する比率（下限 px あり）。サーバ合成・プレビューで共通の見た目に。 */
export const FRAME_BORDER_RATIO = 0.04;
export const FRAME_BORDER_MIN_PX = 12;

export function isFrameKey(v: unknown): v is FrameKey {
  return v === "none" || v === "border-black" || v === "border-white";
}
