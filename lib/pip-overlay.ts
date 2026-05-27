import sharp from "sharp";

/** インセット画像の幅（メイン画像幅に対する比率） */
const PIP_WIDTH_RATIO = 0.3;
/** インセットを配置する左上マージン（メイン画像幅に対する比率） */
const PIP_MARGIN_RATIO = 0.025;
/** インセットの白枠の太さ（インセット幅に対する比率・下限あり） */
const PIP_BORDER_RATIO = 0.03;
const PIP_BORDER_MIN_PX = 4;
/** 白枠の外側に重ねる細いグレーの縁取り（視認性のため） */
const PIP_HAIRLINE_PX = 1;
const PIP_HAIRLINE_COLOR = "#a1a1aa";

/**
 * メイン画像（1 枚目）の左上に、インセット画像（2 枚目）を小さく合成する
 * （ピクチャーインピクチャー）。表裏など 2 面を 1 枚のサムネで見せたいとき用。
 * Option B: エクスポート時合成・非破壊。出力は常に JPEG。
 */
export async function applyPip(
  mainBuffer: Buffer,
  insetBuffer: Buffer,
): Promise<Buffer> {
  const main = sharp(mainBuffer, { failOn: "none" });
  const meta = await main.metadata();
  const mainW = meta.width ?? 1024;

  const insetW = Math.round(mainW * PIP_WIDTH_RATIO);
  const margin = Math.round(mainW * PIP_MARGIN_RATIO);
  const border = Math.max(
    PIP_BORDER_MIN_PX,
    Math.round(insetW * PIP_BORDER_RATIO),
  );

  // インセット: 幅 insetW にリサイズ → 白枠 → 細グレーの縁取り
  const inset = await sharp(insetBuffer, { failOn: "none" })
    .resize({ width: insetW })
    .flatten({ background: "#ffffff" })
    .extend({
      top: border,
      bottom: border,
      left: border,
      right: border,
      background: "#ffffff",
    })
    .extend({
      top: PIP_HAIRLINE_PX,
      bottom: PIP_HAIRLINE_PX,
      left: PIP_HAIRLINE_PX,
      right: PIP_HAIRLINE_PX,
      background: PIP_HAIRLINE_COLOR,
    })
    .png()
    .toBuffer();

  return main
    .composite([{ input: inset, top: margin, left: margin }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
