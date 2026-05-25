"use client";

import { useCallback, useEffect, useState } from "react";
import { type FrameKey, isFrameKey } from "@/lib/frame-templates";

/**
 * カメラ撮影の設定。撮影画面の歯車モーダルから調整し localStorage に永続化する。
 * 既定値は v0.1 のハードコード挙動（長辺 1024 / 正方形 / 品質 0.92 / 背面カメラ）を維持。
 */
export type LongEdge = 768 | 1024 | 1600 | "original";
export type AspectRatioKey = "1:1" | "4:3" | "3:4" | "original";

export type CameraSettings = {
  /** 出力画像の長辺ピクセル。"original" は切り出し後の生サイズ。 */
  longEdge: LongEdge;
  /** JPEG 品質 0.1〜1.0 */
  quality: number;
  /** 出力アスペクト比（オーバーレイ枠と保存画像で共通） */
  aspectRatio: AspectRatioKey;
  /** カメラの向き */
  facingMode: "environment" | "user";
  /** Web カメラ（getUserMedia）を優先するか。false なら OS カメラ取り込み。 */
  preferWebCamera: boolean;
  /** 1 枚目（サムネ）に合成する枠線フレーム（エクスポート時に適用） */
  frame: FrameKey;
};

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  longEdge: 1024,
  quality: 0.92,
  aspectRatio: "1:1",
  facingMode: "environment",
  preferWebCamera: true,
  frame: "none",
};

export const LONG_EDGE_OPTIONS: { value: LongEdge; label: string }[] = [
  { value: 768, label: "標準 (768px)" },
  { value: 1024, label: "高 (1024px)" },
  { value: 1600, label: "最高 (1600px)" },
  { value: "original", label: "原寸" },
];

export const ASPECT_RATIO_OPTIONS: { value: AspectRatioKey; label: string }[] = [
  { value: "1:1", label: "正方形 1:1" },
  { value: "4:3", label: "横 4:3" },
  { value: "3:4", label: "縦 3:4" },
  { value: "original", label: "カメラのまま" },
];

/**
 * アスペクト比キーを幅/高さの比率に変換。"original" は null（カメラの生比率を使う）。
 */
export function aspectRatioValue(key: AspectRatioKey): number | null {
  switch (key) {
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "3:4":
      return 3 / 4;
    case "original":
      return null;
  }
}

const STORAGE_KEY = "listing-studio:camera-settings:v1";

function sanitize(raw: unknown): CameraSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_CAMERA_SETTINGS;
  const r = raw as Partial<CameraSettings>;
  const longEdge =
    r.longEdge === 768 ||
    r.longEdge === 1024 ||
    r.longEdge === 1600 ||
    r.longEdge === "original"
      ? r.longEdge
      : DEFAULT_CAMERA_SETTINGS.longEdge;
  const aspectRatio =
    r.aspectRatio === "1:1" ||
    r.aspectRatio === "4:3" ||
    r.aspectRatio === "3:4" ||
    r.aspectRatio === "original"
      ? r.aspectRatio
      : DEFAULT_CAMERA_SETTINGS.aspectRatio;
  const quality =
    typeof r.quality === "number" && r.quality >= 0.1 && r.quality <= 1
      ? r.quality
      : DEFAULT_CAMERA_SETTINGS.quality;
  const facingMode =
    r.facingMode === "environment" || r.facingMode === "user"
      ? r.facingMode
      : DEFAULT_CAMERA_SETTINGS.facingMode;
  const preferWebCamera =
    typeof r.preferWebCamera === "boolean"
      ? r.preferWebCamera
      : DEFAULT_CAMERA_SETTINGS.preferWebCamera;
  const frame = isFrameKey(r.frame) ? r.frame : DEFAULT_CAMERA_SETTINGS.frame;
  return { longEdge, quality, aspectRatio, facingMode, preferWebCamera, frame };
}

function loadSettings(): CameraSettings {
  if (typeof window === "undefined") return DEFAULT_CAMERA_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CAMERA_SETTINGS;
    return sanitize(JSON.parse(raw));
  } catch {
    return DEFAULT_CAMERA_SETTINGS;
  }
}

/**
 * カメラ設定を localStorage に永続化しつつ読み書きするフック。
 * SSR では既定値を返し、マウント後に保存値を読み込む（hydration mismatch 回避）。
 */
export function useCameraSettings(): {
  settings: CameraSettings;
  update: (patch: Partial<CameraSettings>) => void;
  reset: () => void;
  hydrated: boolean;
} {
  const [settings, setSettings] = useState<CameraSettings>(
    DEFAULT_CAMERA_SETTINGS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: CameraSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可（プライベートモード等）でもアプリは動かす
    }
  }, []);

  const update = useCallback(
    (patch: Partial<CameraSettings>) => {
      setSettings((prev) => {
        const next = sanitize({ ...prev, ...patch });
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    persist(DEFAULT_CAMERA_SETTINGS);
  }, [persist]);

  return { settings, update, reset, hydrated };
}
