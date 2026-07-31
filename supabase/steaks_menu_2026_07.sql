-- ============================================================
-- Beymen POS — Steaks main category: replace the items of its five
-- existing subcategories (Starters, Burgers, Roasts, Steaks, Golden
-- Steaks) with the new menu. Run once in Supabase SQL Editor, AFTER
-- menu_mains_2026_07.sql (which created these categories under
-- main = 'steaks' — lowercase, matching the app's MENU_MAINS keys).
--
-- Safe to re-run: items are rebuilt from scratch each time.
--
-- Notes on prices confirmed with the user:
--   * Kuzu Kol / Leg of Lamb (Roasts): printed price was covered by a
--     pink correction sticker -> confirmed 445DH for 2KG.
--   * Kuzu Gerdan / Lamb Neck (Roasts): printed price 289DH was
--     superseded by a pink correction sticker -> confirmed 389DH for 2KG.
-- ============================================================
set search_path = public, extensions;

-- ============================================
-- CATEGORIES — already exist (menu_mains_2026_07.sql); just align the
-- display names with the new menu. No inserts: inserting again would
-- create duplicates and every item insert below would then double-match.
-- ============================================
update menu_categories set name_fr = 'Starters'      where main = 'steaks' and name_en = 'Starters';
update menu_categories set name_fr = 'Burgers'       where main = 'steaks' and name_en = 'Burgers';
update menu_categories set name_fr = 'Roasts'        where main = 'steaks' and name_en = 'Roasts';
update menu_categories set name_fr = 'Steaks'        where main = 'steaks' and name_en = 'Steaks';
update menu_categories set name_fr = 'Golden Steaks' where main = 'steaks' and name_en = 'Golden Steaks';

-- ============================================
-- WIPE the old items of the five steaks subcategories (they still hold
-- the original menu import) so the lists below are authoritative.
-- ============================================
delete from menu_items
where category_id in (select id from menu_categories where main = 'steaks');

-- ============================================
-- STARTERS
-- ============================================
INSERT INTO menu_items (category_id, name, description, price, sort)
SELECT id, v.name, v.description, v.price, v.sort
FROM menu_categories, (VALUES
  ('Dana Carpaccio', 'Parmesan, Moutarde, Roca, Huile d''olive', 169, 1),
  ('Gavurdagi Salatasi', 'Laitue, Tomate, Oignon, Noix, Grenade', 119, 2),
  ('Beymen', 'Fromage de chèvre, Noix, Figues, Sauce à l''orange, Mesclun salade, Pomme, Mélasse de grenade', 129, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Starters' AND menu_categories.main = 'steaks';

-- ============================================
-- BURGERS
-- ============================================
INSERT INTO menu_items (category_id, name, description, price, sort)
SELECT id, v.name, v.description, v.price, v.sort
FROM menu_categories, (VALUES
  ('Burger Köfte', 'Oignon Caramélisé, Viande Hachée, Cheddar', 119, 1),
  ('Lokum Burger', 'Oignon caramélisé, Filet de bœuf, Cheddar', 165, 2),
  ('Asado Burger', 'Oignon Caramélisé, Bœuf Fumé, Cheddar', 139, 3)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Burgers' AND menu_categories.main = 'steaks';

-- ============================================
-- ROASTS (weight variants as separate rows)
-- ============================================
INSERT INTO menu_items (category_id, name, description, price, sort)
SELECT id, v.name, v.description, v.price, v.sort
FROM menu_categories, (VALUES
  ('Asado (2KG)', 'Côtes courtes de bœuf, rôties pendant 6 heures', 449, 1),
  ('Asado (4KG)', 'Côtes courtes de bœuf, rôties pendant 6 heures', 799, 2),
  ('Kuzu Kol / Leg of Lamb (2KG)', 'Gigot d''agneau, rôti pendant 6 heures', 445, 3),
  ('Kuzu Gerdan / Lamb Neck (2KG)', 'Collier d''agneau, rôti pendant 6 heures', 389, 4)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Roasts' AND menu_categories.main = 'steaks';

-- ============================================
-- STEAKS
-- ============================================
INSERT INTO menu_items (category_id, name, description, price, sort)
SELECT id, v.name, v.description, v.price, v.sort
FROM menu_categories, (VALUES
  -- "Biftek - Steaks" menu page — all served with baked potato, mushroom
  -- sauce and turkish rice (per the page header, not repeated per item).
  -- Listed first per the user's request.
  ('Kuzu Kafes 1.5KG', 'Grilled rack of lamb on a charcoal — Carré d''agneau grillé sur charbon', 799, 1),
  ('Tomahawk 1.1KG', 'Marinated bone-in ribeye steak — Steak de cowboy mariné', 749, 2),
  ('T-Bone 450gr', 'Marinated beef short-loin — Longe courte de bœuf marinée', 320, 3),
  ('Dallas 450gr', 'Beef loin — Longe de bœuf', 320, 4),
  ('Rib Eye 420gr', 'Côte de Boeuf Savoureuse, Juteuse et Grillée', 349, 5),
  ('Lokum 320gr', 'Filet de Boeuf', 349, 6),
  ('New York Steak 420gr', 'Surlonge de Boeuf Désossée Coupée en Lanières', 369, 7),
  ('Šato Bíryan', 'Filet Mignon Rôti', 599, 8),
  ('New York Cut Lamb Skewer', 'Brochettes d''agneau rôties', 329, 9)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Steaks' AND menu_categories.main = 'steaks';

-- ============================================
-- GOLDEN STEAKS
-- ============================================
INSERT INTO menu_items (category_id, name, description, price, sort)
SELECT id, v.name, v.description, v.price, v.sort
FROM menu_categories, (VALUES
  ('Golden Steak 500gr', 'Served with fries, spinach & mushroom sauce and turkish rice', 990, 1),
  ('Golden New York Steak 500gr', 'Served with fries, spinach & mushroom sauce and turkish rice', 990, 2),
  ('Golden Tomahawk 1KG', 'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, patlican salatasi, cerkez tavugu', 1990, 3),
  ('Golden Asado 2.5KG', 'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, patlican salatasi, cerkez tavugu', 2490, 4),
  ('Golden Kuzu Kafes 2KG', 'Served with fries, spinach & mushroom sauce, turkish rice, acili ezme, haydari, patlican salatasi, cerkez tavugu', 2490, 5)
) AS v(name, description, price, sort)
WHERE menu_categories.name_en = 'Golden Steaks' AND menu_categories.main = 'steaks';
