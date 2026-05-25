"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PhotoManager } from "@/components/product-detail/PhotoManager";
import { ShippingMethodSelect } from "@/components/ui/shipping-method-select";
import { Textarea } from "@/components/ui/textarea";
import {
  getPhotoSignedUrl,
  getProduct,
  updateProduct,
  type ProductDetail,
} from "@/lib/products";

type Editable = {
  title: string;
  category_hint: string;
  condition: string;
  storage_location: string;
  start_price: string;
  shipping_method_id: string | null;
  notes: string;
};

const CONDITION_OPTIONS = ["新品同様", "美品", "良品", "可", "難あり"];

function toEditable(p: ProductDetail): Editable {
  return {
    title: p.title ?? "",
    category_hint: p.category_hint ?? "",
    condition: p.condition ?? "",
    storage_location: p.storage_location ?? "",
    start_price: p.start_price?.toString() ?? "",
    shipping_method_id: p.shipping_method_id,
    notes: p.notes ?? "",
  };
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Editable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    const result = await getProduct(id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setProduct(result.product);
    setEdit(toEditable(result.product));

    const urls: Record<string, string> = {};
    for (const photo of result.product.product_photos) {
      const url = await getPhotoSignedUrl(photo.storage_path);
      if (url) urls[photo.id] = url;
    }
    setPhotoUrls(urls);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!edit) return;
    setSaving(true);
    const result = await updateProduct(id, {
      title: edit.title || null,
      category_hint: edit.category_hint || null,
      condition: edit.condition || null,
      storage_location: edit.storage_location || null,
      start_price: edit.start_price ? Number(edit.start_price) : null,
      shipping_method_id: edit.shipping_method_id,
      notes: edit.notes || null,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      setSavedAt(new Date());
      setError(null);
      await load();
    }
  }

  async function handleComplete() {
    setCompleting(true);
    await handleSave();
    const result = await updateProduct(id, { status: "ready" });
    setCompleting(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      router.push("/");
    }
  }

  async function handleDelete() {
    if (!confirm("この商品を削除しますか？写真も全て削除されます。")) return;
    const response = await fetch("/api/delete-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: [id] }),
    });
    if (response.ok) {
      router.push("/");
    } else {
      setError("削除に失敗しました");
    }
  }

  if (error && !product) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="inline-flex items-center text-sm text-zinc-600">
          <ArrowLeft className="mr-1 h-4 w-4" /> 戻る
        </Link>
        <Card className="mt-4 border-red-200 bg-red-50 p-4">
          <p className="flex items-center text-sm text-red-700">
            <AlertCircle className="mr-2 h-4 w-4" /> {error}
          </p>
        </Card>
      </main>
    );
  }

  if (!product || !edit) {
    return (
      <main className="mx-auto flex max-w-2xl items-center justify-center px-4 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> 一覧へ
        </Link>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="flex items-center text-xs text-emerald-700">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {savedAt.toLocaleTimeString()} 保存済
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-red-200 bg-red-50 p-3">
          <p className="flex items-center text-sm text-red-700">
            <AlertCircle className="mr-2 h-4 w-4" /> {error}
          </p>
        </Card>
      )}

      <PhotoManager
        productId={id}
        photos={product.product_photos}
        photoUrls={photoUrls}
        onChanged={load}
      />

      <Card className="space-y-4 p-4">
        <div>
          <Label htmlFor="title">タイトル</Label>
          <Input
            id="title"
            value={edit.title}
            onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            placeholder="商品タイトル（Claude が後で生成）"
          />
        </div>

        <div>
          <Label htmlFor="category_hint">カテゴリヒント</Label>
          <Input
            id="category_hint"
            value={edit.category_hint}
            onChange={(e) => setEdit({ ...edit, category_hint: e.target.value })}
            placeholder="例: 食器、衣類、家電"
          />
        </div>

        <div>
          <Label>商品の状態</Label>
          <RadioGroup
            value={edit.condition}
            onValueChange={(v) => setEdit({ ...edit, condition: v })}
            className="mt-2 grid grid-cols-5 gap-2"
          >
            {CONDITION_OPTIONS.map((opt) => (
              <Label
                key={opt}
                className="flex cursor-pointer items-center justify-center rounded-md border border-zinc-300 p-2 text-sm hover:bg-zinc-50 has-[input:checked]:border-zinc-900 has-[input:checked]:bg-zinc-900 has-[input:checked]:text-white"
              >
                <RadioGroupItem value={opt} className="sr-only" />
                {opt}
              </Label>
            ))}
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="storage_location">しまう場所</Label>
          <Input
            id="storage_location"
            value={edit.storage_location}
            onChange={(e) =>
              setEdit({ ...edit, storage_location: e.target.value })
            }
            placeholder="例: 棚A-3、倉庫2F"
          />
        </div>

        <div>
          <Label htmlFor="start_price">開始価格（円）</Label>
          <Input
            id="start_price"
            type="number"
            inputMode="numeric"
            value={edit.start_price}
            onChange={(e) => setEdit({ ...edit, start_price: e.target.value })}
            placeholder="任意（Claude が後で生成）"
          />
        </div>

        <div>
          <Label>配送方法</Label>
          <ShippingMethodSelect
            value={edit.shipping_method_id}
            onChange={(v) => setEdit({ ...edit, shipping_method_id: v })}
          />
        </div>

        <div>
          <Label htmlFor="notes">備考</Label>
          <Textarea
            id="notes"
            value={edit.notes}
            onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            placeholder="自由記述（傷の場所、付属品の有無など）"
            rows={3}
          />
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-zinc-200 bg-white px-4 py-3">
        <Button
          variant="outline"
          onClick={handleSave}
          disabled={saving}
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          保存
        </Button>
        <Button
          onClick={handleComplete}
          disabled={completing}
          className="flex-1"
        >
          {completing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          完了
        </Button>
      </div>
    </main>
  );
}
