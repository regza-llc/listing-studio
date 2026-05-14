import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8 pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">listing-studio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          v0.1 ミニマル MVP — 動作確認版（2026-05-22 判断ゲート）
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">下書き一覧</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          まだ商品がありません。右下の「+」ボタンから撮影を始めてください。
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          一覧表示の実装は Issue #5 で行います。
        </p>
      </section>

      <Button
        asChild
        size="lg"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg p-0"
        aria-label="新しい商品を追加"
      >
        <Link href="/products/new">
          <Plus className="size-6" />
        </Link>
      </Button>
    </main>
  );
}
