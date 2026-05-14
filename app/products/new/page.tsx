"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { Button } from "@/components/ui/button";

export default function NewProductPage() {
  const [photoCount, setPhotoCount] = useState(0);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">新しい商品</h1>
      </header>

      <CameraCapture onChange={(photos) => setPhotoCount(photos.length)} />

      <div className="mt-8 sticky bottom-0 pt-4 pb-2 bg-background border-t border-border">
        <Button
          size="lg"
          className="w-full h-14 text-base"
          disabled={photoCount === 0}
          onClick={() => {
            alert(
              `${photoCount} 枚の写真を保存します（Issue #4 で実装予定）`
            );
          }}
        >
          {photoCount === 0
            ? "写真を撮ってください"
            : `この商品を保存する（${photoCount} 枚）`}
        </Button>
      </div>
    </main>
  );
}
