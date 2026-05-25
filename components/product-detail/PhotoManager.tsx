"use client";

import {
  ArrowLeftRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { CameraCapture, type CapturedPhoto } from "@/components/camera/CameraCapture";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resizeImage } from "@/lib/image-resize";
import {
  addPhotosToProduct,
  deletePhoto,
  MAX_PHOTOS,
  reorderPhotos,
} from "@/lib/products";
import type { ProductPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB（Storage バケット上限）

export function PhotoManager({
  productId,
  photos,
  photoUrls,
  onChanged,
}: {
  productId: string;
  photos: ProductPhoto[];
  photoUrls: Record<string, string>;
  onChanged: () => Promise<void> | void;
}) {
  const sorted = [...photos].sort((a, b) => a.order_index - b.order_index);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [working, setWorking] = useState<ProductPhoto[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atLimit = sorted.length >= MAX_PHOTOS;
  const remaining = MAX_PHOTOS - sorted.length;

  async function reload() {
    await onChanged();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;
        if (f.size > MAX_FILE_BYTES) {
          setError(`「${f.name}」は 10MB を超えています`);
          continue;
        }
        const blob = await resizeImage(f, {
          longEdge: 1024,
          squareCrop: false,
          quality: 0.85,
        });
        blobs.push(blob);
      }
      if (blobs.length === 0) {
        setBusy(false);
        return;
      }
      const result = await addPhotosToProduct(productId, blobs, sorted.length);
      if ("error" in result) {
        setError(result.error);
      } else if (result.skipped > 0) {
        setError(`${result.added} 枚追加（上限 ${MAX_PHOTOS} 枚のため ${result.skipped} 枚は追加されませんでした）`);
      }
      await reload();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCameraComplete(captured: CapturedPhoto[]) {
    setBusy(true);
    setError(null);
    try {
      const result = await addPhotosToProduct(
        productId,
        captured.map((c) => c.processed),
        sorted.length,
      );
      if ("error" in result) setError(result.error);
      else if (result.skipped > 0)
        setError(`${result.added} 枚追加（上限のため ${result.skipped} 枚は追加されませんでした）`);
      await reload();
    } finally {
      setBusy(false);
      setAdding(false);
    }
  }

  async function handleDelete(photo: ProductPhoto) {
    if (!confirm("この写真を削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deletePhoto(productId, photo);
      if ("error" in result) setError(result.error);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function startReorder() {
    setWorking(sorted);
    setReorderMode(true);
    setError(null);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...working];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setWorking(next);
  }

  async function commitReorder() {
    setBusy(true);
    setError(null);
    try {
      const result = await reorderPhotos(working.map((p) => p.id));
      if ("error" in result) setError(result.error);
      await reload();
      setReorderMode(false);
    } finally {
      setBusy(false);
    }
  }

  const list = reorderMode ? working : sorted;

  return (
    <Card className="p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-600">
          写真 {sorted.length} / {MAX_PHOTOS} 枚
        </p>
        {reorderMode ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReorderMode(false)}
              disabled={busy}
            >
              <X className="size-4" />
              キャンセル
            </Button>
            <Button size="sm" onClick={commitReorder} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              並び順を保存
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setAdding(true)}
              disabled={busy || atLimit}
            >
              <Camera className="size-4" />
              追加撮影
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || atLimit}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              ファイルから追加
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={startReorder}
              disabled={busy || sorted.length < 2}
            >
              <ArrowLeftRight className="size-4" />
              並び替え
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {atLimit && !reorderMode && (
        <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          10 枚に達しました（オークタウン上限）。追加するには既存の写真を削除してください。
        </p>
      )}
      {!atLimit && !reorderMode && remaining < MAX_PHOTOS && (
        <p className="mb-2 text-[11px] text-zinc-400">あと {remaining} 枚追加できます</p>
      )}

      {error && (
        <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-zinc-400">
          <ImageOff className="size-8" />
          <p className="text-xs">写真がありません。追加撮影またはファイルから追加してください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {list.map((photo, idx) => {
            const url = photoUrls[photo.id];
            return (
              <div
                key={photo.id}
                className="relative aspect-square overflow-hidden rounded-md bg-zinc-100"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-zinc-300" />
                  </div>
                )}

                {/* 1 枚目（サムネ）バッジ */}
                {idx === 0 && (
                  <span className="absolute left-1 top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 shadow">
                    🥇 1枚目
                  </span>
                )}

                {reorderMode ? (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 p-1">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0 || busy}
                      className="flex size-7 items-center justify-center rounded-full bg-white/90 text-zinc-900 disabled:opacity-30"
                      aria-label="前へ"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === list.length - 1 || busy}
                      className="flex size-7 items-center justify-center rounded-full bg-white/90 text-zinc-900 disabled:opacity-30"
                      aria-label="次へ"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDelete(photo)}
                    disabled={busy}
                    className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-red-600/90 text-white shadow-md disabled:opacity-40"
                    aria-label="この写真を削除"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 追加撮影モーダル */}
      {adding && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4">
            <span className="text-sm font-semibold">追加撮影</span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={busy}
              className="flex size-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 disabled:opacity-40"
              aria-label="閉じる"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <p className="mb-3 text-xs text-zinc-500">
              撮影して「完了」を押すと、この商品に写真が追加されます（残り {remaining} 枚）。
            </p>
            <CameraCapture onComplete={handleCameraComplete} busy={busy} />
          </div>
        </div>
      )}
    </Card>
  );
}
