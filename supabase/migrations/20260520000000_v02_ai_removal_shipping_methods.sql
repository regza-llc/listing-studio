-- ====================================================================
-- listing-studio v0.2 マイグレーション
-- ====================================================================
-- 2026-05-20 ROKA STYLE MTG（沖由美さん × 飯田）で確定した方針:
--   Option A: AI 分析機能を全削除し、撮影 → メタ入力 → ZIP 出力に専念
--   配送方法を固定マスタ（30 項目）からのプルダウンに変更
--
-- 関連 Issue:
--   #10 RFC: AI / CSV 機能の役割再設計（Option A 確定）
--   #15 配送方法プルダウン入力（30 項目固定マスタ化）
--   #17 画像 10 スロット全て商品写真用（QR 不採用）
-- ====================================================================

-- ---- products テーブル: AI 由来カラム drop -------------------------
alter table public.products
  drop column if exists ai_analysis,
  drop column if exists suggested_price_min,
  drop column if exists suggested_price_max,
  drop column if exists price_research_summary,
  drop column if exists price_research_sources,
  drop column if exists price_researched_at,
  drop column if exists description,
  drop column if exists yahoo_category_path,
  drop column if exists yahoo_category_id,
  drop column if exists sold_comps,
  drop column if exists price_confidence,
  drop column if exists flaws,
  drop column if exists dimensions;

-- shipping_hint は shipping_method_id FK に置換するため後で drop
-- （後続で FK 制約を追加してから drop する）

-- ---- shipping_methods マスタテーブル -------------------------------
create table if not exists public.shipping_methods (
  id uuid primary key default uuid_generate_v4(),
  carrier text not null check (carrier in ('japan_post', 'yamato', 'sagawa')),
  name text not null,
  size text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_shipping_methods_active_sort
  on public.shipping_methods(is_active, sort_order);

comment on table public.shipping_methods is
  'ROKA STYLE 5/20 MTG で確定した配送方法 30 項目マスタ（#15）';

-- ---- products に shipping_method_id を追加 -------------------------
alter table public.products
  add column if not exists shipping_method_id uuid
    references public.shipping_methods(id) on delete set null;

-- 旧 shipping_hint カラムを drop（AI 推奨配送方法 / Option A で不要）
alter table public.products
  drop column if exists shipping_hint;

-- ---- 配送方法シード（沖さん指定 30 項目） --------------------------
-- 日本郵便
insert into public.shipping_methods (carrier, name, size, sort_order)
values
  ('japan_post', 'ゆうパケットポストmini', null, 10),
  ('japan_post', 'ゆうパケット', null, 11),
  ('japan_post', 'ゆうパケットプラス', null, 12),
  ('japan_post', 'ゆうパック', '60', 20),
  ('japan_post', 'ゆうパック', '80', 21),
  ('japan_post', 'ゆうパック', '100', 22),
  ('japan_post', 'ゆうパック', '120', 23),
  ('japan_post', 'ゆうパック', '140', 24),
  ('japan_post', 'ゆうパック', '160', 25),
  ('japan_post', 'ゆうパック', '170', 26)
on conflict do nothing;

-- ヤマト運輸
insert into public.shipping_methods (carrier, name, size, sort_order)
values
  ('yamato', '宅急便コンパクト（EAZY）', null, 30),
  ('yamato', '家財おまかせ便', 'S', 40),
  ('yamato', '家財おまかせ便', 'A', 41),
  ('yamato', '家財おまかせ便', 'B', 42),
  ('yamato', '家財おまかせ便', 'C', 43),
  ('yamato', '家財おまかせ便', 'D', 44),
  ('yamato', '家財おまかせ便', 'E', 45),
  ('yamato', '家財おまかせ便', 'F', 46),
  ('yamato', '家財おまかせ便', 'G', 47)
on conflict do nothing;

-- 佐川急便
insert into public.shipping_methods (carrier, name, size, sort_order)
values
  ('sagawa', '飛脚宅配便', '60', 50),
  ('sagawa', '飛脚宅配便', '80', 51),
  ('sagawa', '飛脚宅配便', '100', 52),
  ('sagawa', '飛脚宅配便', '140', 53),
  ('sagawa', '飛脚宅配便', '160', 54),
  ('sagawa', '飛脚宅配便', '170', 55),
  ('sagawa', '飛脚宅配便', '180', 56),
  ('sagawa', '飛脚宅配便', '200', 57),
  ('sagawa', '飛脚宅配便', '220', 58),
  ('sagawa', '飛脚宅配便', '240', 59),
  ('sagawa', '飛脚宅配便', '260', 60)
on conflict do nothing;

-- ---- RLS（v0.2 でも引き続き無効・#19 で対応予定） -----------------
alter table public.shipping_methods disable row level security;
