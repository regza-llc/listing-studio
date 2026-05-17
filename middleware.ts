import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "listing-studio-auth";

// Edge runtime では node:crypto が使えないため middleware では存在チェックだけ。
// 実際の hash 比較は API 側で行う想定だが、middleware で軽量に Cookie の存在を見て
// 未認証なら /login へリダイレクトする。
// （APP_PASSWORD が未設定なら認証を無効化）

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 認証不要のパス
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // APP_PASSWORD 未設定なら認証スキップ（開発・初期セットアップ用）
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // 詳細な hash 比較はサーバー側 API で実施するが、Edge では軽い形式チェックのみ
  if (cookie.length < 32) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // _next/static や favicon は対象外。API routes も認証必須にする場合は緩める
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
