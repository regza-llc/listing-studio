"use client";

import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  SkipForward,
  SwitchCamera,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ASPECT_RATIO_OPTIONS,
  aspectRatioValue,
  type CameraSettings,
  LONG_EDGE_OPTIONS,
  useCameraSettings,
} from "@/lib/camera-settings";
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
};

// オーバーレイ枠の外側に確保する余白（上部ガイド + 下部シャッター用）。
// この値は capture() のクロップ計算とオーバーレイ描画で共通利用する。
const FRAME_RESERVE_PX = 280;

const DIGITAL_ZOOM_MAX = 4;
const DIGITAL_ZOOM_STEP = 0.1;

// マルチアングル撮影ガイド（必須5アングル）
type ShootStep = {
  key: string;
  label: string;
  hint: string;
  emoji: string;
};

const SHOOT_STEPS: ShootStep[] = [
  { key: "front", label: "全体（正面）", hint: "商品全体が枠に収まるように", emoji: "📦" },
  { key: "tag", label: "タグ / ラベル", hint: "ブランド名・型番が見える位置", emoji: "🏷️" },
  { key: "back", label: "裏面 / 反対側", hint: "裏側・底・側面など", emoji: "🔄" },
  { key: "flaw", label: "キズ / 気になる箇所", hint: "難ありがなければ近距離の質感", emoji: "🔍" },
  { key: "detail", label: "細部・付属品", hint: "金具・ボタン・付属品など", emoji: "✨" },
];

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "running"; stream: MediaStream }
  | { kind: "denied"; message: string }
  | { kind: "error"; message: string };

// MediaTrackCapabilities / ConstraintSet は zoom を型に含まないため拡張する
type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step: number };
};
type ZoomConstraintSet = MediaTrackConstraintSet & { zoom?: number };

type FrameBox = { w: number; h: number; left: number; top: number };

/**
 * ビューポート (w×h) に収まる、指定アスペクト比 R の最大の中央配置ボックスを返す。
 * オーバーレイ枠の描画と capture() のクロップ範囲で同一の値を使い、
 * 「白枠の中身 = 保存画像」を保証する。
 */
function getFrameBox(w: number, h: number, ratio: number): FrameBox {
  const maxW = w;
  const maxH = Math.max(1, h - FRAME_RESERVE_PX);
  let bw = maxW;
  let bh = bw / ratio;
  if (bh > maxH) {
    bh = maxH;
    bw = bh * ratio;
  }
  return { w: bw, h: bh, left: (w - bw) / 2, top: (h - bh) / 2 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function CameraCapture({
  onChange,
  onComplete,
  onNextProduct,
  busy = false,
  disabled,
}: CameraCaptureProps) {
  const { settings, update } = useCameraSettings();

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraState, setCameraState] = useState<CameraState>({ kind: "idle" });
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(false);
  // null = 設定に従う / true|false = ユーザーが明示的に切替えた
  const [fallbackOverride, setFallbackOverride] = useState<boolean | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showGuide, setShowGuide] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // ビューポート（video 表示領域）と video 固有解像度
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [intrinsic, setIntrinsic] = useState({ w: 0, h: 0 });

  // ズーム
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{
    min: number;
    max: number;
    step: number;
    native: boolean;
  }>({ min: 1, max: DIGITAL_ZOOM_MAX, step: DIGITAL_ZOOM_STEP, native: false });

  const useFallback = fallbackOverride ?? !settings.preferWebCamera;

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<CapturedPhoto[]>([]);
  const trackRef = useRef<MediaVideoTrackLike | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

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

  // video に stream を接続 + ビューポート/解像度監視
  useEffect(() => {
    if (cameraState.kind !== "running" || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = cameraState.stream;
    video.play().catch((e) => {
      console.error("[camera] video.play failed:", e);
    });

    const syncSizes = () => {
      setViewport({ w: video.clientWidth, h: video.clientHeight });
      if (video.videoWidth) {
        setIntrinsic({ w: video.videoWidth, h: video.videoHeight });
      }
    };
    syncSizes();
    video.addEventListener("loadedmetadata", syncSizes);

    const ro = new ResizeObserver(syncSizes);
    ro.observe(video);

    return () => {
      video.removeEventListener("loadedmetadata", syncSizes);
      ro.disconnect();
    };
  }, [cameraState]);

  const applyZoom = useCallback((next: number, range = zoomRange) => {
    const z = clamp(next, range.min, range.max);
    setZoom(z);
    if (range.native && trackRef.current) {
      trackRef.current
        .applyConstraints({ advanced: [{ zoom: z } as ZoomConstraintSet] })
        .catch((e) => console.error("[camera] zoom applyConstraints failed:", e));
    }
  }, [zoomRange]);

  const startCamera = useCallback(
    async (facing: CameraSettings["facingMode"] = settings.facingMode) => {
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
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        setCameraState({ kind: "running", stream });

        // ズーム能力の検出
        const track = stream.getVideoTracks()[0] as MediaVideoTrackLike;
        trackRef.current = track;
        let range = {
          min: 1,
          max: DIGITAL_ZOOM_MAX,
          step: DIGITAL_ZOOM_STEP,
          native: false,
        };
        if (typeof track.getCapabilities === "function") {
          const caps = track.getCapabilities() as ZoomCapabilities;
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            range = {
              min: caps.zoom.min,
              max: caps.zoom.max,
              step: caps.zoom.step || 0.1,
              native: true,
            };
          }
        }
        setZoomRange(range);
        setZoom(range.min);
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
    },
    [settings.facingMode],
  );

  const stopCamera = useCallback(() => {
    if (cameraState.kind === "running") {
      cameraState.stream.getTracks().forEach((t) => t.stop());
    }
    trackRef.current = null;
    setCameraState({ kind: "idle" });
  }, [cameraState]);

  function switchFacing() {
    const next = settings.facingMode === "environment" ? "user" : "environment";
    update({ facingMode: next });
    if (cameraState.kind === "running") {
      cameraState.stream.getTracks().forEach((t) => t.stop());
      startCamera(next);
    }
  }

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
      const vpW = video.clientWidth;
      const vpH = video.clientHeight;

      // 出力アスペクト比（"original" は video 固有比率）
      const ratio = aspectRatioValue(settings.aspectRatio) ?? vw / vh;

      // オーバーレイ白枠（ビューポート座標）
      const frame = getFrameBox(vpW, vpH, ratio);

      // object-cover のスケールとオフセットを逆算
      const coverScale = Math.max(vpW / vw, vpH / vh);
      const dispLeft = (vpW - vw * coverScale) / 2;
      const dispTop = (vpH - vh * coverScale) / 2;

      // デジタルズーム時のみ CSS transform 分を打ち消す（ネイティブはフレーム自体が拡大済み）
      const z = zoomRange.native ? 1 : zoom;
      const cx = vpW / 2;
      const cy = vpH / 2;
      const unzoomedLeft = cx + (frame.left - cx) / z;
      const unzoomedTop = cy + (frame.top - cy) / z;

      // 白枠 → video 固有座標へマッピングした切り出し矩形
      let sx = (unzoomedLeft - dispLeft) / coverScale;
      let sy = (unzoomedTop - dispTop) / coverScale;
      let sw = frame.w / (z * coverScale);
      let sh = frame.h / (z * coverScale);
      sx = clamp(sx, 0, vw);
      sy = clamp(sy, 0, vh);
      sw = Math.min(sw, vw - sx);
      sh = Math.min(sh, vh - sy);

      // 出力サイズ（長辺設定。原寸/上限以下なら拡大しない）
      const srcLong = Math.max(sw, sh);
      const targetLong =
        settings.longEdge === "original"
          ? srcLong
          : Math.min(settings.longEdge, srcLong);
      const outScale = targetLong / srcLong;
      const outW = Math.max(1, Math.round(sw * outScale));
      const outH = Math.max(1, Math.round(sh * outScale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context unavailable");

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          settings.quality,
        );
      });

      const photo: CapturedPhoto = {
        id: crypto.randomUUID(),
        processed: blob,
        previewUrl: URL.createObjectURL(blob),
        processedSize: blob.size,
      };
      setPhotos((prev) => [...prev, photo]);
      setCurrentStepIdx((idx) =>
        idx < SHOOT_STEPS.length ? idx + 1 : SHOOT_STEPS.length,
      );
    } catch (err) {
      console.error("[camera] capture failed:", err);
    } finally {
      setShooting(false);
    }
  }, [cameraState, shooting, settings, zoom, zoomRange.native]);

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
    setCurrentStepIdx(0);
  }

  async function handleComplete() {
    if (!onComplete || photos.length === 0 || busy) return;
    await onComplete(photos);
  }

  async function handleNextProduct() {
    if (!onNextProduct || photos.length === 0 || busy) return;
    const result = await onNextProduct(photos);
    if (result === false) return;
    setSavedCount((c) => c + 1);
    clearAll();
  }

  // === ピンチズーム ===
  function touchDist(touches: React.TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDist(e.touches), startZoom: zoom };
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const ratio = touchDist(e.touches) / pinchRef.current.startDist;
      applyZoom(pinchRef.current.startZoom * ratio);
    }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchRef.current = null;
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
        <button
          type="button"
          onClick={() => {
            setFallbackOverride(false);
            update({ preferWebCamera: true });
          }}
          className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Web カメラに戻す
        </button>
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
          onClick={() => startCamera()}
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
          onClick={() => setFallbackOverride(true)}
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
              <p className="text-xs text-destructive/90">{cameraState.message}</p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => setFallbackOverride(true)}
        >
          <Upload className="size-5" />
          OSカメラを使う
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => startCamera()}>
          <RefreshCw className="size-4" />
          もう一度試す
        </Button>
      </div>
    );
  }

  // === フルスクリーン撮影UI ===
  const hasPhotos = photos.length > 0;
  const ratioNum =
    aspectRatioValue(settings.aspectRatio) ??
    (intrinsic.w ? intrinsic.w / intrinsic.h : 1);
  const frame =
    viewport.w && viewport.h ? getFrameBox(viewport.w, viewport.h, ratioNum) : null;
  const digitalZoomed = !zoomRange.native && zoom > 1;
  const canZoom = zoomRange.max > zoomRange.min;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 size-full object-cover"
        style={
          digitalZoomed
            ? { transform: `scale(${zoom})`, transformOrigin: "center" }
            : undefined
        }
      />

      {/* ピンチズーム検出レイヤー（video の上・コントロールの下） */}
      <div
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* フラッシュ */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-white transition-opacity duration-100",
          flash ? "opacity-60" : "opacity-0",
        )}
      />

      {/* アスペクト比連動フレーム + グリッド */}
      {frame && <FrameOverlay frame={frame} />}

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
            <span className="ml-2 text-xs text-emerald-300">保存済 {savedCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            aria-label="カメラ設定"
            title="カメラ設定"
          >
            <Settings className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className={cn(
              "flex size-10 items-center justify-center rounded-full backdrop-blur-sm",
              showGuide ? "bg-sky-500 text-white" : "bg-black/50 text-white/70",
            )}
            aria-label="撮影ガイドの表示切替"
            title="撮影ガイドの表示切替"
          >
            <Tag className="size-5" />
          </button>
        </div>
      </div>

      {/* 撮影ガイド: 現在のステップ + 5段階チェックリスト */}
      {showGuide && (
        <div className="absolute inset-x-0 top-16 z-10 px-4">
          <div className="rounded-2xl bg-black/65 p-3 backdrop-blur-md">
            {currentStepIdx < SHOOT_STEPS.length ? (
              <div className="flex items-center gap-3">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-500 text-lg shadow-lg shadow-sky-500/30">
                  {SHOOT_STEPS[currentStepIdx].emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-sky-300">
                    {currentStepIdx + 1} / {SHOOT_STEPS.length}・次に撮るもの
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    {SHOOT_STEPS[currentStepIdx].label}
                  </p>
                  <p className="truncate text-[11px] text-white/70">
                    {SHOOT_STEPS[currentStepIdx].hint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentStepIdx((idx) => Math.min(SHOOT_STEPS.length, idx + 1))
                  }
                  className="flex flex-shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/80"
                  aria-label="このステップをスキップ"
                >
                  <SkipForward className="size-3" />
                  スキップ
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-300">
                <Check className="size-5" />
                <p className="text-sm font-semibold">
                  必須5アングル撮影完了！追加で何枚でも撮れます
                </p>
              </div>
            )}

            {/* チェックリスト・ドット */}
            <div className="mt-2 flex justify-between gap-1">
              {SHOOT_STEPS.map((s, idx) => {
                const done = idx < currentStepIdx;
                const active = idx === currentStepIdx;
                return (
                  <div key={s.key} className="flex flex-1 flex-col items-center gap-0.5">
                    <div
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[9px] font-bold transition-colors",
                        done && "bg-emerald-500 text-white",
                        active && "bg-sky-500 text-white ring-2 ring-sky-300",
                        !done && !active && "bg-white/15 text-white/50",
                      )}
                    >
                      {done ? <Check className="size-3" /> : idx + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[8px] leading-tight text-center",
                        done && "text-emerald-300",
                        active && "text-sky-200",
                        !done && !active && "text-white/40",
                      )}
                    >
                      {s.emoji}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ズームスライダー（右端・縦） */}
      {canZoom && (
        <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => applyZoom(zoom + (zoomRange.step || 0.1) * 5)}
            className="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            aria-label="ズームイン"
          >
            <Plus className="size-4" />
          </button>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step || 0.1}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="h-32 w-1.5 cursor-pointer appearance-none rounded-full bg-white/30 accent-white [writing-mode:vertical-lr] [direction:rtl]"
            aria-label="ズーム"
          />
          <button
            type="button"
            onClick={() => applyZoom(zoom - (zoomRange.step || 0.1) * 5)}
            className="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            aria-label="ズームアウト"
          >
            <Minus className="size-4" />
          </button>
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {zoom.toFixed(1)}x
          </span>
        </div>
      )}

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
              <span className="text-[10px] font-semibold leading-none">次の商品</span>
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
              <span className="text-[10px] font-semibold leading-none">完了</span>
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

      {/* 設定モーダル */}
      {showSettings && (
        <CameraSettingsModal
          settings={settings}
          onChange={update}
          onSwitchCamera={switchFacing}
          onUseOsCamera={() => {
            setShowSettings(false);
            setFallbackOverride(true);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ===== サブコンポーネント =====

function FrameOverlay({ frame }: { frame: FrameBox }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.w,
        height: frame.h,
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

function CameraSettingsModal({
  settings,
  onChange,
  onSwitchCamera,
  onUseOsCamera,
  onClose,
}: {
  settings: CameraSettings;
  onChange: (patch: Partial<CameraSettings>) => void;
  onSwitchCamera: () => void;
  onUseOsCamera: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">カメラ設定</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* アスペクト比 */}
          <SettingGroup label="アスペクト比">
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIO_OPTIONS.map((o) => (
                <SegButton
                  key={o.value}
                  active={settings.aspectRatio === o.value}
                  onClick={() => onChange({ aspectRatio: o.value })}
                >
                  {o.label}
                </SegButton>
              ))}
            </div>
          </SettingGroup>

          {/* 解像度 */}
          <SettingGroup label="解像度（長辺）">
            <div className="grid grid-cols-2 gap-2">
              {LONG_EDGE_OPTIONS.map((o) => (
                <SegButton
                  key={String(o.value)}
                  active={settings.longEdge === o.value}
                  onClick={() => onChange({ longEdge: o.value })}
                >
                  {o.label}
                </SegButton>
              ))}
            </div>
          </SettingGroup>

          {/* 画質 */}
          <SettingGroup label={`JPEG 画質（${Math.round(settings.quality * 100)}%）`}>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={settings.quality}
              onChange={(e) => onChange({ quality: Number(e.target.value) })}
              className="w-full accent-zinc-900"
            />
          </SettingGroup>

          {/* カメラ向き */}
          <SettingGroup label="カメラ">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={onSwitchCamera}
            >
              <SwitchCamera className="size-4" />
              {settings.facingMode === "environment" ? "背面カメラ" : "前面カメラ"}（切替）
            </Button>
          </SettingGroup>

          <button
            type="button"
            onClick={onUseOsCamera}
            className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            OSカメラ取り込みに切り替える
          </button>
        </div>

        <Button className="mt-5 w-full" onClick={onClose}>
          <Check className="size-4" />
          完了
        </Button>
      </div>
    </div>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-zinc-600">{label}</p>
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-300 text-zinc-700 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
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
            <Button size="lg" className="flex-1" onClick={onComplete} disabled={busy}>
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

// applyConstraints の advanced で zoom を渡すための最小型
type MediaVideoTrackLike = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities;
};
