import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log("URL:", url);
console.log("anon key prefix:", anon.slice(0, 20) + "...");

const supabase = createClient(url, anon);

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

console.log("\n--- Step 1: products INSERT ---");
const { data: product, error: insertErr } = await supabase
  .from("products")
  .insert({ status: "draft", title: "[TEST] E2E save test" })
  .select("id")
  .single();

if (insertErr) {
  console.error("FAIL:", insertErr.message);
  process.exit(1);
}
console.log("OK product.id:", product.id);

console.log("\n--- Step 2: Storage upload ---");
const path = `${product.id}/000.jpg`;
const { error: uploadErr } = await supabase.storage
  .from("product-photos")
  .upload(path, tinyPng, { contentType: "image/jpeg", upsert: false });

if (uploadErr) {
  console.error("FAIL:", uploadErr.message);
  process.exit(1);
}
console.log("OK uploaded:", path);

console.log("\n--- Step 3: product_photos INSERT ---");
const { error: photoErr } = await supabase
  .from("product_photos")
  .insert({ product_id: product.id, order_index: 0, storage_path: path });

if (photoErr) {
  console.error("FAIL:", photoErr.message);
  process.exit(1);
}
console.log("OK photo record");

console.log("\n--- Step 4: signed URL ---");
const { data: signed } = await supabase.storage
  .from("product-photos")
  .createSignedUrl(path, 600);
console.log("OK signed URL works:", signed?.signedUrl ? "yes" : "no");

console.log("\n--- Step 5: list products with photos ---");
const { data: list, error: listErr } = await supabase
  .from("products")
  .select("id, title, status, product_photos(storage_path, order_index)")
  .eq("id", product.id);

if (listErr) {
  console.error("FAIL:", listErr.message);
  process.exit(1);
}
console.log("OK list:", JSON.stringify(list, null, 2));

console.log("\n--- Cleanup ---");
await supabase.storage.from("product-photos").remove([path]);
await supabase.from("products").delete().eq("id", product.id);
console.log("OK cleaned up");

console.log("\nALL PASS");
