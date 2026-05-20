# Changelog

> 主要な機能追加・バグ修正の履歴を時系列で記録。

---

## [v0.2.0-dev] - 2026-05-20（方針大転換）

### 背景

2026-05-20 ROKA STYLE MTG（沖由美さん × 飯田）で、v0.1 実機テスト（8 商品）の結果を踏まえて以下が確定:

- AI 自動分析は 8/1 件しか成功せず、運用に耐えない（Issue #11）
- 沖さんから「listing-studio は撮影と入力だけに専念し、AI 判別・CSV 生成は外部の Claude に任せた方が早い」と提案
- 飯田同意 → Option A（AI 全削除）で確定（Issue #10）
- 目標: 月 140 品 → 月 500 品 / 1 商品あたり時間 1/4 短縮

### Removed（撤去）

- `app/api/analyze/` — Gemini 自動分析エンドポイント
- `app/api/research-price/` — Gemini 相場リサーチエンドポイント
- `app/api/export/preview/` — オークタウン CSV プレビュー
- `app/worth-it/` — 仕入れ前査定機能（Phase 6）
- `lib/gemini.ts` — Gemini SDK ラッパ
- `lib/auctown.ts` — オークタウン CSV 列定義
- `components/dimension-input/` — 採寸 AI 音声入力
- `components/export/CsvPreviewModal.tsx` — CSV プレビューモーダル
- `components/product-detail/AuctownPreviewCard.tsx` — オークタウン出品サマリ
- `scripts/e2e_analyze_test.mjs` — AI 分析 E2E テスト
- `@google/genai` 依存
- products テーブルから AI 由来カラム（`ai_analysis`, `suggested_price_*`, `price_research_*`, `description`, `yahoo_category_*`, `sold_comps`, `price_confidence`, `flaws`, `dimensions`, `shipping_hint`）

### Added（追加）

- **shipping_methods マスタテーブル**（Issue #15）
  - 30 項目シード（日本郵便 10 / ヤマト 9 / 佐川 11）
  - `id, carrier, name, size, sort_order, is_active`
- **`components/ui/shipping-method-select.tsx`** — キャリア別グループ + テキスト検索プルダウン
- **products.shipping_method_id** カラム（FK）
- **`metadata.json` 出力**（ZIP エクスポート内に商品ごとに添付）
- 商品の状態を 5 段階ラジオ（新品同様 / 美品 / 良品 / 可 / 難あり）に簡素化
- supabase migration: `20260520000000_v02_ai_removal_shipping_methods.sql`

### Changed（変更）

- 商品詳細画面を 1200 行 → ~280 行に簡素化（AI 関連 UI 全廃）
- WorkflowGuide の 4 ステップを「撮影 → メタ入力 → 完成 → 出力」に変更
- 一覧 FAB を 2 つ（撮影 / 仕入れ前査定）から撮影のみに変更
- ZIP ダウンロードファイル名: `auctown_YYYY-MM-DD.zip` → `listing-studio_YYYY-MM-DD.zip`
- README + CHANGELOG 全面書き直し

### Migration Required

⚠ 本リリースは **破壊的スキーマ変更** を含みます。本番デプロイ前に migration を実行してください:

```
supabase/migrations/20260520000000_v02_ai_removal_shipping_methods.sql
```

このマイグレーションは AI 由来カラムを drop します（データは復元不可）。

---

## [v0.1.0 機能完成] - 2026-05-17（Day 6・22 push）

### Day 6 Part-3 後半（Phase 1-6 機能拡張）

#### Phase 6: Worth It 仕入れ前査定機能 ✨
- 出品せずカメラ撮影 → 15 秒で識別 + 相場 + 信頼度
- 「破棄 / 撮り直す / 本登録」の 3 択
- FlowLister の killer feature 国内クローン
- ROKA STYLE 買取現場想定

#### Phase 5: かんばん UI
- 3 列カンバン: 📷 下書き / ✓ 完成 / 📦 出力済
- **本日のスループット進捗バー** N/100 件
- **7 日以上未出品の赤フラグ**（death pile 可視化）
- ホーム右上で表示モード切替

#### Phase 4: 傷・難ありの自動箇条書き化
- Smart 分析プロンプトに flaws 抽出を追加
- 全画像精査 → location + severity (minor/moderate/major) + description
- 詳細画面に severity 別カラーバッジで表示
- description にも自動反映（クレーム回避）

#### Phase 3: 採寸 AI
- Web Speech API（日本語音声認識）
- 「身幅52、着丈70、袖丈60」→ 正規表現で自動抽出
- 単位: cm / mm / inch / g / kg
- 手動追加・編集・削除可
- CSV エクスポートに「採寸」列追加

#### Phase 2: マルチアングル撮影ガイダンス
- 5 アングル必須チェックリスト（FlowLister + Reeva 標準フロー）
  - 📦 全体（正面）/ 🏷️ タグ / 🔄 裏面 / 🔍 キズ / ✨ 細部
- 撮影で次ステップへ自動進行
- 「✓ 必須5アングル撮影完了」表示
- 返品率と直結する撮り忘れを防止

#### Phase 1: ヤフオク sold-comp 落札事例 + 信頼度スコア
- DB に `sold_comps` (jsonb) + `price_confidence` (real) 追加
- 落札事例 5-10 件を JSON 配列で取得
- マーケット別バッジ（ヤフオク / メルカリ / ラクマ）
- ⭐⭐⭐⭐⭐ 信頼度スコア（事例数 + 価格分散ベース）
- URL リンク付き

### Day 6 Part-3 前半（モダンデザイン + 拡張）

- **Medium モダンデザイン適用**
  - Geist フォント（next/font 経由）
  - メッシュグラデ背景（sky / violet / emerald）
  - 自前装飾コンポ: BorderBeam / NumberTicker / SpotlightCard / ShinyText
  - 完成カードに Gradient Border（emerald → teal）
- **キャッチコピー刷新**「3秒で、撮ったものが出品データになる。」
- AI 分析進捗バー（カード下部 + 詳細ヘッダー）

### Day 6 Part-2（Smart 分析統合）

- **Smart 分析**: 画像 + Google 検索 Grounding を 1 回で統合
  - 1 商品で全項目を 8-12 秒で生成
  - DB スキーマ拡張: `description` / `yahoo_category_path` / `shipping_hint`
- **ステータス統合**: 4 段階 → 3 段階（draft / ready / exported）
  - AI 推定済を ready に自動遷移
- **下書きへ戻す**機能（一括 + 単体）
- **WorkflowGuide** コンポ（4 ステップフロー + 次のアクションガイド）
- **編集画面 UX 改善**
  - 「保存」→「変更を保存」+ トースト
  - 「レビュー完了」→「✓ 仕分け完了 → ホームへ」+ 自動遷移
  - ステータスバッジに説明文（ホバー時）
- **検索・フィルタ追加**
  - 検索バー（商品名・カテゴリ・備考・しまう場所）
  - ステータス chip（件数バッジ付き）
  - カテゴリ chip（AI 推定の第1階層を自動抽出）
- **簡易認証**（合言葉ベース）
  - middleware + /login + APP_PASSWORD 環境変数
  - SHA256 ハッシュ + HttpOnly Cookie（30 日）
- **補足プロンプト付き再リサーチ**（例: 「2024年モデルとして」）
- **削除機能**（一括 + 単体・確認ダイアログ・Storage 写真も同時削除）
- **AI 分析の進捗表示**（経過秒数 + 進捗バー）

### Day 6 Part-2 バグ修正

- 🚨 `/login` の `useSearchParams` を Suspense でラップ
  → Vercel ビルドが prerender error で失敗していた問題を解消
- 🚨 Gemini レスポンスが途中で切れる問題
  → `maxOutputTokens` 8192 + `thinkingBudget: 1024` で出力余裕確保

### Day 6 Part-1（基盤拡張）

- **Web 内蔵カメラ**（getUserMedia + canvas）に全面リファクタ
  - 旧: file input でOSカメラ呼び出し
  - 新: フルスクリーン撮影UI + 正方形クロップ枠 + 3x3 グリッド線
  - 「次の商品」「完了」分岐
  - iOS Safari 対応（playsInline + autoPlay + muted）
  - 権限拒否時の OS カメラフォールバック
- **メルカリ風 ProductCard**（aspect-square 大サムネ + 状態バッジ + 価格 + 撮影枚数）
- **白テーマ強制化**（ダークモード自動切替を削除）
- shadcn 風 `Badge` / `Checkbox` コンポ自作
- ホーム画面に**選択モード**（一括操作用）
- **/api/export ルート実装**（JSZip + UTF-8 BOM CSV + 商品IDフォルダ + README.txt）
- **PC 同期スクリプト** `npm run export`（--status/--output/--since/--ids）
- docs/EXPORT.md 新設
- **Vercel 本番デプロイ移行**（リポ Public 化）

---

## [v0.1.0 基盤完成] - 2026-05-15（Day 1-5・10 push）

### Day 5: 商品詳細 + 編集 UI
- /products/[id] 詳細ページ実装
- 写真ギャラリー + AI 推定結果表示
- 編集フォーム（title / カテゴリ / 状態 / しまう場所 / 開始価格 / 備考）
- 再 AI 推定ボタン + レビュー完了ボタン

### Day 4: Gemini 統合
- /api/analyze ルート（Storage DL → base64 → Gemini 2.5 Flash → DB UPDATE）
- service_role 経由の admin クライアント
- 保存時に非同期 AI トリガー（fire-and-forget）
- E2E 検証: Gemini 応答 6991ms

### Day 2-3: カメラ + 保存 + 一覧
- カメラコンポーネント（連続撮影 + サムネ + 個別削除）
- 画像リサイズ機能（正方形クロップ + 長辺 1024/1920/オリジナル）
- 下書き保存（products INSERT → Storage アップロード → product_photos INSERT）
- 一覧画面（カードグリッド + signed URL サムネ + ステータスバッジ）

### Day 1: 環境構築
- `npm install` 成功（412 packages）
- Supabase プロジェクト `roka-listing-mvp` 疎通（Tokyo / Postgres 17）
- Migration 実行（products / product_photos + Storage バケット + ポリシー）
- Gemini API キー設定（gemini-2.5-flash 採用）

### Day 0: リポジトリ初期化
- `regza-llc/listing-studio` 作成
- Next.js 16 + Tailwind v4 + TypeScript + Supabase SSR + Gemini SDK 雛形
- GitHub Issues #1〜#9 作成（Day 別実装タスク）

---

## DB スキーマ拡張履歴

| Migration | 内容 | 日付 |
|---|---|---|
| `20260515000000_initial_schema` | products / product_photos + Storage | 5/15 |
| `add_price_research_columns` | suggested_price_min/max / summary / sources / researched_at | 5/17 |
| `add_smart_analyze_columns` | description / yahoo_category_path / shipping_hint | 5/17 |
| `add_sold_comps_columns` | sold_comps (jsonb) / price_confidence (real) | 5/17 |
| `add_flaws_column` | flaws (jsonb) | 5/17 |
| `add_dimensions_column` | dimensions (jsonb) | 5/17 |

---

## 参考資料

- 実装ノウハウ: [docs/LEARNINGS.md](./docs/LEARNINGS.md)
- 競合分析: `project-docs/02_Knowledge/listing-studio/competitor_analysis_2026-05-17.md`
- 設計書: `project-docs/01_Projects/roka_style/plans/2026-05-14_photo_listing_app_design.md`
- PM ヒアリング: `project-docs/00_context/policies/2026-05-14_roka_style_photo_app_mvp.md`
