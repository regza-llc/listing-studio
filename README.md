# listing-studio

> リサイクルショップの出品作業を効率化する撮影＋メタ入力ワンストップ Web アプリ
>
> **Status**: v0.2 開発中（撮影特化 / AI は Claude に外部委託）
> **Owner**: REGZA LLC
> **First Client**: ROKA STYLE
> **Production**: https://listing-studio-flame.vercel.app

---

## 背景

ロカスタイル（古物商）のヤフオク出品は、撮影 → 商品情報入力 → CSV 出力までの一連の作業のうち、**撮影フェーズ + メタ情報入力** が最大のボトルネックになっている（月 140 品 → 月 500 品 / 1 商品あたり時間 1/4 へ短縮が目標）。

100〜200 枚を一括撮影したあとに「どこからどこまでが 1 商品か」が分からなくなる課題を解消するため、メルカリ風の撮影 UI で「撮影と同時に商品が確定」する状態を作る。

**v0.2 で大幅な方針転換**: AI による商品判別 / カテゴリ推定 / CSV 生成は listing-studio から外し、外部 AI（Claude）に ZIP を投入する運用に切り替えた。これは 2026-05-20 MTG で沖さんから「AI 機能・CSV 出力は listing-studio から消してもいいかも、Claude でなら画像のみでも判別ができたので…」という提案を受けて確定した方針（[Issue #10 RFC](https://github.com/regza-llc/listing-studio/issues/10)）。

将来的には荒木商会など他クライアントへの横展開も視野に入れた **REGZA LLC の汎用出品基盤** として育てる（[Issue #22 SaaS ロードマップ](https://github.com/regza-llc/listing-studio/issues/22)）。

---

## v0.2 スコープ

### 📷 撮影フロー
- **Web 内蔵カメラ**（getUserMedia + canvas）でフルスクリーン撮影
- **5アングル撮影ガイダンス**（📦全体 → 🏷️タグ → 🔄裏面 → 🔍キズ → ✨細部）
- 正方形クロップ + 1024px リサイズ自動
- 連続撮影 → サムネ下部表示

### ✏️ メタ情報入力（v0.2 で新スコープ）
- 撮影後の商品詳細画面で以下を手入力:
  - 商品タイトル（任意・Claude が後から生成可）
  - カテゴリヒント
  - 商品の状態（5 段階ラジオ: 新品同様 / 美品 / 良品 / 可 / 難あり）
  - しまう場所
  - 開始価格（任意・Claude が後から生成可）
  - **配送方法プルダウン**（30 項目の固定マスタから選択・[#15](https://github.com/regza-llc/listing-studio/issues/15)）
  - 備考（自由記述）

### 📋 一覧画面
- メルカリ風カードグリッド
- 検索バー（商品名・カテゴリ・備考・しまう場所を OR マッチ）
- ステータスフィルタ chip（下書き / 完成 / 出力済）
- カテゴリフィルタ chip
- **かんばんビュー**（3 列 + 本日のスループット N/100 + 7 日超え赤フラグ）
- 選択モード → 一括「完成にする / 下書きに戻す / エクスポート / 削除」

### 📦 エクスポート（v0.2 で再設計）
- **アプリ内 ZIP**: 商品 ID 別フォルダ + `metadata.json` + 写真群 + README
- **PC バッチスクリプト** `npm run export` → `C:\Yahoo\exports\YYYY-MM-DD\` に同構造で展開
- **CSV 生成は Claude 側に委譲**（外部 AI が ZIP を読み取って各媒体用 CSV を生成）

### 🔐 認証
- 合言葉ベース（環境変数 `APP_PASSWORD` で有効化）
- middleware + Cookie（30 日有効）

---

## やらないこと（v0.2 スコープ外）

- ~~AI 自動分析（タイトル・カテゴリ・状態・相場推定）~~ → v0.2 で削除（Claude に委譲）
- ~~Worth It（仕入れ前査定）~~ → v0.2 で削除（Claude に委譲）
- ~~オークタウン CSV 直接生成~~ → v0.2 で削除（Claude に委譲）
- ~~採寸 AI（音声入力）~~ → v0.2 で削除（メタ情報の `notes` 欄に手入力）
- ~~傷・難ありの自動箇条書き~~ → v0.2 で削除（メタ情報の `notes` 欄に手入力）

## やらないこと（v1.0 以降の検討）

- 複数人リアルタイム同期（[Issue #19](https://github.com/regza-llc/listing-studio/issues/19)）
- Google Drive 自動エクスポート（[Issue #20](https://github.com/regza-llc/listing-studio/issues/20)）
- KPI ダッシュボード（[Issue #21](https://github.com/regza-llc/listing-studio/issues/21)）
- マルチテナント SaaS 化（[Issue #22](https://github.com/regza-llc/listing-studio/issues/22)）
- PWA 化（ホーム画面追加）

---

## 技術スタック

| レイヤ | 採用 | 役割 |
|---|---|---|
| フロント | Next.js 16（App Router）+ React 19 | UI フレームワーク |
| スタイル | Tailwind CSS v4 + shadcn/ui | デザインシステム |
| データベース・画像保存 | Supabase（無料枠） | テーブル + Storage |
| デプロイ | Vercel（Hobby・Public リポ） | 本番公開 |
| ZIP 生成 | jszip | エクスポート機能 |
| パッケージマネージャ | npm | 依存管理 |

---

## セットアップ

### 前提

- Node.js 22+
- npm 10+
- Supabase アカウント

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
#   SUPABASE_SERVICE_ROLE_KEY
#   APP_PASSWORD

# 4. Supabase 初期化
# supabase/migrations/ の SQL を SQL Editor で順番に実行
#   - 20260515000000_initial_schema.sql
#   - 20260515000001_storage_policies.sql
#   - 20260520000000_v02_ai_removal_shipping_methods.sql (v0.2 で追加)

# 5. 開発サーバー起動
npm run dev
# → http://localhost:3000

# 6. ローカル書き出し
npm run export                       # status=ready の全商品
npm run export -- --status all       # 全ステータス
npm run export -- --help             # オプション一覧
```

詳細は `docs/SETUP.md` を参照。

---

## Claude 連携の使い方（v0.2 新フロー）

1. listing-studio で撮影 + メタ入力 → 「完成」
2. 一覧画面で完成商品を選択 → ZIP エクスポート
3. ZIP を解凍（または ZIP のまま）して Claude へ投入
4. プロンプト例:
   > これらの商品について、`metadata.json` と写真からヤフオク用タイトル / カテゴリ ID / 開始価格を生成してオークタウン CSV にしてください
5. Claude が生成した CSV をオークタウンへ手動アップロード

---

## 関連リンク

- [Umbrella Issue #18 — v0.2 ロードマップ](https://github.com/regza-llc/listing-studio/issues/18)
- [#10 RFC — AI / CSV 機能の役割再設計](https://github.com/regza-llc/listing-studio/issues/10)
- [#15 配送方法プルダウン（30 項目マスタ）](https://github.com/regza-llc/listing-studio/issues/15)
- [#19 マルチユーザー対応](https://github.com/regza-llc/listing-studio/issues/19)
- [#20 Google Drive エクスポート](https://github.com/regza-llc/listing-studio/issues/20)
- [#21 KPI ダッシュボード](https://github.com/regza-llc/listing-studio/issues/21)
- [#22 SaaS 化ロードマップ](https://github.com/regza-llc/listing-studio/issues/22)
