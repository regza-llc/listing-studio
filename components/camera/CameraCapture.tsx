"use client";

import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CapturedPhoto = {
  id: string;
  processed: Blob;
  previewUrl: string;
  processedSize: number;
};

export type CameraCaptureProps = {
  onChange?: (photos: CapturedPhoto[]) => void;
  /** 「完了」押下: 保存処理して編集画面遷移などを行う */
  onComplete?: (photos: CapturedPhoto[]) => Promise<boolean | void> | void;
  /** 「次の商品」押下: 保存して即新規撮影に戻る（photos は自動クリア） */
  onNextProduct?: (photos: CapturedPhoto[]) => Promise<boolean | void> | void;
  /** 親側の保存処理中フラグ（ボタン無効化用） */
  busy?: boolean;
  disabled?: boolean;
  /** Web カメラを優先するか（false なら OSカメラ） */
  preferWebCamera?: boolean;
};

const TARGET_LONG_EDGE = 1024;
const JPEG_QUALITY = 0.92;

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "running"; stream: MediaStream }
  | { kind: "denied"; message: string }
  | { kind: "error"; message: string };

export function CameraCapture({
  onChange,
  onComplete,
  onNextProduct,
  busy = false,
  disabled,
  preferWebCamera = true,
}: CameraCaptureProps) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraState, setCameraState] = useState<CameraState>({ kind: "idle" });
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(false);
  const [useFallback, setUseFallback] = useState(!preferWebCamera);
  const [savedCount, setSavedCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<CapturedPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
    onChange?.(photos);
  }, [photos, onChange]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (cameraState.kind === "running") {
        cameraState.stream.getTracks().forEach((t) => t.stop());
      }
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // video に stream を接続
  useEffect(() => {
    if (cameraState.kind !== "running" || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = cameraState.stream;
    video.play().catch((e) => {
      console.error("[camera] video.play failed:", e);
    });
  }, [cameraState]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState({
        kind: "error",
        message: "このブラウザは Web カメラに対応していません",
      });
      return;
    }

    setCameraState({ kind: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      setCameraState({ kind: "running", stream });
    } catch (err) {
      const e = err as DOMException;
      console.error("[camera] getUserMedia failed:", e);
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setCameraState({
          kind: "denied",
          message:
            "カメラの使用が許可されていません。ブラウザ設定で許可するか、OSカメラに切り替えてください。",
        });
      } else if (e?.name === "NotFoundError") {
        setCameraState({
          kind: "error",
          message: "カメラが見つかりませんでした",
        });
      } else {
        setCameraState({
          kind: "error",
          message: e?.message ?? "カメラ起動に失敗しました",
        });
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraState.kind === "running") {
      cameraState.stream.getTracks().forEach((t) => t.stop());
    }
    setCameraState({ kind: "idle" });
  }, [cameraState]);

  const capture = useCallback(async () => {
    if (cameraState.kind !== "running" || shooting) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setShooting(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);

    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const size = Math.min(vw, vh);
      const sx = (vw - size) / 2;
      const sy = (vh - size) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = TARGET_LONG_EDGE;
      canvas.height = TARGET_LONG_EDGE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context unavailable");

      ctx.drawImage(
        video,
        sx,
        sy,
        size,
        size,
        0,
        0,
        TARGET_LONG_EDGE,
        TARGET_LONG_EDGE,
      );

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          JPEG_QUALITY,
        );
      });

      const photo: CapturedPhoto = {
        id: crypto.randomUUID(),
        processed: blob,
        previewUrl: URL.createObjectURL(blob),
        processedSize: blob.size,
      };
      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      console.error("[camera] capture failed:", err);
    } finally {
      setShooting(false);
    }
  }, [cameraState, shooting]);

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearAll() {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  }

  async function handleComplete() {
    if (!onComplete || photos.length === 0 || busy) return;
    await onComplete(photos);
    // 親が router.push する想定。失敗してもユーザーに見える形でハンドリングする
  }

  async function handleNextProduct() {
    if (!onNextProduct || photos.length === 0 || busy) return;
    const result = await onNextProduct(photos);
    if (result === false) return;
    setSavedCount((c) => c + 1);
    clearAll();
  }

  // === OSカメラフォールバック ===
  function handleFallbackFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newOnes: CapturedPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith("image/")) continue;
      newOnes.push({
        id: crypto.randomUUID(),
        processed: f,
        previewUrl: URL.createObjectURL(f),
        processedSize: f.size,
      });
    }
    setPhotos((prev) => [...prev, ...newOnes]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // === レンダリング ===

  if (useFallback) {
    return (
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFallbackFiles(e.target.files)}
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">OSカメラモード</p>
          <p className="mt-1 text-xs text-amber-800">
            Web カメラが使えない場合の代替モードです。OSのカメラで撮影してから取り込みます。
          </p>
        </div>
        <Button
          size="lg"
          className="h-16 w-full text-lg"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || busy}
        >
          <Upload className="size-5" />
          写真を取り込む
        </Button>
        {preferWebCamera && (
          <button
            type="button"
            onClick={() => setUseFallback(false)}
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Web カメラに戻す
          </button>
        )}
        {photos.length > 0 && (
          <FallbackPhotoStrip
            photos={photos}
            onRemove={removePhoto}
            busy={busy}
            onComplete={onComplete ? handleComplete : undefined}
            onNextProduct={onNextProduct ? handleNextProduct : undefined}
          />
        )}
      </div>
    );
  }

  if (cameraState.kind === "idle" || cameraState.kind === "requesting") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-zinc-50 p-8 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Camera className="size-7" />
          </div>
          <h2 className="text-base font-semibold">カメラで撮影</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            タップでカメラを起動し、商品を連続で撮影できます
          </p>
          {savedCount > 0 && (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              直前のセッションで {savedCount} 商品を保存しました
            </p>
          )}
        </div>
        <Button
          size="lg"
          className="h-16 w-full text-lg"
          onClick={startCamera}
          disabled={disabled || cameraState.kind === "requesting"}
        >
          {cameraState.kind === "requesting" ? (
            <>
              <RefreshCw className="size-5 animate-spin" />
              起動中...
            </>
          ) : (
            <>
              <Camera className="size-5" />
              撮影を始める
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={() => setUseFallback(true)}
          className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          OSカメラを使う（うまくいかない場合）
        </button>
      </div>
    );
  }

  if (cameraState.kind === "denied" || cameraState.kind === "error") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex gap-2">
            <AlertCircle className="size-5 flex-shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">
                カメラを起動できませんでした
              </p>
              <p className="text-xs text-destructive/90">
                {cameraState.message}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => setUseFallback(true)}
        >
          <Upload className="size-5" />
          OSカメラを使う
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={startCamera}
        >
          <RefreshCw className="size-4" />
          もう一度試す
        </Button>
      </div>
    );
  }

  // === フルスクリーン撮影UI ===
  const hasPhotos = photos.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 size-full object-cover"
      />

      {/* フラッシュ */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-white transition-opacity duration-100",
          flash ? "opacity-60" : "opacity-0",
        )}
      />

      {/* 正方形フレーム + グリッド */}
      <SquareOverlay />

      {/* 上部バー */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <button
          type="button"
          onClick={stopCamera}
          disabled={busy}
          className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm disabled:opacity-40"
          aria-label="撮影をやめる"
        >
          <X className="size-5" />
        </button>
        <div className="rounded-full bg-black/50 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
          {photos.length} 枚
          {savedCount > 0 && (
            <span className="ml-2 text-xs text-emerald-300">
              保存済 {savedCount}
            </span>
          )}
        </div>
        <div className="size-10" />
      </div>

      {/* サムネストリップ */}
      {hasPhotos && (
        <div className="absolute inset-x-0 bottom-44 z-10 px-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <div key={p.id} className="relative flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt=""
                  className="size-16 rounded-lg border-2 border-white/80 object-cover shadow-md"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  disabled={busy}
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md disabled:opacity-40"
                  aria-label="削除"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* シャッターボタン + 完了/次の商品 */}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-8 pt-4">
        <div className="relative flex items-center justify-center px-6">
          {/* 「次の商品」(左) */}
          {hasPhotos && onNextProduct && (
            <button
              type="button"
              onClick={handleNextProduct}
              disabled={busy}
              className="absolute left-6 flex flex-col items-center gap-1 rounded-2xl bg-black/60 px-3 py-2 text-white backdrop-blur-sm disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ArrowRight className="size-5" />
              )}
              <span className="text-[10px] font-semibold leading-none">
                次の商品
              </span>
            </button>
          )}

          {/* シャッター（中央） */}
          <button
            type="button"
            onClick={capture}
            disabled={shooting || busy}
            className={cn(
              "relative flex size-20 items-center justify-center rounded-full bg-white shadow-xl transition-transform active:scale-95",
              (shooting || busy) && "opacity-70",
            )}
            aria-label="撮影"
          >
            <div className="size-16 rounded-full border-4 border-zinc-300" />
            <div className="absolute size-16 rounded-full bg-white" />
          </button>

          {/* 「完了」(右) */}
          {hasPhotos && onComplete && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={busy}
              className="absolute right-6 flex flex-col items-center gap-1 rounded-2xl bg-emerald-500 px-3 py-2 text-white shadow-lg disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Check className="size-5" />
              )}
              <span className="text-[10px] font-semibold leading-none">
                完了
              </span>
            </button>
          )}
        </div>

        {hasPhotos && (onComplete || onNextProduct) && (
          <p className="mt-3 text-center text-[10px] text-white/70">
            <span className="font-semibold">次の商品</span>: 保存してすぐ次の撮影へ /{" "}
            <span className="font-semibold">完了</span>: 編集画面で詳細入力
          </p>
        )}
      </div>
    </div>
  );
}

// ===== サブコンポーネント =====

function SquareOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative"
        style={{
          width: "min(100vw, calc(100vh - 280px))",
          aspectRatio: "1 / 1",
        }}
      >
        <div
          className="absolute inset-0"
          style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
        />
        <div className="absolute inset-0 border-2 border-white/80" />
        <div className="absolute inset-0">
          <div className="absolute left-0 right-0 top-1/3 border-t border-white/30" />
          <div className="absolute left-0 right-0 top-2/3 border-t border-white/30" />
          <div className="absolute bottom-0 left-1/3 top-0 border-l border-white/30" />
          <div className="absolute bottom-0 left-2/3 top-0 border-l border-white/30" />
        </div>
        <CornerMarkers />
      </div>
    </div>
  );
}

function CornerMarkers() {
  return (
    <>
      <div className="absolute left-0 top-0 size-5 border-l-[3px] border-t-[3px] border-white" />
      <div className="absolute right-0 top-0 size-5 border-r-[3px] border-t-[3px] border-white" />
      <div className="absolute bottom-0 left-0 size-5 border-b-[3px] border-l-[3px] border-white" />
      <div className="absolute bottom-0 right-0 size-5 border-b-[3px] border-r-[3px] border-white" />
    </>
  );
}

function FallbackPhotoStrip({
  photos,
  onRemove,
  busy,
  onComplete,
  onNextProduct,
}: {
  photos: CapturedPhoto[];
  onRemove: (id: string) => void;
  busy?: boolean;
  onComplete?: () => void;
  onNextProduct?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        撮影済み {photos.length} 枚
      </p>
      <div className="flex gap-2 overflow-x-auto">
        {photos.map((p) => (
          <div key={p.id} className="relative flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.previewUrl}
              alt=""
              className="size-20 rounded-lg border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              disabled={busy}
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow disabled:opacity-40"
              aria-label="削除"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      {(onComplete || onNextProduct) && (
        <div className="flex gap-2 pt-2">
          {onNextProduct && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={onNextProduct}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              次の商品
            </Button>
          )}
          {onComplete && (
            <Button
              size="lg"
              className="flex-1"
              onClick={onComplete}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              完了
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
