-- ============================================================
-- Beymen POS — fruit salads. Run once in Supabase SQL Editor.
--   * Mini Salade de Fruits -> Extras Breakfast, 20 DH
--   * Salade de Fruits      -> Sucreries Gourmandes (Delicious Sweets), 79 DH
-- Additive with per-item not-exists guards — safe to re-run.
-- (Their BAR routing is app-side: BAR_ROUTED_ITEM_NAMES in types.ts.)
-- ============================================================
set search_path = public, extensions;

insert into menu_items (category_id, name, description, price, sort)
select c.id, 'Mini Salade de Fruits', '', 20,
       (select coalesce(max(mi.sort), 0) + 1 from menu_items mi where mi.category_id = c.id)
from menu_categories c
where c.main = 'breakfast' and c.name_en = 'Extras Breakfast'
  and not exists (
    select 1 from menu_items mi
    where mi.category_id = c.id and mi.name = 'Mini Salade de Fruits'
  );

insert into menu_items (category_id, name, description, price, sort)
select c.id, 'Salade de Fruits', '', 79,
       (select coalesce(max(mi.sort), 0) + 1 from menu_items mi where mi.category_id = c.id)
from menu_categories c
where c.main = 'sweets' and c.name_en = 'Delicious Sweets'
  and not exists (
    select 1 from menu_items mi
    where mi.category_id = c.id and mi.name = 'Salade de Fruits'
  );
