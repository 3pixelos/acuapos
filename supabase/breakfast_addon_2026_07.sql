-- ============================================================
-- Beymen POS — one extra breakfast item (À La Carte), placed right below
-- the original "Baghrir" (sort 6) rather than at the end of the list.
-- Run once in the Supabase SQL Editor. Safe to run standalone whether or
-- not the item was already inserted at the end previously — it opens a
-- gap at sort 7 and (re)places the item there.
-- ============================================================
set search_path = public, extensions;

-- open a gap right after "Baghrir": push everything from Harcha (sort 7)
-- onward up by one slot, skipping the new item itself if it's already in there
UPDATE menu_items
SET sort = sort + 1
WHERE category_id = (SELECT id FROM menu_categories WHERE name_fr = 'À La Carte' AND main = 'breakfast')
  AND sort >= 7
  AND name <> 'Baghrir Amlou Miel Banane Fruits Secs';

-- insert it if it isn't there yet, in the freshly-opened slot 7
INSERT INTO menu_items (id, category_id, name, description, price, available, sort)
SELECT gen_random_uuid(), id, v.name, v.description, v.price, true, v.sort
FROM menu_categories, (VALUES
  ('Baghrir Amlou Miel Banane Fruits Secs', 'Amlou, miel, banane, fruits secs', 39, 7)
) AS v(name, description, price, sort)
WHERE menu_categories.name_fr = 'À La Carte' AND menu_categories.main = 'breakfast'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items
    WHERE menu_items.category_id = menu_categories.id
      AND menu_items.name = 'Baghrir Amlou Miel Banane Fruits Secs'
  );

-- if it was already inserted (e.g. at the old sort 24), move it into the gap
UPDATE menu_items
SET sort = 7
WHERE category_id = (SELECT id FROM menu_categories WHERE name_fr = 'À La Carte' AND main = 'breakfast')
  AND name = 'Baghrir Amlou Miel Banane Fruits Secs';
