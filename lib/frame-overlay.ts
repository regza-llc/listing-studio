import sharp from "sharp";
import {
  FRAME_BORDER_MIN_PX,
  FRAME_BORDER_RATIO,
  type FrameKey,
  frameBorderColor,
} from "@/lib/frame-templates";

/**
 * 画像バッファに枠線フレームを合成する（Option B: エクスポート時合成・非破壊）。
 * frame が "none" または未対応の場合は元バッファをそのまま返す。
 * 出力は常に JPEG（呼び出し側で拡張子を .jpg に揃えること）。
 */
export async function applyFrame(
  buffer: Buffer,
  frame: FrameKey,
): Promise<Buffer> {
  const color = frameBorderColor(frame);
  if (!color) return buffer;

  const img = sharp(buffer, { failOn: "none" });
  const meta = await img.metadata();
  const longEdge = Math.max(meta.width ?? 1024, meta.height ?? 1024);
  const border = Math.max(
    FRAME_BORDER_MIN_PX,
    Math.round(longEdge * FRAME_BORDER_RATIO),
  );

  return img
    .extend({
      top: border,
      bottom: border,
      left: border,
      right: border,
      background: color,
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}
