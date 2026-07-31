-- ============================================================
-- Beymen POS — takeout ("À Emporter") layer: 5 tables EMP1..EMP5.
-- Run once in the Supabase SQL Editor. Idempotent.
--
-- Ordering, printing and billing work exactly like a normal table; the
-- only difference is the receipts, which the app stamps "À EMPORTER"
-- because the labels start with EMP (handled in the frontend).
-- ============================================================
set search_path = public, extensions;

insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'EMP-' || g, 'EMP' || g, 1, 'À Emporter', 'emporter', g, 0, 0
from generate_series(1, 5) g
where not exists (select 1 from restaurant_tables where id = 'EMP-' || g);
