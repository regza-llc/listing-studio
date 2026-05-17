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

export type PriceResearchResult = {
  summary: string;
  min: number | null;
  max: number | null;
  median: number | null;
  sources: PriceResearchSource[];
};

const PRICE_RESEARCH_PROMPT_TEMPLATE = (input: {
  title: string;
  category_hint?: string | null;
  condition?: string | null;
  notes?: string | null;
}) => `あなたは中古品オークションの相場リサーチアシスタントです。
以下の商品について、ヤフオク・メルカリ・ラクマ等の過去3〜6ヶ月の落札相場を Web 検索で調査してください。

商品名: ${input.title}
カテゴリ: ${input.category_hint ?? "未指定"}
状態ランク: ${input.condition ?? "未指定"}（A=新品同様 / B=美品 / C=使用感あり / D=難あり）
備考: ${input.notes ?? "特になし"}

調査して、以下の JSON のみで回答してください（コードブロック不要・他の文章なし）:

{
  "min": 3500,
  "max": 6800,
  "median": 5000,
  "summary": "落札相場の説明（120字以内）。状態ランク・希少性・季節要因等にも触れる。"
}

注意:
- 数値は日本円（整数）
- 落札事例が少ない / 不明な場合は null を入れる
- 状態ランクを考慮した相場帯にする`;

export async function researchProductPrice(input: {
  title: string;
  category_hint?: string | null;
  condition?: string | null;
  notes?: string | null;
}): Promise<PriceResearchResult> {
  const prompt = PRICE_RESEARCH_PROMPT_TEMPLATE(input);

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      maxOutputTokens: 1024,
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
    .slice(0, 6);

  return {
    summary: parsed.summary ?? rawText.slice(0, 200),
    min: typeof parsed.min === "number" ? parsed.min : null,
    max: typeof parsed.max === "number" ? parsed.max : null,
    median: typeof parsed.median === "number" ? parsed.median : null,
    sources,
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
