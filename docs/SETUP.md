# セットアップ詳細手順

> 初回環境構築の手順書。30 分以内で完了することを目標。

---

## 1. 必要なもの

| 項目 | バージョン | 確認 |
|---|---|---|
| Node.js | 22+ | `node -v` |
| npm | 10+ | `npm -v` |
| git | 2.40+ | `git --version` |
| GitHub CLI | 2.50+ | `gh --version` |

---

## 2. リポジトリ clone

```bash
git clone git@github.com:regza-llc/listing-studio.git
cd listing-studio
```

SSH キーが未設定の場合は HTTPS でも可:
```bash
git clone https://github.com/regza-llc/listing-studio.git
```

---

## 3. 依存パッケージインストール

```bash
npm install
```

---

## 4. Supabase プロジェクト作成

1. https://supabase.com/dashboard にログイン
2. 「New project」をクリック
3. 以下を設定:
   - Name: `roka-listing-mvp`（または任意）
   - Database Password: 強力なものを生成・控える
   - Region: `Northeast Asia (Tokyo)` 推奨
   - Pricing Plan: **Free**
4. プロジェクト作成完了まで 1〜2 分待つ

### 4-1. API キーの取得

1. 左メニュー「Project Settings」→「API」
2. 以下をコピー:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（公開禁止）

### 4-2. スキーマ作成

1. 左メニュー「SQL Editor」→「New query」
2. `supabase/migrations/20260515000000_initial_schema.sql` の内容を貼り付け
3. 「Run」で実行

### 4-3. Storage バケット作成

1. 左メニュー「Storage」→「New bucket」
2. 以下を設定:
   - Name: `product-photos`
   - Public: **false**（プライベート）
   - File size limit: `10 MB`
   - Allowed MIME types: `image/jpeg,image/png,image/webp`

---

## 5. Gemini API キー発行

社長が既存キーを共有する場合はその値を使用。

新規発行する場合:

1. https://aistudio.google.com/apikey にアクセス
2. 「Create API key」をクリック
3. 既存または新規プロジェクトを選択
4. 表示されたキー（`AIza...`）をコピー → `GEMINI_API_KEY`

---

## 6. 環境変数設定

```bash
cp .env.example .env.local
```

`.env.local` を編集して上記で取得した値を埋める。

---

## 7. 開発サーバー起動

```bash
npm run dev
```

http://localhost:3000 にアクセスして初期ページが表示されれば成功。

---

## 8. スマホからアクセスする方法（動作確認用）

開発中のスマホ動作確認:

```bash
# ローカル IP を確認
ipconfig   # Windows
# または ifconfig / ip addr   # Mac/Linux

# 開発サーバーを 0.0.0.0 で起動
npm run dev -- -H 0.0.0.0
```

スマホブラウザで `http://{ローカルIP}:3000` にアクセス。

⚠️ カメラ API は HTTPS でないと動かない場合があるため、Vercel デプロイ後に実機テスト推奨。
ローカル動作確認は `localhost`（自端末）で十分。

---

## 9. トラブルシュート

### Supabase 接続できない

- `.env.local` のキーが正しいか確認
- Supabase ダッシュボードで API キーを再生成して試す

### Gemini API エラー

- `GEMINI_API_KEY` が正しいか確認
- 無料枠（RPM 15・1 日 1,500 回）を超えていないか確認
- モデル名 `gemini-2.0-flash-exp` が利用可能か確認

### TypeScript エラー

```bash
npm run typecheck
```

### Tailwind v4 のスタイルが効かない

- `postcss.config.mjs` が存在するか確認
- `app/globals.css` の `@import "tailwindcss";` が先頭にあるか確認

---

## 10. 次のステップ

セットアップ完了後は GitHub Issues を確認:

```bash
gh issue list
```

Day 別の実装タスクが並んでいる。先頭から消化していく。
