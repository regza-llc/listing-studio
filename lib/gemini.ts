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
    model: "gemini-2.0-flash-exp",
    contents,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  return JSON.parse(text) as ProductAnalysisResult;
}
