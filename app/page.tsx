export default function Home() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">listing-studio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          v0.1 ミニマル MVP — 動作確認版（2026-05-22 判断ゲート）
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">セットアップ完了確認</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          このページが見えていれば、Next.js + Tailwind v4 の初期セットアップは成功しています。
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>Next.js 16（App Router + Turbopack）</li>
          <li>Tailwind CSS v4</li>
          <li>TypeScript</li>
          <li>Supabase SDK（未配線）</li>
          <li>Gemini SDK（未配線）</li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          次のステップは GitHub Issues #2（カメラ UI 実装）から。
        </p>
      </section>
    </main>
  );
}
