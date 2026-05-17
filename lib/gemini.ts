import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey && typeof window === "undefined") {
  console.warn(
    "[gemini] GEMINI_API_KEY が未設定です。.env.local を確認してください。"
  );
}

export const gemini = new GoogleGenAI({ apiKey: apiKey ?? "" });

export type ProductAnalysisResult = {
  title_candidates: string[];
  category_hint: string;
  condition: "A" | "B" | "C" | "D";
  storage_location_hint: string;
  notes: string;
};

const ANALYSIS_PROMPT = `あなたはヤフオク出品の商品分析プロです。
渡された商品画像を分析し、以下を JSON で返してください。

{
  "title_candidates": ["候補1", "候補2", "候補3"],
  "category_hint": "ヤフオクカテゴリの推定（例: 食器・キッチン > 食器 > 洋食器 > 皿）",
  "condition": "A | B | C | D（A=新品同様, B=美品, C=使用感あり, D=難あり）",
  "storage_location_hint": "保管場所の推奨（例: 棚A-3）",
  "notes": "気付いた点・特徴・キズ等"
}

注意:
- タイトル候補はブランド名・型番・素材・サイズ等を含めて具体的に
- JSON のみを返し、説明文は含めない
- 商品が判別できない場合は title_candidates を空配列にする`;

export type PriceResearchSource = {
  url: string;
  title: string;
};

export type SoldComp = {
  title: string;
  price: number;
  url?: string;
  sold_at?: string;
  marketplace?: "yahoo" | "mercari" | "rakuma" | "other";
  condition?: string;
};

export type PriceResearchResult = {
  summary: string;
  min: number | null;
  max: number | null;
  median: number | null;
  sources: PriceResearchSource[];
  // V2 追加: 落札事例と信頼度
  comps: SoldComp[];
  confidence: number; // 0-1
};

const PRICE_RESEARCH_PROMPT_TEMPLATE = (input: {
  title: string;
  category_hint?: string | null;
  condition?: string | null;
  notes?: string | null;
  additional_prompt?: string | null;
}) => `あなたは中古品オークションの相場リサーチアシスタントです。
ヤフオク（auctions.yahoo.co.jp）・メルカリ（mercari.com / jp.mercari.com）・ラクマ（fril.jp）の
**実際の落札事例**を Web 検索で5〜10件探し、相場帯を算出してください。

商品名: ${input.title}
カテゴリ: ${input.category_hint ?? "未指定"}
状態ランク: ${input.condition ?? "未指定"}（A=新品同様 / B=美品 / C=使用感あり / D=難あり）
備考: ${input.notes ?? "特になし"}
${input.additional_prompt ? `\n【ユーザーからの追加指示】\n${input.additional_prompt}\n` : ""}
調査して、以下の JSON のみで回答してください（コードブロック不要・他の文章なし）:

{
  "comps": [
    { "title": "落札商品名（短く）", "price": 4800, "url": "https://...", "marketplace": "yahoo", "condition": "B", "sold_at": "2026-04-15" },
    { "title": "...", "price": 5200, "url": "...", "marketplace": "mercari" },
    ... 5〜10件
  ],
  "min": 3500,
  "max": 6800,
  "median": 5000,
  "summary": "落札相場の説明（120字以内）。状態ランク・希少性・季節要因等にも触れる。",
  "confidence": 0.7
}

注意:
- 数値はすべて日本円（整数）
- marketplace は "yahoo" / "mercari" / "rakuma" / "other" のいずれか
- url は実際の落札ページ・商品ページの URL（取得できなければ omit）
- sold_at は YYYY-MM-DD 形式（不明なら omit）
- confidence は 0.0〜1.0 で「相場推定の信頼度」を返す
  - 0.9+: 同一商品の落札事例が5件以上見つかった
  - 0.5〜0.8: 類似商品の事例が複数 or 同一商品が少数
  - 0.0〜0.4: 事例ほぼなし・推測ベース
- 落札事例が見つからない場合は comps を空配列、min/max/median を null、confidence を 0.2 程度に
- 状態ランクを考慮した相場帯にする
- ユーザーからの追加指示があれば最優先で考慮する`;

// =====================================================================
// Smart 分析: 画像認識 + Google検索 Grounding + 説明文生成を 1 回で実行
// =====================================================================

export type ProductFlaw = {
  location: string; // 「右袖口」「ファスナー金具」など
  severity: "minor" | "moderate" | "major"; // 軽微 / 中程度 / 深刻
  description: string; // 具体的な状態の説明
};

export type SmartAnalysisResult = {
  // 既存
  title_candidates: string[];
  category_hint: string;
  condition: "A" | "B" | "C" | "D";
  storage_location_hint: string;
  notes: string;
  // 新規（Smart 分析で追加）
  yahoo_category_path: string;
  yahoo_category_id: string;
  description: string;
  shipping_hint: string;
  // 相場（Grounding ベース）
  price_min: number | null;
  price_max: number | null;
  price_median: number | null;
  price_summary: string;
  // 出典 URL
  sources: PriceResearchSource[];
  // 傷・難あり（全画像から抽出）
  flaws: ProductFlaw[];
};

const SMART_PROMPT = `あなたはヤフオク・メルカリ出品のプロです。
渡された商品画像（複数枚）を分析し、Google 検索で類似品の落札相場・カテゴリ・販売文を調査して、
オークタウン CSV 取込みに必要な情報をすべて JSON で返してください。

【必須調査項目】
1. ブランド・素材・サイズ・型番（画像から判別可能な範囲で）
2. ヤフオクの実際のカテゴリツリー（最深部まで）
3. 過去3〜6ヶ月のヤフオク・メルカリの落札相場
4. 状態ランク（A/B/C/D）と推奨配送方法

【出力形式（JSON のみ・コードブロック不要）】
{
  "title_candidates": ["候補1（最も具体的）", "候補2", "候補3"],
  "category_hint": "簡易カテゴリ（短く）",
  "yahoo_category_path": "ヤフオク公式の完全カテゴリパス（例: 食器、キッチン > 食器 > 洋食器 > 皿）",
  "yahoo_category_id": "ヤフオク公式カテゴリID（10桁数字。例: 2084009001）。リーフカテゴリの ID を優先",
  "condition": "A | B | C | D",
  "storage_location_hint": "棚A-3 等",
  "notes": "気づいた点・特徴・キズ等（80字以内）",
  "description": "出品用の商品説明文（300〜500字・改行含む・販売しやすい構成。商品概要 / 状態 / サイズ / 配送 / 注意事項の順）。傷があれば本文中にも明記すること。",
  "shipping_hint": "推奨配送方法（例: ゆうパック60サイズ / クリックポスト / らくらくメルカリ便宅急便コンパクト 等）",
  "price_min": 3500,
  "price_max": 6800,
  "price_median": 5000,
  "price_summary": "相場の説明（120字以内・状態考慮）",
  "flaws": [
    { "location": "右袖口", "severity": "minor", "description": "黒い小さなシミ（直径3mm程度）" },
    { "location": "ファスナー金具", "severity": "moderate", "description": "金属部分にサビ" }
  ]
}

【ルール】
- title_candidates: ブランド/型番/素材/サイズを含めて具体的に
- yahoo_category_path: Google 検索で実際のヤフオク カテゴリツリーに対応する形に
- yahoo_category_id: Google 検索（site:auctions.yahoo.co.jp or category.yahoo.co.jp）でリーフカテゴリの URL から ID を取得すること。形式は10桁前後の半角数字のみ（例 "2084009001"）。確信が持てない場合は親カテゴリ ID で代替し、不明時は空文字 ""
- description: メルカリ・ヤフオクで売れる文章構造を意識（敬体・読みやすさ重視）
- price: 落札事例が少ない場合は null・数値は日本円整数
- 商品が判別できない場合: title_candidates を空配列、price を null に
- **flaws**: 全画像を精査して傷・汚れ・劣化・欠けを **具体的な位置 + 重度 + 説明**で箇条書き化する。
  - location は「右袖口」「ファスナー金具」「カップ底」など物理的な部位を明示
  - severity: "minor"=軽微 / "moderate"=中程度 / "major"=深刻
  - **傷が見当たらない場合は flaws を空配列 []** にする（無理に作らない）
  - **クレーム回避のため**「気にならない使用感」も控えめに列挙してOK
- JSON のみ。説明文や前後の文字列は付けないでください`;

export async function smartAnalyzeProduct(
  imageBase64List: string[],
): Promise<SmartAnalysisResult> {
  const contents = [
    { text: SMART_PROMPT },
    ...imageBase64List.map((b64) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: b64,
      },
    })),
  ];

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
      maxOutputTokens: 8192,
      // thinking モードの予算を絞ってトークンを出力に使う
      thinkingConfig: { thinkingBudget: 1024 },
    },
  });

  const rawText = response.text ?? "";
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: Partial<SmartAnalysisResult> = {};
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch (e) {
      console.warn("[smart-analyze] JSON parse failed:", e);
    }
  }

  // Grounding メタデータから URL を抽出
  const meta = response.candidates?.[0]?.groundingMetadata as
    | {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      }
    | undefined;

  const sources: PriceResearchSource[] = (meta?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w?.uri)
    .map((w) => ({ url: w.uri, title: w.title ?? w.uri }))
    .slice(0, 8);

  // flaws のサニタイズ
  type ParsedFlaw = {
    location?: string;
    severity?: string;
    description?: string;
  };
  const flawsRaw = (parsed as { flaws?: unknown }).flaws;
  const flaws: ProductFlaw[] = Array.isArray(flawsRaw)
    ? (flawsRaw as ParsedFlaw[])
        .filter(
          (f): f is ParsedFlaw & { location: string; description: string } =>
            typeof f.location === "string" &&
            typeof f.description === "string" &&
            f.location.length > 0,
        )
        .map((f): ProductFlaw => ({
          location: f.location,
          severity:
            f.severity === "major" || f.severity === "moderate"
              ? f.severity
              : "minor",
          description: f.description,
        }))
        .slice(0, 10)
    : [];

  return {
    title_candidates: Array.isArray(parsed.title_candidates)
      ? parsed.title_candidates
      : [],
    category_hint: parsed.category_hint ?? "",
    condition: (parsed.condition as "A" | "B" | "C" | "D") ?? "C",
    storage_location_hint: parsed.storage_location_hint ?? "",
    notes: parsed.notes ?? "",
    yahoo_category_path: parsed.yahoo_category_path ?? "",
    yahoo_category_id:
      typeof (parsed as { yahoo_category_id?: unknown }).yahoo_category_id ===
      "string"
        ? String(
            (parsed as { yahoo_category_id: string }).yahoo_category_id,
          ).replace(/[^0-9]/g, "")
        : "",
    description: parsed.description ?? "",
    shipping_hint: parsed.shipping_hint ?? "",
    price_min: typeof parsed.price_min === "number" ? parsed.price_min : null,
    price_max: typeof parsed.price_max === "number" ? parsed.price_max : null,
    price_median:
      typeof parsed.price_median === "number" ? parsed.price_median : null,
    price_summary: parsed.price_summary ?? "",
    sources,
    flaws,
  };
}

export async function researchProductPrice(input: {
  title: string;
  category_hint?: string | null;
  condition?: string | null;
  notes?: string | null;
  additional_prompt?: string | null;
}): Promise<PriceResearchResult> {
  const prompt = PRICE_RESEARCH_PROMPT_TEMPLATE(input);

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 512 },
    },
  });

  const rawText = response.text ?? "";
  // Grounding 利用時は responseMimeType:json が使えないため、自前で JSON 抽出
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: {
    min?: number | null;
    max?: number | null;
    median?: number | null;
    summary?: string;
    confidence?: number;
    comps?: Array<{
      title?: string;
      price?: number;
      url?: string;
      marketplace?: string;
      condition?: string;
      sold_at?: string;
    }>;
  } = {};

  // JSON 取り出し（先頭の { から最後の } まで）
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch (e) {
      console.warn("[price-research] JSON parse failed:", e);
    }
  }

  // groundingMetadata から URL リストを取り出す
  const meta = response.candidates?.[0]?.groundingMetadata as
    | {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      }
    | undefined;

  const sources: PriceResearchSource[] = (meta?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w?.uri)
    .map((w) => ({ url: w.uri, title: w.title ?? w.uri }))
    .slice(0, 8);

  type ParsedComp = {
    title?: string;
    price?: number;
    url?: string;
    sold_at?: string;
    marketplace?: string;
    condition?: string;
  };
  const comps: SoldComp[] = Array.isArray(parsed.comps)
    ? (parsed.comps as ParsedComp[])
        .filter(
          (c): c is ParsedComp & { title: string; price: number } =>
            typeof c.title === "string" &&
            typeof c.price === "number" &&
            c.price > 0,
        )
        .map((c) => ({
          title: c.title,
          price: c.price,
          url: c.url,
          sold_at: c.sold_at,
          marketplace: (c.marketplace as SoldComp["marketplace"]) ?? "other",
          condition: c.condition,
        }))
        .slice(0, 12)
    : [];

  // confidence は数値範囲チェック
  let confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    summary: parsed.summary ?? rawText.slice(0, 200),
    min: typeof parsed.min === "number" ? parsed.min : null,
    max: typeof parsed.max === "number" ? parsed.max : null,
    median: typeof parsed.median === "number" ? parsed.median : null,
    sources,
    comps,
    confidence,
  };
}

export async function analyzeProductImages(
  imageBase64List: string[]
): Promise<ProductAnalysisResult> {
  const contents = [
    { text: ANALYSIS_PROMPT },
    ...imageBase64List.map((b64) => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: b64,
      },
    })),
  ];

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
      temperature: 0.2,
    },
  });

  const text = response.text ?? "{}";
  return JSON.parse(text) as ProductAnalysisResult;
}
