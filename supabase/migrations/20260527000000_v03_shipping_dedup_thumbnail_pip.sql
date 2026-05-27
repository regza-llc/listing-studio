-- ====================================================================
-- listing-studio v0.3 マイグレーション
-- ====================================================================
-- 2026-05-27 沖さん実機 FB 対応:
--   ③ 配送方法マスタの重複解消＋再発防止（ユニークインデックス）
--   ⑤ サムネ PiP（ピクチャーインピクチャー）フラグを products に追加
--
-- 背景:
--   #15 のシード（20260520000000）は `on conflict do nothing` だが
--   (carrier, name, size) に一意制約が無いため id 衝突しか拾えず、
--   マイグレーションが二重適用された際に全 30 項目が 2 件ずつ重複した。
-- ====================================================================

-- ---- ③ shipping_methods 重複解消 ----------------------------------
-- 残す行 = 各グループ（carrier, name, size）の id を文字列昇順にした先頭。
-- uuid は min() 不可のため id::text で順序を決定する。
-- まず重複行を参照している商品 FK を「残す行」へ付け替え
update public.products p
set shipping_method_id = keep.keep_id
from (
  select id,
    first_value(id) over (
      partition by carrier, name, coalesce(size, '') order by id::text
    ) as keep_id
  from public.shipping_methods
) keep
where p.shipping_method_id = keep.id
  and keep.id <> keep.keep_id;

-- 重複行を削除（各グループの最小 id のみ残す）
delete from public.shipping_methods sm
using (
  select id,
    first_value(id) over (
      partition by carrier, name, coalesce(size, '') order by id::text
    ) as keep_id
  from public.shipping_methods
) keep
where sm.id = keep.id
  and keep.id <> keep.keep_id;

-- 再発防止: (carrier, name, size) の一意制約（size の null は空文字扱い）。
-- 以後シードの `on conflict do nothing` が実際に機能する。
create unique index if not exists shipping_methods_carrier_name_size_uniq
  on public.shipping_methods (carrier, name, coalesce(size, ''));

-- ---- ⑤ products.thumbnail_pip -------------------------------------
alter table public.products
  add column if not exists thumbnail_pip boolean not null default false;

comment on column public.products.thumbnail_pip is
  'true の場合、ZIP 出力時に 1 枚目の左上へ 2 枚目を小さく合成（PiP）する';
