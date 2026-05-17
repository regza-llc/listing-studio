import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "listing-studio — 3秒で、撮ったものが出品データになる。",
  description:
    "スマホで撮るだけ。AI が商品名・カテゴリ・状態を自動で仕分けして、CSV まで一気通貫で出力します。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      style={{ colorScheme: "light" }}
      className={geist.variable}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {/* メッシュグラデ背景: 邪魔しない超薄い色味 */}
          <div className="absolute -left-32 -top-32 size-[480px] rounded-full bg-sky-200/30 blur-[120px]" />
          <div className="absolute -right-32 top-1/3 size-[420px] rounded-full bg-violet-200/25 blur-[120px]" />
          <div className="absolute bottom-0 left-1/3 size-[520px] rounded-full bg-emerald-100/30 blur-[140px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
