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
const supabase = createClient(url, anon);

async function detectDevPort() {
  for (const port of [3000, 3001, 3002]) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return port;
    } catch {}
  }
  throw new Error("dev server not reachable on 3000/3001/3002");
}
const PORT = await detectDevPort();
const DEV_BASE = `http://localhost:${PORT}`;
console.log(`Using dev server: ${DEV_BASE}`);

console.log("--- Step 1: fetch sample product image ---");
// picsum で実在画像取得（256x256 ランダム写真）
const imgRes = await fetch("https://picsum.photos/512");
if (!imgRes.ok) {
  console.error("FAIL: image fetch", imgRes.status);
  process.exit(1);
}
const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
console.log(`OK fetched ${imageBuffer.length} bytes`);

console.log("\n--- Step 2: create test product ---");
const { data: product, error: insertErr } = await supabase
  .from("products")
  .insert({ status: "draft", title: "[TEST] analyze test" })
  .select("id")
  .single();
if (insertErr) {
  console.error("FAIL:", insertErr.message);
  process.exit(1);
}
console.log("OK product.id:", product.id);

console.log("\n--- Step 3: upload image ---");
const path = `${product.id}/000.jpg`;
const { error: uploadErr } = await supabase.storage
  .from("product-photos")
  .upload(path, imageBuffer, { contentType: "image/jpeg", upsert: false });
if (uploadErr) {
  console.error("FAIL:", uploadErr.message);
  process.exit(1);
}
const { error: photoErr } = await supabase
  .from("product_photos")
  .insert({ product_id: product.id, order_index: 0, storage_path: path });
if (photoErr) {
  console.error("FAIL:", photoErr.message);
  process.exit(1);
}
console.log("OK uploaded + record");

console.log("\n--- Step 4: call /api/analyze ---");
const started = Date.now();
const analyzeRes = await fetch(`${DEV_BASE}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ product_id: product.id }),
});
const elapsed = Date.now() - started;
console.log(`OK HTTP ${analyzeRes.status} in ${elapsed} ms`);

const analyzeJson = await analyzeRes.json();
console.log("Response:", JSON.stringify(analyzeJson, null, 2).slice(0, 800));

if (!analyzeRes.ok) {
  console.error("FAIL: analyze API");
  await supabase.storage.from("product-photos").remove([path]);
  await supabase.from("products").delete().eq("id", product.id);
  process.exit(1);
}

console.log("\n--- Step 5: verify products table updated ---");
const { data: updated, error: queryErr } = await supabase
  .from("products")
  .select("id, status, title, category_hint, condition, ai_analysis")
  .eq("id", product.id)
  .single();
if (queryErr) {
  console.error("FAIL:", queryErr.message);
  process.exit(1);
}
console.log("Updated product:");
console.log("  status:", updated.status);
console.log("  title:", updated.title);
console.log("  category_hint:", updated.category_hint);
console.log("  condition:", updated.condition);
console.log("  ai_analysis present:", !!updated.ai_analysis);

console.log("\n--- Cleanup ---");
await supabase.storage.from("product-photos").remove([path]);
await supabase.from("products").delete().eq("id", product.id);
console.log("OK cleaned");

console.log("\nALL PASS");
