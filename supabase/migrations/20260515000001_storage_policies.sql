-- ====================================================================
-- v0.1 用 Storage バケット + ポリシー
-- ====================================================================
-- v0.1 は認証なしで動作するため anon に product-photos バケットへの
-- 全権限を付与する。v1.0 で auth 導入時に authenticated に絞る。
-- ====================================================================

-- ---- バケット作成 --------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  false,
  10485760,  -- 10MB
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

-- ---- v0.1 用 anon 全権限ポリシー -----------------------------------
drop policy if exists "v0.1 anon insert product-photos" on storage.objects;
drop policy if exists "v0.1 anon select product-photos" on storage.objects;
drop policy if exists "v0.1 anon update product-photos" on storage.objects;
drop policy if exists "v0.1 anon delete product-photos" on storage.objects;

create policy "v0.1 anon insert product-photos"
on storage.objects for insert
to anon
with check (bucket_id = 'product-photos');

create policy "v0.1 anon select product-photos"
on storage.objects for select
to anon
using (bucket_id = 'product-photos');

create policy "v0.1 anon update product-photos"
on storage.objects for update
to anon
using (bucket_id = 'product-photos')
with check (bucket_id = 'product-photos');

create policy "v0.1 anon delete product-photos"
on storage.objects for delete
to anon
using (bucket_id = 'product-photos');
