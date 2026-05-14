export type ResizeOption = {
  longEdge: number | "original";
  squareCrop: boolean;
  quality?: number;
};

export const DEFAULT_RESIZE: ResizeOption = {
  longEdge: 1024,
  squareCrop: false,
  quality: 0.85,
};

export async function resizeImage(
  file: File | Blob,
  options: ResizeOption = DEFAULT_RESIZE
): Promise<Blob> {
  const { longEdge, squareCrop, quality = 0.85 } = options;

  const bitmap = await createImageBitmap(file);

  let sourceX = 0;
  let sourceY = 0;
  let sourceW = bitmap.width;
  let sourceH = bitmap.height;

  if (squareCrop) {
    const size = Math.min(bitmap.width, bitmap.height);
    sourceX = (bitmap.width - size) / 2;
    sourceY = (bitmap.height - size) / 2;
    sourceW = size;
    sourceH = size;
  }

  let targetW: number;
  let targetH: number;

  if (longEdge === "original") {
    targetW = sourceW;
    targetH = sourceH;
  } else if (sourceW >= sourceH) {
    targetW = Math.min(sourceW, longEdge);
    targetH = (sourceH * targetW) / sourceW;
  } else {
    targetH = Math.min(sourceH, longEdge);
    targetW = (sourceW * targetH) / sourceH;
  }

  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context が取得できませんでした");

  ctx.drawImage(bitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);

  return await canvas.convertToBlob({
    type: "image/jpeg",
    quality,
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
