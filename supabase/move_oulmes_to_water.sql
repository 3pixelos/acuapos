-- ============================================================
-- Beymen POS — move the two Oulmès waters from Sodas to the Water
-- ("Eau") subcategory. Run once in the Supabase SQL Editor.
-- ============================================================
set search_path = public, extensions;

do $$
declare
  v_water uuid := (select id from menu_categories where name_en = 'Water' and main = 'drinks');
  v_sodas uuid := (select id from menu_categories where name_en = 'Sodas' and main = 'drinks');
  v_base  int  := (select coalesce(max(sort), 0) from menu_items where category_id = v_water);
begin
  update menu_items set category_id = v_water, sort = v_base + 1
  where name = 'Oulmès (33cl)' and category_id = v_sodas;

  update menu_items set category_id = v_water, sort = v_base + 2
  where name = 'Oulmès (75cl)' and category_id = v_sodas;
end $$;
