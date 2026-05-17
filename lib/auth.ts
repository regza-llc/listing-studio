import { createHash } from "node:crypto";

const COOKIE_NAME = "listing-studio-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30日

export function getAppPassword(): string | null {
  return process.env.APP_PASSWORD?.trim() || null;
}

export function hashPassword(password: string): string {
  // 環境変数の APP_SALT があれば足してハッシュ強化（未設定でも動く）
  const salt = process.env.APP_SALT ?? "listing-studio-v1";
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_COOKIE_MAX_AGE = COOKIE_MAX_AGE;

export function isAuthenticated(cookieValue: string | undefined): boolean {
  const expected = getAppPassword();
  if (!expected) {
    // APP_PASSWORD 未設定なら認証を無効化（開発時の利便性）
    return true;
  }
  if (!cookieValue) return false;
  return cookieValue === hashPassword(expected);
}
