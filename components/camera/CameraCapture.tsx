"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_RESIZE,
  resizeImage,
  type ResizeOption,
} from "@/lib/image-resize";

export type CapturedPhoto = {
  id: string;
  original: File;
  processed: Blob;
  previewUrl: string;
  originalSize: number;
  processedSize: number;
};

export type CameraCaptureProps = {
  onChange?: (photos: CapturedPhoto[]) => void;
  disabled?: boolean;
};

export function CameraCapture({ onChange, disabled }: CameraCaptureProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [squareCrop, setSquareCrop] = useState<boolean>(false);
  const [longEdge, setLongEdge] = useState<"1024" | "1920" | "original">(
    "1024"
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange?.(photos);
  }, [photos, onChange]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentResizeOption(): ResizeOption {
    return {
      squareCrop,
      longEdge: longEdge === "original" ? "original" : Number(longEdge),
      quality: DEFAULT_RESIZE.quality,
    };
  }

  async function processFile(file: File): Promise<CapturedPhoto> {
    const processed = await resizeImage(file, currentResizeOption());
    return {
      id: crypto.randomUUID(),
      original: file,
      processed,
      previewUrl: URL.createObjectURL(processed),
      originalSize: file.size,
      processedSize: processed.size,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const newOnes: CapturedPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;
        newOnes.push(await processFile(f));
      }
      setPhotos((prev) => [...prev, ...newOnes]);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function reprocessAll() {
    if (photos.length === 0) return;
    setBusy(true);
    try {
      const next: CapturedPhoto[] = [];
      for (const p of photos) {
        URL.revokeObjectURL(p.previewUrl);
        const processed = await resizeImage(p.original, currentResizeOption());
        next.push({
          ...p,
          processed,
          previewUrl: URL.createObjectURL(processed),
          processedSize: processed.size,
        });
      }
      setPhotos(next);
    } finally {
      setBusy(false);
    }
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  const totalOriginalKB = Math.round(
    photos.reduce((s, p) => s + p.originalSize, 0) / 1024
  );
  const totalProcessedKB = Math.round(
    photos.reduce((s, p) => s + p.processedSize, 0) / 1024
  );

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
          画像リサイズ設定
        </h2>

        <div className="flex items-center justify-between">
          <Label htmlFor="square-crop" className="cursor-pointer">
            正方形クロップ
          </Label>
          <Switch
            id="square-crop"
            checked={squareCrop}
            onCheckedChange={(v) => setSquareCrop(v)}
          />
        </div>

        <div className="space-y-2">
          <Label>長辺サイズ</Label>
          <RadioGroup
            value={longEdge}
            onValueChange={(v) => setLongEdge(v as "1024" | "1920" | "original")}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="1024" id="edge-1024" />
              <Label htmlFor="edge-1024" className="cursor-pointer">
                1024px
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="1920" id="edge-1920" />
              <Label htmlFor="edge-1920" className="cursor-pointer">
                1920px
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="original" id="edge-original" />
              <Label htmlFor="edge-original" className="cursor-pointer">
                オリジナル
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={reprocessAll}
          disabled={busy || disabled || photos.length === 0}
          className="w-full"
        >
          現在の設定で再リサイズ（{photos.length} 枚）
        </Button>
      </Card>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          size="lg"
          className="w-full h-16 text-lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || disabled}
        >
          <Camera className="size-6" />
          {busy ? "処理中..." : "写真を撮る"}
        </Button>
      </div>

      {photos.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">撮影済み {photos.length} 枚</span>
            <span className="text-xs text-muted-foreground">
              {totalOriginalKB.toLocaleString()} KB → {totalProcessedKB.toLocaleString()} KB
              {totalOriginalKB > 0 && (
                <>（{Math.round((1 - totalProcessedKB / totalOriginalKB) * 100)}% 削減）</>
              )}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {photos.map((p) => (
              <div
                key={p.id}
                className="relative flex-shrink-0 group"
                style={{ width: 96, height: 96 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt="撮影画像"
                  className="size-24 rounded-md object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  disabled={disabled}
                  className="absolute -top-1 -right-1 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="削除"
                >
                  <X className="size-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 rounded-b-md">
                  {Math.round(p.processedSize / 1024)} KB
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
