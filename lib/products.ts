import { createClient } from "@/lib/supabase/client";
import type {
  Product,
  ProductPhoto,
  ProductWithShipping,
  ShippingMethod,
} from "@/lib/types";

export type DraftPhotoInput = {
  processed: Blob;
};

export type SaveResult = { id: string } | { error: string };

const PRODUCT_COLUMNS = `id, created_at, updated_at, status, title, category_hint,
  condition, storage_location, start_price, shipping_method_id, notes`;

export async function saveDraftProduct(
  photos: DraftPhotoInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<SaveResult> {
  if (photos.length === 0) {
    return { error: "写真がありません" };
  }

  const supabase = createClient();

  const { data: product, error: insertErr } = await supabase
    .from("products")
    .insert({ status: "draft" })
    .select("id")
    .single();

  if (insertErr || !product) {
    return { error: insertErr?.message ?? "商品レコードの作成に失敗しました" };
  }

  const total = photos.length;
  onProgress?.(0, total);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const path = `${product.id}/${i.toString().padStart(3, "0")}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from("product-photos")
      .upload(path, photo.processed, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadErr) {
      await supabase.from("products").delete().eq("id", product.id);
      return { error: `${i + 1} 枚目のアップロード失敗: ${uploadErr.message}` };
    }

    const { error: photoInsertErr } = await supabase
      .from("product_photos")
      .insert({
        product_id: product.id,
        order_index: i,
        storage_path: path,
      });

    if (photoInsertErr) {
      return {
        error: `${i + 1} 枚目のレコード作成失敗: ${photoInsertErr.message}`,
      };
    }

    onProgress?.(i + 1, total);
  }

  return { id: product.id };
}

export type ProductListItem = Product & {
  product_photos: Pick<ProductPhoto, "storage_path" | "order_index">[];
};

export async function listProducts(): Promise<
  { products: ProductListItem[] } | { error: string }
> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, product_photos ( storage_path, order_index )`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { error: error.message };
  return { products: (data ?? []) as ProductListItem[] };
}

export async function getPhotoSignedUrl(
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("product-photos")
    .createSignedUrl(path, expiresIn);

  if (error || !data) return null;
  return data.signedUrl;
}

export type ProductDetail = ProductWithShipping & {
  product_photos: ProductPhoto[];
};

export async function getProduct(
  id: string,
): Promise<{ product: ProductDetail } | { error: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `${PRODUCT_COLUMNS},
       shipping_method:shipping_methods ( id, carrier, name, size, sort_order, is_active, created_at ),
       product_photos ( id, product_id, order_index, storage_path, uploaded_at )`,
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return { error: error?.message ?? "商品が見つかりませんでした" };
  }

  return { product: data as unknown as ProductDetail };
}

export type ProductUpdatePatch = Partial<{
  title: string | null;
  category_hint: string | null;
  condition: string | null;
  storage_location: string | null;
  start_price: number | null;
  shipping_method_id: string | null;
  notes: string | null;
  status: Product["status"];
}>;

export async function updateProduct(
  id: string,
  patch: ProductUpdatePatch,
): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function listShippingMethods(): Promise<
  { methods: ShippingMethod[] } | { error: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shipping_methods")
    .select("id, carrier, name, size, sort_order, is_active, created_at")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return { error: error.message };
  return { methods: (data ?? []) as ShippingMethod[] };
}

export function formatShippingMethod(method: ShippingMethod | null | undefined): string {
  if (!method) return "";
  return method.size ? `${method.name}（${method.size}）` : method.name;
}

export const CARRIER_LABEL: Record<string, string> = {
  japan_post: "日本郵便",
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
};
