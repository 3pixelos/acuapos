-- ============================================================
-- Beymen POS — menu additions (July 2026, batch B).
-- Run once in the Supabase SQL Editor.
--
--  * À La Carte: Harcha/Msemen "Amlou Miel Banane Fruits Secs" variants at
--    28 DH, each placed right below its base item; Pain Maison 30 DH;
--    Oeufs 14 DH (base price of ONE egg — the app's egg picker computes
--    26 / 40 / 54 for 2 / 3 / 4 eggs and writes the total on the line).
--  * Coffee Lovers: Café Crème 24, Capsule Coffee 25, Double Capsule 35.
--  * New drinks subcategory "Water" with the three Eau Minérale sizes.
-- ============================================================
set search_path = public, extensions;

-- ---------- À La Carte (variants slot below their base item) ----------
do $$
declare
  v_cat uuid;
  v_sort int;
begin
  select id into v_cat from menu_categories where name_fr = 'À La Carte' and main = 'breakfast';

  if not exists (select 1 from menu_items where category_id = v_cat and name = 'Harcha Amlou Miel Banane Fruits Secs') then
    select sort into v_sort from menu_items where category_id = v_cat and name = 'Harcha';
    update menu_items set sort = sort + 1 where category_id = v_cat and sort > v_sort;
    insert into menu_items (id, category_id, name, description, price, available, sort)
    values (gen_random_uuid(), v_cat, 'Harcha Amlou Miel Banane Fruits Secs', 'Amlou, miel, banane, fruits secs', 28, true, v_sort + 1);
  end if;

  if not exists (select 1 from menu_items where category_id = v_cat and name = 'Msemen Amlou Miel Banane Fruits Secs') then
    select sort into v_sort from menu_items where category_id = v_cat and name = 'Msemen';
    update menu_items set sort = sort + 1 where category_id = v_cat and sort > v_sort;
    insert into menu_items (id, category_id, name, description, price, available, sort)
    values (gen_random_uuid(), v_cat, 'Msemen Amlou Miel Banane Fruits Secs', 'Amlou, miel, banane, fruits secs', 28, true, v_sort + 1);
  end if;

  if not exists (select 1 from menu_items where category_id = v_cat and name = 'Pain Maison') then
    insert into menu_items (id, category_id, name, description, price, available, sort)
    values (gen_random_uuid(), v_cat, 'Pain Maison', '', 30, true,
            (select coalesce(max(sort), 0) + 1 from menu_items where category_id = v_cat));
  end if;

  if not exists (select 1 from menu_items where category_id = v_cat and name = 'Oeufs') then
    insert into menu_items (id, category_id, name, description, price, available, sort)
    values (gen_random_uuid(), v_cat, 'Oeufs', 'Au plat, brouillés… 1 œuf 14 / 2 œufs 26 (+14 par œuf supplémentaire)', 14, true,
            (select coalesce(max(sort), 0) + 1 from menu_items where category_id = v_cat));
  end if;
end $$;

-- ---------- Coffee Lovers additions ----------
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, v.name, '', v.price, true,
       (SELECT coalesce(max(sort), 0) FROM menu_items WHERE category_id = c.id) + v.n
FROM menu_categories c, (VALUES
  ('Café Crème', 24, 1),
  ('Capsule Coffee', 25, 2),
  ('Double Capsule Coffee', 35, 3)
) AS v(name, price, n)
WHERE c.name_en = 'Coffee Lovers' AND c.main = 'drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = v.name);

-- ---------- Water subcategory + items ----------
INSERT INTO menu_categories (name_fr, name_en, main, sort)
SELECT 'Eau', 'Water', 'drinks',
       (SELECT coalesce(max(sort), 0) + 1 FROM menu_categories)
WHERE NOT EXISTS (SELECT 1 FROM menu_categories WHERE name_en = 'Water' AND main = 'drinks');

INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, v.name, '', v.price, true, v.n
FROM menu_categories c, (VALUES
  ('Eau Minérale 33cl', 13, 1),
  ('Eau Minérale 50cl', 15, 2),
  ('Eau Minérale 75cl', 25, 3)
) AS v(name, price, n)
WHERE c.name_en = 'Water' AND c.main = 'drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = v.name);
