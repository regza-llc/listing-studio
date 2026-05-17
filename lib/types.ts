export type ProductStatus = "draft" | "reviewing" | "ready" | "exported";

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

export type ProductFlaw = {
  location: string;
  severity: "minor" | "moderate" | "major";
  description: string;
};

export type Product = {
  id: string;
  created_at: string;
  updated_at: string;
  status: ProductStatus;
  title: string | null;
  category_hint: string | null;
  condition: string | null;
  storage_location: string | null;
  start_price: number | null;
  ai_analysis: Record<string, unknown> | null;
  notes: string | null;
  suggested_price_min: number | null;
  suggested_price_max: number | null;
  price_research_summary: string | null;
  price_research_sources: PriceResearchSource[] | null;
  price_researched_at: string | null;
  // Smart 分析で追加されたフィールド
  description: string | null;
  yahoo_category_path: string | null;
  shipping_hint: string | null;
  // 落札事例（V2 リサーチ）
  sold_comps: SoldComp[] | null;
  price_confidence: number | null;
  // 傷・難ありの自動箇条書き
  flaws: ProductFlaw[] | null;
};

export type ProductPhoto = {
  id: string;
  product_id: string;
  order_index: number;
  storage_path: string;
  uploaded_at: string;
};
