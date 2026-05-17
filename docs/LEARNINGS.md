# 実装ノウハウ・落とし穴メモ

> 2026-05-17 Day 6 で 22 push の大幅機能拡張で得た知見の蓄積。
> 同じ落とし穴を踏まないため・将来の v1.0 / v2.0 リファクタの参考に。

---

## 1. Vercel デプロイの落とし穴

### 🚨 `npm run build` ローカル検証は push 前の必須プロセス

**事象**: `/login` ページで `useSearchParams()` を Suspense でラップせず push。
Vercel のビルドが prerender エラーで失敗 → **旧 deployment が serving され続け**、Smart 分析の新コードが反映されない状態が継続。社長から「価格が入らない」「相場が反応しない」と複数回報告を受けた。

**根本原因**: `npm run typecheck` は通っても、Next.js の prerender エラーは `npm run build` 時にしか検出されない。

**対応**:
- ✅ push 前に **必ず** `npm run build` を実行
- ✅ client hooks (`useSearchParams`, `useParams`, `usePathname`) は **必ず Suspense でラップ**
- ✅ ユーザー報告で「動かない」が 2 回連続したら、推測修正を重ねず Vercel ログ / API レスポンスを直接確認
- ✅ `curl https://....vercel.app/api/<route>` で新フィールドの有無で旧/新ビルドを判定可能

### 🚨 Vercel + Private GitHub Org は Pro プラン必須

**事象**: Private リポを Hobby プランで import できない。

**対応**:
- Public 化（`.gitignore` で `.env.local` 除外必須）
- または Pro Trial 14日
- 個人アカウントへの移管

**判断基準**: 秘密情報チェック（`git ls-files | grep -iE "env|secret|key"` + `git log -p -S "eyJhbGc"` で過去履歴も確認）→ クリアなら Public 化が一番ラク。

### 🚨 localtunnel は不安定で実機テスト用に不向き

**事象**: ROKA 5/17 セッションで 3 回連続失敗（cross-origin block / connection refused / HTTP 408）。

**対応**:
- 第一選択は **Vercel デプロイ + Public 化**（恒久URL・HTTPS自動）
- バックアップ: cloudflared portable / tunnelmole
- Next.js 16 は `allowedDevOrigins` を `next.config.ts` で許可必須

---

## 2. Gemini 2.5 Flash の落とし穴

### 🚨 thinking モードが maxOutputTokens を食い潰す

**事象**: `researchProductPrice()` で `maxOutputTokens: 1024` の設定。
レスポンスが途中で切れ、JSON パースに失敗。`summary` に "```json\n{\n \"min\": 3300,\n  \"max\": 6000,\n  \"median\": 4500,\n  " と途切れた状態で残った。

**根本原因**: Gemini 2.5 Flash は **thinking モデル**で、思考プロセスにトークンを消費する。`maxOutputTokens` 内で thinking + 出力を行うため、出力が圧迫される。

**対応**:
- 出力用に十分な余裕を確保: smartAnalyzeProduct は `maxOutputTokens: 8192`、researchProductPrice は `4096`
- `thinkingConfig: { thinkingBudget: 1024 }` で思考の予算を明示的に絞る
- 出力 = maxOutputTokens - thinkingBudget の差分が使える

### 🚨 Google Search Grounding と `responseMimeType: "application/json"` は併用不可

**事象**: smartAnalyzeProduct で `tools: [{ googleSearch: {} }]` + `responseMimeType: "application/json"` を併用したらエラー。

**対応**:
- Grounding 使用時は MIME 型指定なし
- JSON は raw text から自前で抽出:
  ```ts
  const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  ```

### 💡 Grounding メタデータから出典 URL を取得

```ts
const meta = response.candidates?.[0]?.groundingMetadata as
  | { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
  | undefined;
const sources = (meta?.groundingChunks ?? [])
  .map((c) => c.web)
  .filter((w): w is { uri: string; title?: string } => !!w?.uri)
  .map((w) => ({ url: w.uri, title: w.title ?? w.uri }));
```

### 💡 統合プロンプト（Smart 分析）の設計パターン

1 回の API 呼び出しで全項目を取得するため、プロンプトを **JSON スキーマ + ルール**形式で構造化:

```ts
const SMART_PROMPT = `あなたは...プロです。
渡された商品画像（複数枚）を分析し、Google 検索で類似品の落札相場・カテゴリ・販売文を調査して、JSON で返してください。

【必須調査項目】
1. ブランド・素材・サイズ・型番
2. ヤフオクの実際のカテゴリツリー
3. 過去3〜6ヶ月のヤフオク・メルカリの落札相場
4. 状態ランク（A/B/C/D）と推奨配送方法

【出力形式（JSON のみ・コードブロック不要）】
{ ... 詳細スキーマ ... }

【ルール】
- title_candidates: ブランド/型番/素材/サイズを含めて具体的に
- ...
`;
```

**ポイント**:
- 「JSON のみ・コードブロック不要」を明示しても Gemini が ```json で包むことがあるため、パース側でリカバリー必須
- 出力例を JSON で示すと精度向上
- ルールセクションで暗黙の期待を言語化

### 💡 1 商品あたりのコスト試算（Gemini 2.5 Flash）

| 用途 | tokens | 単価 | コスト |
|---|---|---|---|
| 画像 5 枚 | 1,290 ($0.30/1M) | | $0.0004 |
| プロンプト | 500 ($0.30/1M) | | $0.00015 |
| 出力 JSON | 200 ($2.50/1M) | | $0.0005 |
| **1商品合計** | | | **約 0.15円** |

Grounding 使用時は thinking モードで +0.3 円程度。Smart 分析 1 回 ≒ **0.5円**。

---

## 3. Next.js 16 / React 19 の落とし穴

### 🚨 cross-origin で dev resources がブロック

**事象**: localtunnel 経由でアクセスすると `/__nextjs_font/*.woff2` や `/_next/webpack-hmr` が CORS でブロック → 永久ローディング。

**対応**: `next.config.ts` に追加:
```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.loca.lt", "*.trycloudflare.com"],
  // ...
};
```

### 🚨 SpeechRecognition は型定義なし

**対応**: グローバル window を unknown 経由でキャスト:
```ts
function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
```

### 💡 Suspense でラップした client hooks コンポ

```tsx
export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />  {/* useSearchParams を使う */}
    </Suspense>
  );
}
```

---

## 4. UX 設計の落とし穴

### 🚨 独自造語は混乱を生む

**事象**: 「Smart 分析」と独自命名 → 社長が「これ何？」と混乱。UI 上は「AI 分析」「再分析」と表記していたが、私のチャット文章で「Smart 分析」を使い続けたため不整合。

**対応**:
- 新機能命名前に既存の業界用語を確認
- 「これは普通に言うと○○のことです」で 1 行翻訳してから本題
- UI 表記と説明文の表記を統一

### 🚨 AI レスポンスのフォールバック表示

**事象**: AI 分析が裏で走っているが、UI 上で「何が起きているか分からない」とユーザーが混乱。

**対応**:
- 経過秒数 + 進捗バー（created_at から計算）
- 「AI 分析中 N s / 約 15s」のような明示表示
- ホーム画面でも商品カードに進捗オーバーレイ

### 💡 「保存」「完了」ボタンの意図伝達

**Before**: 「保存」「レビュー完了」 → 何が違うか分からない
**After**:
- 「**変更を保存**」（編集内容のみ・ステータスはそのまま）
- 「**✓ 仕分け完了 → ホームへ**」（保存して ready 遷移 + ホーム自動遷移）
- ボタンの上に補助テキストで違いを明示

### 💡 ステータス統合（4段階 → 3段階）

「AI 推定済」と「完成」が混乱を招く → AI 分析完了で直接 `ready` 遷移。
**3段階 (draft / ready / exported)** に整理することで認知負荷を削減。

---

## 5. AI を活用した機能パターン

### 💡 マルチアングル撮影ガイダンス（5アングル必須）

リサーチで「返品率と直結」と判明。Reeva / Underpriced 推奨フロー:
1. 📦 全体（正面）
2. 🏷️ タグ / ラベル
3. 🔄 裏面 / 反対側
4. 🔍 キズ / 気になる箇所
5. ✨ 細部・付属品

**実装**: 撮影画面に「次に撮るもの」+ 5ドットチェックリスト。撮影で自動進行。

### 💡 信頼度スコア + 採用 sold の透明開示

FlowLister の差別化点。「AI が推定」のブラックボックスを廃止して、根拠の落札事例 N 件を必ず開示。

```ts
// 信頼度スコアの設計
- 0.9+: 同一商品の落札事例が5件以上
- 0.5〜0.8: 類似商品の事例が複数 or 同一商品が少数
- 0.0〜0.4: 事例ほぼなし・推測ベース
```

### 💡 採寸 AI（音声入力 + 正規表現）

```ts
const regex =
  /([ぁ-んァ-ヶー一-龯]+?)\s*([0-9]+(?:\.[0-9]+)?)\s*(cm|mm|センチ|ミリ|inch|インチ|g|kg|グラム|キロ)?/g;
```

「身幅52、着丈70、袖丈60」→ [{label: "身幅", value: 52, unit: "cm"}, ...]

### 💡 傷の構造化抽出（クレーム回避）

```ts
type ProductFlaw = {
  location: string; // "右袖口" "ファスナー金具"
  severity: "minor" | "moderate" | "major";
  description: string; // "黒い小さなシミ（直径3mm）"
};
```

description にも自動反映してクレーム回避（List Perfectly は最初の6枚しか見ない弱点を回避）。

### 💡 Worth It（仕入れ前査定）の状態機械

FlowLister の killer feature。listing-studio 版:

```ts
type Phase =
  | { kind: "shooting" }       // 撮影中
  | { kind: "saving" }         // 写真アップロード中
  | { kind: "analyzing"; productId; elapsed }  // AI 査定中（経過秒数 polling）
  | { kind: "result"; productId; product }     // 結果表示
  | { kind: "error"; message };
```

結果フェーズで「破棄 / 撮り直す / 本登録」の3択。本登録時は既に DB 保存済みなので詳細画面に遷移するだけ。

---

## 6. 同時実装した競合空白

**listing-studio の独自性**: 国内ヤフオク向けで以下を一体提供しているサービスは他に存在しない:

1. 写真 → AI 完全出品データ生成（タイトル / カテゴリ / 状態 / 説明 / 配送）
2. ヤフオク / メルカリ JP / ラクマの落札 sold-comp + 信頼度
3. マルチアングル撮影ガイダンス
4. 採寸 AI（音声入力）
5. 傷の自動箇条書き
6. **Worth It 仕入れ前査定**（FlowLister 国内クローン）
7. かんばん UI + 本日のスループット
8. CSV エクスポート（オークタウン取込み想定）

---

## 7. v2.0 で追加検討すべき機能

| 機能 | 理由 |
|---|---|
| **Recreation from Sold** | 売れた listing から1タップ再出品（Cassini freshness 回避） |
| **Sold webhook → P&L 自動計算** | 売上 - 手数料 - 送料 - 仕入原価 = 利益自動算出 |
| **マルチモール同時出品** | メルカリShops / ラクマ CSV 同時生成 |
| **AI 重量推定** | 写真からゆうパックサイズ自動判定 |
| **画像加工**（背景除去・補正） | Photoroom API 統合・CTR/CVR 2倍（実証済み） |
| **ブランド誤認確認 UI** | 商標誤検出の法的リスク回避 |
| **再出品リマインダー + 自動値下げ** | death pile 防止 |
| **競合分析**（同商品の他出品者の価格） | 価格戦略の最適化 |

---

## 8. 参考ドキュメント

- 競合分析レポート: `project-docs/02_Knowledge/listing-studio/competitor_analysis_2026-05-17.md`
- 設計書: `project-docs/01_Projects/roka_style/plans/2026-05-14_photo_listing_app_design.md`
- PM ヒアリング: `project-docs/00_context/policies/2026-05-14_roka_style_photo_app_mvp.md`
- 業務インパクト試算: 上記競合分析レポート §5-D
