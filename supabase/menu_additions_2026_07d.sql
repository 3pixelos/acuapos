-- ============================================================
-- Beymen POS — menu additions (July 2026, batch D).
-- Run once in the Supabase SQL Editor. Idempotent.
--
--  * Extras Breakfast: Extra Semith 10, Extra Briouch 10
--  * Water (Eau): Detox Water 30
-- ============================================================
set search_path = public, extensions;

-- ---------- Extras Breakfast ----------
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, v.name, '', v.price, true,
       (SELECT coalesce(max(sort), 0) FROM menu_items WHERE category_id = c.id) + v.n
FROM menu_categories c, (VALUES
  ('Extra Semith', 10, 1),
  ('Extra Briouch', 10, 2)
) AS v(name, price, n)
WHERE c.name_fr = 'Extras Breakfast' AND c.main = 'breakfast'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = v.name);

-- ---------- Water ----------
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), c.id, 'Detox Water', '', 30, true,
       (SELECT coalesce(max(sort), 0) + 1 FROM menu_items WHERE category_id = c.id)
FROM menu_categories c
WHERE c.name_en = 'Water' AND c.main = 'drinks'
  AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id AND i.name = 'Detox Water');
