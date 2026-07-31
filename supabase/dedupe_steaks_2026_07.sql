-- ============================================================
-- Beymen POS — remove duplicated items under main "Steaks".
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent: keeps
-- exactly one of each, does nothing when there are no duplicates).
--
-- Covers both ways duplicates can appear: a subcategory existing twice
-- (each holding a copy of the items) and the same item inserted twice
-- into one subcategory. Order lines pointing at a removed copy are
-- repointed to the kept one first, so history stays intact.
-- ============================================================
set search_path = public, extensions;

-- 1) If a steaks subcategory exists twice (same name_en), move all items
--    onto one of them...
with dup as (
  select id,
         first_value(id) over (partition by name_en order by sort, id::text) as keeper
  from menu_categories
  where main = 'steaks'
)
update menu_items mi
set category_id = dup.keeper
from dup
where mi.category_id = dup.id and dup.id <> dup.keeper;

-- ...and drop the now-empty duplicate categories.
with dup as (
  select id,
         first_value(id) over (partition by name_en order by sort, id::text) as keeper
  from menu_categories
  where main = 'steaks'
)
delete from menu_categories mc
using dup
where mc.id = dup.id and dup.id <> dup.keeper;

-- 2) Same item twice in one subcategory: repoint order lines to the copy
--    being kept...
with k as (
  select mi.id,
         first_value(mi.id) over (
           partition by mi.category_id, mi.name order by mi.sort, mi.id::text
         ) as keeper
  from menu_items mi
  join menu_categories c on c.id = mi.category_id
  where c.main = 'steaks'
)
update order_items oi
set menu_item_id = k.keeper
from k
where oi.menu_item_id = k.id and k.id <> k.keeper;

-- ...then delete the duplicate rows.
with k as (
  select mi.id,
         first_value(mi.id) over (
           partition by mi.category_id, mi.name order by mi.sort, mi.id::text
         ) as keeper
  from menu_items mi
  join menu_categories c on c.id = mi.category_id
  where c.main = 'steaks'
)
delete from menu_items mi
using k
where mi.id = k.id and k.id <> k.keeper;
