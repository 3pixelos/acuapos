-- ============================================================
-- Beymen POS — menu additions/split (July 2026, batch C).
-- Run once in the Supabase SQL Editor. Idempotent.
--
--  * Delicious Sweets: Boule de Glace 13 DH.
--  * Pressed Juices: Carotte Pressée 69 DH.
--  * "Crêpe ou Gaufre" (22 DH) and "Crêpe ou Gaufre Nutella" (32 DH) each
--    split into two separate items — Crêpe/Gaufre are different orders,
--    not one dish with an "or". Originals removed once split.
-- ============================================================
set search_path = public, extensions;

-- ---------- Delicious Sweets: Boule de Glace ----------
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, 'Boule de Glace', '', 13,
       true, (SELECT coalesce(max(sort), 0) + 1 FROM menu_items WHERE category_id = c.id)
FROM menu_categories c
WHERE c.name_en = 'Delicious Sweets' AND c.main = 'sweets'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = 'Boule de Glace');

-- ---------- Pressed Juices: Carotte Pressée ----------
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, 'Carotte Pressée', '', 69,
       true, (SELECT coalesce(max(sort), 0) + 1 FROM menu_items WHERE category_id = c.id)
FROM menu_categories c
WHERE c.name_en = 'Pressed Juices' AND c.main = 'drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = 'Carotte Pressée');

-- ---------- split "Crêpe ou Gaufre" (22) into Crêpe Sucre / Gaufre Sucre ----------
do $$
declare
  v_cat uuid;
  v_sort int;
begin
  select category_id, sort into v_cat, v_sort from menu_items where name = 'Crêpe ou Gaufre';
  if v_cat is not null then
    if not exists (select 1 from menu_items where category_id = v_cat and name = 'Crêpe Sucre') then
      insert into menu_items (id, category_id, name, description, price, available, sort)
      values (gen_random_uuid(), v_cat, 'Crêpe Sucre', '', 22, true, v_sort);
    end if;
    if not exists (select 1 from menu_items where category_id = v_cat and name = 'Gaufre Sucre') then
      insert into menu_items (id, category_id, name, description, price, available, sort)
      values (gen_random_uuid(), v_cat, 'Gaufre Sucre', '', 22, true, v_sort);
    end if;
    delete from menu_items where name = 'Crêpe ou Gaufre' and category_id = v_cat;
  end if;
end $$;

-- ---------- split "Crêpe ou Gaufre Nutella" (32) into Crêpe Nutella / Gaufre Nutella ----------
do $$
declare
  v_cat uuid;
  v_sort int;
begin
  select category_id, sort into v_cat, v_sort from menu_items where name = 'Crêpe ou Gaufre Nutella';
  if v_cat is not null then
    if not exists (select 1 from menu_items where category_id = v_cat and name = 'Crêpe Nutella') then
      insert into menu_items (id, category_id, name, description, price, available, sort)
      values (gen_random_uuid(), v_cat, 'Crêpe Nutella', '', 32, true, v_sort);
    end if;
    if not exists (select 1 from menu_items where category_id = v_cat and name = 'Gaufre Nutella') then
      insert into menu_items (id, category_id, name, description, price, available, sort)
      values (gen_random_uuid(), v_cat, 'Gaufre Nutella', '', 32, true, v_sort);
    end if;
    delete from menu_items where name = 'Crêpe ou Gaufre Nutella' and category_id = v_cat;
  end if;
end $$;
