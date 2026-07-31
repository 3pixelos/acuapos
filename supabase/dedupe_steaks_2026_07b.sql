-- ============================================================
-- Beymen POS — remove the remaining duplicated steak items.
-- Run once in the Supabase SQL Editor. Verified against the live DB on
-- 2026-07-19: two seeding scripts had inserted the same dishes with
-- slightly different spellings (2KG vs 2kg, 420gr vs 420g, Šato vs Sato).
-- Each DELETE below names the exact duplicate string to drop; the copy
-- that stays is listed alongside. Kuzu Kol keeps the 445 DH row — the
-- sticker-corrected price the owner confirmed — not the printed 449.
-- Starters and Burgers are untouched (no duplicates there).
-- ============================================================
set search_path = public, extensions;

-- ---------- Roasts ----------
delete from menu_items where name = 'Asado (2KG)'
  and category_id = (select id from menu_categories where name_en = 'Roasts' and main = 'steaks');
  -- keeps: Asado (2kg) 449
delete from menu_items where name = 'Asado (4KG)'
  and category_id = (select id from menu_categories where name_en = 'Roasts' and main = 'steaks');
  -- keeps: Asado (4kg) 799
delete from menu_items where name = 'Kuzu Kol / Leg of Lamb (2KG)'
  and category_id = (select id from menu_categories where name_en = 'Roasts' and main = 'steaks');
  -- keeps: Kuzu Kol / Gigot d'agneau (2kg) 445 (sticker price)
delete from menu_items where name = 'Kuzu Gerdan / Lamb Neck (2KG)'
  and category_id = (select id from menu_categories where name_en = 'Roasts' and main = 'steaks');
  -- keeps: Kuzu Gerdan / Collier d'agneau (2kg) 389

-- ---------- Steaks ----------
delete from menu_items where name = 'Rib Eye 420gr'
  and category_id = (select id from menu_categories where name_en = 'Steaks' and main = 'steaks');
  -- keeps: Rib Eye 420g 349
delete from menu_items where name = 'Lokum 320gr'
  and category_id = (select id from menu_categories where name_en = 'Steaks' and main = 'steaks');
  -- keeps: Lokum 320g 349
delete from menu_items where name = 'New York Steak 420gr'
  and category_id = (select id from menu_categories where name_en = 'Steaks' and main = 'steaks');
  -- keeps: New York Steak 420g 369
delete from menu_items where name = 'Šato Bíryan'
  and category_id = (select id from menu_categories where name_en = 'Steaks' and main = 'steaks');
  -- keeps: Sato Biryan 599

-- ---------- Golden Steaks (every item was doubled) ----------
delete from menu_items where name in (
  'Golden Steak 500gr',
  'Golden New York Steak 500gr',
  'Golden Tomahawk 1KG',
  'Golden Asado 2.5KG',
  'Golden Kuzu Kafes 2KG'
) and category_id = (select id from menu_categories where name_en = 'Golden Steaks' and main = 'steaks');
  -- keeps: the 500g / 1kg / 2.5kg / 2kg spellings

-- ---------- renumber the three categories cleanly ----------
with ranked as (
  select i.id, row_number() over (partition by i.category_id order by i.sort, i.name) as rn
  from menu_items i
  join menu_categories c on c.id = i.category_id
  where c.main = 'steaks' and c.name_en in ('Roasts', 'Steaks', 'Golden Steaks')
)
update menu_items set sort = ranked.rn from ranked where menu_items.id = ranked.id;
