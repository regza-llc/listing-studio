"use client";

import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CameraCapture,
  type CapturedPhoto,
} from "@/components/camera/CameraCapture";
import { Button } from "@/components/ui/button";
import { saveDraftProduct } from "@/lib/products";

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const isFullscreen = saving || hasFullscreenCamera();

  function hasFullscreenCamera() {
    // CameraCapture 内で fixed inset-0 でフルスクリーン化される。
    // 親側のヘッダーは撮影UIに被るので、何も判定せず常に表示してOK（z-index で隠れる）
    return false;
  }

  async function saveCurrentPhotos(photos: CapturedPhoto[]) {
    if (photos.length === 0) return null;
    setSaving(true);
    setError(null);
    setProgress({ done: 0, total: photos.length });
    try {
      const result = await saveDraftProduct(
        photos.map((p) => ({ processed: p.processed })),
        (done, total) => setProgress({ done, total }),
      );
      if ("error" in result) {
        setError(result.error);
        return null;
      }
      return result.id;
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(photos: CapturedPhoto[]) {
    const productId = await saveCurrentPhotos(photos);
    if (!productId) return false;
    router.push(`/products/${productId}`);
    router.refresh();
    return true;
  }

  async function handleNextProduct(photos: CapturedPhoto[]) {
    const productId = await saveCurrentPhotos(photos);
    if (!productId) return false;
    // CameraCapture 側で photos が自動的にクリアされてカメラ継続
    return true;
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 pb-32">
      {/* 撮影フルスクリーン中はヘッダーが裏に隠れる */}
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" disabled={saving}>
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">新しい商品</h1>
          <p className="text-xs text-muted-foreground">
            連続で撮影 → 完了 or 次の商品で進めます
          </p>
        </div>
      </header>

      <CameraCapture
        onComplete={handleComplete}
        onNextProduct={handleNextProduct}
        busy={saving}
      />

      {/* 保存中の進捗バー（フルスクリーン撮影UIの上に重ねる） */}
      {saving && (
        <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 backdrop-blur-md">
          <div className="container mx-auto max-w-3xl px-4 py-3">
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>保存中... {progress.done} / {progress.total}</span>
              <span>
                {progress.total > 0
                  ? Math.round((progress.done / progress.total) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{
                  width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed inset-x-0 top-4 z-[70] mx-auto max-w-md px-4">
          <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 shadow-lg backdrop-blur-md">
            <AlertCircle className="size-4 flex-shrink-0 text-destructive" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-destructive">
                保存に失敗しました
              </p>
              <p className="break-all text-xs text-destructive/90">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs text-destructive/70 hover:text-destructive"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
