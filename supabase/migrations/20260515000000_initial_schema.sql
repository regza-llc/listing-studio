-- ====================================================================
-- listing-studio v0.1 ミニマル MVP 初期スキーマ
-- ====================================================================
-- 実行方法:
--   Supabase ダッシュボード → SQL Editor に貼り付けて実行
--   または supabase CLI: supabase db push
-- ====================================================================

-- ---- 拡張機能 ------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---- products テーブル ---------------------------------------------
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'ready', 'exported')),
  title text,
  category_hint text,
  condition text,
  storage_location text,
  start_price integer,
  ai_analysis jsonb,
  notes text
);

create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_created_at on public.products(created_at desc);

-- ---- product_photos テーブル ---------------------------------------
create table if not exists public.product_photos (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_index integer not null default 0,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_product_photos_product_id on public.product_photos(product_id);
create index if not exists idx_product_photos_order on public.product_photos(product_id, order_index);

-- ---- updated_at 自動更新トリガー -----------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---- RLS（v0.1 では一旦無効・v1.0 で有効化） -----------------------
-- v0.1 は飯田 1 人運用のため anon key で全操作可能にする
-- v1.0 で認証導入時に有効化する
alter table public.products disable row level security;
alter table public.product_photos disable row level security;

-- ---- Storage バケット（手動作成）----------------------------------
-- Supabase ダッシュボード → Storage で以下を作成:
--   バケット名: product-photos
--   Public: false
--   File size limit: 10 MB
--   Allowed MIME types: image/jpeg, image/png, image/webp
