"use client";

import { Loader2, Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "ログインに失敗しました");
      }
      router.push(redirectTo);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログイン失敗");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg">
            <Lock className="size-5" />
          </div>
          <h1 className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            listing-studio
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            合言葉を入力してください
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm"
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="合言葉"
            autoFocus
            disabled={loading}
            className="h-11 rounded-full"
          />

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full rounded-full"
            disabled={loading || !password.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                確認中...
              </>
            ) : (
              "ログイン"
            )}
          </Button>
        </form>

        <p className="text-center text-[10px] text-zinc-400">
          合言葉が分からない場合は管理者にお問い合わせください
        </p>
      </div>
    </main>
  );
}
