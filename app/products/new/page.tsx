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
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (photos.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    setProgress({ done: 0, total: photos.length });

    const result = await saveDraftProduct(
      photos.map((p) => ({ processed: p.processed })),
      (done, total) => setProgress({ done, total })
    );

    if ("error" in result) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const progressPercent =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6 pb-32">
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" disabled={saving}>
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">新しい商品</h1>
      </header>

      <CameraCapture onChange={setPhotos} disabled={saving} />

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
          <AlertCircle className="size-4 mt-0.5 text-destructive flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">保存に失敗しました</p>
            <p className="text-destructive/90 break-all">{error}</p>
          </div>
        </div>
      )}

      <div className="mt-8 fixed bottom-0 inset-x-0 bg-background border-t border-border">
        <div className="container mx-auto max-w-3xl px-4 py-4">
          {saving && (
            <div className="mb-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  アップロード中 {progress.done} / {progress.total}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
          <Button
            size="lg"
            className="w-full h-14 text-base"
            disabled={photos.length === 0 || saving}
            onClick={handleSave}
          >
            {saving
              ? `保存中... (${progress.done}/${progress.total})`
              : photos.length === 0
                ? "写真を撮ってください"
                : `この商品を保存する（${photos.length} 枚）`}
          </Button>
        </div>
      </div>
    </main>
  );
}
