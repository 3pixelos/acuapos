-- ============================================================
-- Beymen POS — add 5 more items to "Extras Breakfast" (main = breakfast).
-- Additive only (keeps Confiture, Amlou, Miel, Nutella, etc. already
-- there) — each row only inserts if a same-named item isn't already in
-- the category, so this is safe to re-run.
-- ============================================================
set search_path = public, extensions;

insert into menu_items (category_id, name, description, price, sort)
select c.id, v.name, '', v.price, v.sort
from menu_categories c,
(values
  ('Fromage PCS',         6,  13),
  ('Extra Sauce Pistach', 15, 14),
  ('Extra Fruit',         10, 15),
  ('Mini Orange',         18, 16),
  ('Granula',             18, 17)
) as v(name, price, sort)
where c.main = 'breakfast'
  and c.name_en = 'Extras Breakfast'
  and not exists (
    select 1 from menu_items mi where mi.category_id = c.id and mi.name = v.name
  );
