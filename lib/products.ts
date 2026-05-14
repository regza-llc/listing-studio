import { createClient } from "@/lib/supabase/client";
import type { Product, ProductPhoto } from "@/lib/types";

export type DraftPhotoInput = {
  processed: Blob;
};

export type SaveResult =
  | { id: string }
  | { error: string };

export async function saveDraftProduct(
  photos: DraftPhotoInput[],
  onProgress?: (done: number, total: number) => void
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
    .select(
      `id, created_at, updated_at, status, title, category_hint, condition,
       storage_location, start_price, ai_analysis, notes,
       product_photos ( storage_path, order_index )`
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { error: error.message };
  }

  return { products: (data ?? []) as ProductListItem[] };
}

export async function getPhotoSignedUrl(
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("product-photos")
    .createSignedUrl(path, expiresIn);

  if (error || !data) return null;
  return data.signedUrl;
}
