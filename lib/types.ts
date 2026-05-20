export type ProductStatus = "draft" | "reviewing" | "ready" | "exported";

export type Carrier = "japan_post" | "yamato" | "sagawa";

export type ShippingMethod = {
  id: string;
  carrier: Carrier;
  name: string;
  size: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
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
  shipping_method_id: string | null;
  notes: string | null;
};

export type ProductWithShipping = Product & {
  shipping_method?: ShippingMethod | null;
};

export type ProductPhoto = {
  id: string;
  product_id: string;
  order_index: number;
  storage_path: string;
  uploaded_at: string;
};
