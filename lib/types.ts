export type ProductStatus = "draft" | "reviewing" | "ready" | "exported";

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
};

export type ProductPhoto = {
  id: string;
  product_id: string;
  order_index: number;
  storage_path: string;
  uploaded_at: string;
};
