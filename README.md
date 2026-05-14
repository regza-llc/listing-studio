# listing-studio

> ヤフオク / メルカリ等への出品作業を効率化する、撮影〜AI 商品化までのワンストップ Web アプリ
>
> **Status**: v0.1 ミニマル MVP 開発中（動作確認版・2026-05-22 判断ゲート）
> **Owner**: REGZA LLC
> **First Client**: ROKA STYLE

---

## 背景

ロカスタイル（古物商）のヤフオク出品は、撮影 → AI 商品化 → CSV 出力までの一連の作業のうち、**撮影フェーズ** が最大のボトルネックになっている（月 220 品 → 月 500 品の目標達成に向けて 140 品分の不足）。

100〜200 枚を一括撮影したあとに「どこからどこまでが 1 商品か」が分からなくなる課題を解消するため、メルカリ風の撮影 UI で「撮影と同時に商品が確定」する状態を作る。

将来的には荒木商会など他クライアントへの横展開も視野に入れた **REGZA LLC の汎用出品基盤** として育てる。

---

## v0.1 ミニマル MVP スコープ（2026-05-22 まで）

### やること

- スマホブラウザ（Chrome 想定）でカメラ起動 → 連続撮影
- 撮影 → 画像リサイズ（**正方形クロップ + 長辺 1024 / 1920 / オリジナル**）→ Supabase Storage 保存
- 商品単位で下書き保存（「+ 新しい商品」UI で明示区切り）
- Gemini 2.0 Flash で商品名・カテゴリ・状態の AI 推定
- カードグリッド一覧表示

### やらないこと（v1.0 以降）

- Google 認証（v0.1 は飯田 1 人運用）
- 複数人リアルタイム同期
- Google 検索 Grounding による相場検索
- オークタウン CSV 出力（既存 Claude Code スキルが担う）
- PWA 化（ホーム画面追加）

### 動作確認 OK の判定

- スマホ Chrome で「撮影 → AI 商品名表示 → 一覧追加」が動く
- 撮影 → AI 結果まで 30 秒以内
- Gemini の商品名推定が体感で「使えそう」と感じるレベル

---

## 技術スタック

| レイヤ | 採用 | 役割 |
|---|---|---|
| フロント | Next.js 16（App Router）+ React 19 | UI フレームワーク |
| スタイル | Tailwind CSS v4 + shadcn/ui | デザインシステム |
| データベース・画像保存 | Supabase（無料枠） | テーブル + Storage |
| AI 推定 | Gemini 2.0 Flash | 画像理解 + 商品分類 |
| デプロイ | Vercel（v1.0 以降） | 公開 |
| パッケージマネージャ | npm | 依存管理 |

---

## セットアップ

### 前提

- Node.js 22+ （24 推奨）
- npm 10+
- GitHub アクセス（`regza-llc` org メンバー）
- Supabase アカウント
- Google AI Studio アカウント（Gemini API キー）

### 初回セットアップ

```bash
# 1. clone
git clone git@github.com:regza-llc/listing-studio.git
cd listing-studio

# 2. 依存インストール
npm install

# 3. 環境変数
cp .env.example .env.local
# .env.local を編集して以下を埋める:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   GEMINI_API_KEY

# 4. Supabase 初期化（別ターミナル）
# Supabase ダッシュボードで新規プロジェクト作成
# プロジェクト URL と anon key を .env.local にコピー
# supabase/migrations/ の SQL をダッシュボードの SQL Editor で実行

# 5. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

詳細は `docs/SETUP.md` を参照。

---

## プロジェクト構造

```
listing-studio/
├ README.md                       # このファイル
├ package.json
├ next.config.ts
├ tsconfig.json
├ postcss.config.mjs              # Tailwind v4 用
├ components.json                 # shadcn/ui 設定
├ .env.example                    # 環境変数テンプレ
├ app/                            # Next.js App Router
│  ├ layout.tsx
│  ├ page.tsx                     # ホーム / 下書き一覧
│  ├ globals.css                  # Tailwind v4 エントリ
│  ├ products/
│  │  └ [id]/page.tsx             # 商品編集
│  └ api/
│     └ analyze/route.ts          # Gemini 呼び出し
├ components/
│  ├ ui/                          # shadcn/ui コンポ
│  ├ camera/                      # カメラ系コンポ
│  └ product-card/                # 商品カード
├ lib/
│  ├ supabase/
│  │  ├ client.ts                 # ブラウザ用
│  │  └ server.ts                 # サーバー用
│  ├ gemini.ts                    # Gemini SDK ラッパ
│  ├ image-resize.ts              # 正方形クロップ + リサイズ
│  └ types.ts                     # 共通型
├ supabase/
│  └ migrations/                  # SQL マイグレーション
└ docs/
   ├ SETUP.md                     # 詳細セットアップ
   ├ MVP_SCOPE.md                 # スコープ定義詳細
   └ ARCHITECTURE.md              # 設計図（後付け）
```

---

## ロードマップ

| バージョン | 期間 | 内容 |
|---|---|---|
| **v0.1**（今ここ） | 2026-05-15 〜 05-22 | ミニマル MVP・動作確認 |
| v1.0 | 2026-05-23 〜 08-06 | 認証・複数人同期・相場検索・CSV 出力・PWA |
| v2.0 | 2026-08 〜 | AI 自動グルーピング・撮影方向ガイド・複数媒体対応 |

---

## 開発フロー

1. **GitHub Issues** で Day 別 / 機能別タスクを管理
2. Issue ベースでブランチ切り（`feature/issue-{N}-{topic}`）
3. PR ベースで main にマージ
4. v0.1 完了時に動作確認版をローカル起動 → 5/22 判断ゲート

---

## 関連ドキュメント

- 設計書（社内）: `01_Projects/roka_style/plans/2026-05-14_photo_listing_app_design.md`
- PM ヒアリング記録: `00_context/policies/2026-05-14_roka_style_photo_app_mvp.md`
- 5/13 MTG 議事録: `01_Projects/roka_style/MTG/2026-05-13_AI導入MTG_議事録.md`

---

## ライセンス

Private / Proprietary — REGZA LLC
