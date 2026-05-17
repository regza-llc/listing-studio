import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  getAppPassword,
  hashPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "").trim();

    if (!password) {
      return NextResponse.json(
        { error: "合言葉を入力してください" },
        { status: 400 },
      );
    }

    const expected = getAppPassword();
    if (!expected) {
      return NextResponse.json(
        {
          error:
            "サーバー側で APP_PASSWORD が未設定です。Vercel ダッシュボードで環境変数を設定してください。",
        },
        { status: 500 },
      );
    }

    if (password !== expected) {
      return NextResponse.json(
        { error: "合言葉が違います" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, hashPassword(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
