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

## v0.1 機能一覧（2026-05-17 大幅拡張済）

### 📷 撮影フロー
- **Web 内蔵カメラ**（getUserMedia + canvas）でフルスクリーン撮影
- **5アングル撮影ガイダンス**（📦全体 → 🏷️タグ → 🔄裏面 → 🔍キズ → ✨細部）
- 正方形クロップ + 1024px リサイズ自動
- 連続撮影 → サムネ下部表示
- 「完了」「次の商品」で AI 分析を裏で起動

### ✨ AI 自動分析（Smart 分析）
- **Gemini 2.5 Flash + Google 検索 Grounding** を 1 回で実行（8〜12秒）
- 撮影 → 自動生成される項目:
  - 商品タイトル（ブランド・型番・素材・サイズ含む 3 候補）
  - ヤフオク公式カテゴリパス（Web 検索で実カテゴリツリー照合）
  - 状態ランク A/B/C/D
  - 想定相場帯（min/max/median）
  - 推奨開始価格（中央値を自動採用）
  - **出品説明文**（300-500字・販売用整った構成）
  - 推奨配送方法
  - **傷・難ありの自動箇条書き**（location + severity + description）
- 1 商品あたりコスト: 約 0.5 円

### 💰 相場リサーチ（sold-comp）
- ヤフオク・メルカリ・ラクマの**実際の落札事例 5-10 件** + URL
- ⭐⭐⭐⭐⭐ **信頼度スコア**（事例数 + 価格分散から算出）
- 「下限/中央値/上限を採用」ボタンで開始価格に自動セット
- **補足プロンプト付き再リサーチ**（例: 「2024年モデルとして」「未使用品として」）

### 🔍 Worth It（仕入れ前査定）
- 出品せずに「いくらで売れる？」を 15 秒で判定
- ROKA STYLE 買取現場で使う想定
- 結果画面で「破棄 / 撮り直す / 本登録」の 3 択

### 📏 採寸 AI
- **Web Speech API 音声入力**: 「身幅52、着丈70、袖丈60」→ 自動抽出
- 単位対応: cm / mm / inch / g / kg
- 手動追加・編集・削除可

### 📋 一覧画面
- メルカリ風カードグリッド（白基調・SpotlightCard ホバー効果）
- **検索バー**（商品名・カテゴリ・備考・しまう場所を OR マッチ）
- ステータスフィルタ chip（下書き / 完成 / 出力済）
- カテゴリフィルタ chip（AI 推定の第1階層）
- **かんばんビュー**（3列 + 本日のスループット N/100 + 7日超え赤フラグ）
- 選択モード → 一括「完成にする / 下書きに戻す / エクスポート / 削除」

### 📦 エクスポート
- **アプリ内 ZIP**（写真フォルダ + UTF-8 BOM CSV + README）→ ZIP ダウンロード
- **PC 同期スクリプト** `npm run export` → `C:\Yahoo\exports\YYYY-MM-DD\` に展開

### 🔐 認証
- 合言葉ベース（環境変数 `APP_PASSWORD` で有効化）
- middleware + Cookie（30 日有効）

### ✏️ 商品詳細・編集
- 写真ギャラリー（スワイプ可能）
- 全 AI 出力フィールドを編集可能
- 「変更を保存」「✓ 仕分け完了 → ホームへ」（自動遷移）
- 削除・下書きへ戻す

---

## やらないこと（v1.0 以降）

- 複数人リアルタイム同期
- Recreation from Sold（売却商品の1タップ再出品）
- Sold webhook → P&L 自動計算
- マルチモール同時出品（メルカリShops / ラクマ への CSV 同時生成）
- AI 重量推定（写真からゆうパックサイズ判定）
- PWA 化（ホーム画面追加）

---

## 技術スタック

| レイヤ | 採用 | 役割 |
|---|---|---|
| フロント | Next.js 16（App Router）+ React 19 | UI フレームワーク |
| スタイル | Tailwind CSS v4 + shadcn/ui | デザインシステム（Geist フォント・自前装飾コンポ: BorderBeam / NumberTicker / SpotlightCard / ShinyText） |
| データベース・画像保存 | Supabase（無料枠） | テーブル + Storage |
| **AI 統合分析** | **Gemini 2.5 Flash + Google 検索 Grounding** | 画像理解 + Web 検索 + 商品分類 + 説明文生成 + 相場推定 |
| 音声入力 | Web Speech API（webkitSpeechRecognition） | 採寸自動転記 |
| デプロイ | Vercel（Hobby・Public リポ） | 本番公開 |
| ZIP 生成 | jszip | エクスポート機能 |
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

# 6. ローカル書き出し（写真 + CSV を C:\Yahoo\exports\YYYY-MM-DD\ に展開）
npm run export                       # status=ready の全商品
npm run export -- --status all       # 全ステータス
npm run export -- --help             # オプション一覧
```

詳細は `docs/SETUP.md` / `docs/EXPORT.md` を参照。

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
├ scripts/
│  └ export.mjs                   # PC 同期スクリプト（npm run export）
├ CHANGELOG.md                    # 変更履歴（Day 別の主要追加・修正）
└ docs/
   ├ SETUP.md                     # 詳細セットアップ
   ├ MVP_SCOPE.md                 # スコープ定義詳細
   ├ EXPORT.md                    # エクスポート機能（写真 + CSV ローカル書き出し）
   └ LEARNINGS.md                 # 実装ノウハウ・落とし穴メモ（Gemini / Next.js / UX）
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
