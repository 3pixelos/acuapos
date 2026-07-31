-- ============================================================
-- Beymen POS — floor plan v3: Salon VIP removed, all three layers get
-- exactly 20 tables with the same 1..20 numbering (T# / S# / E#).
-- Run once in the Supabase SQL Editor, ideally when no tables are open —
-- open sessions referencing removed table ids would orphan their tiles.
-- ============================================================
set search_path = public, extensions;

delete from restaurant_tables;

-- Terrasse — T1..T20
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'TER-' || g, 'T' || g, 4, 'Terrasse', 'terrasse', g, 0, 0
from generate_series(1, 20) g;

-- Salon — S1..S20 (plus de Salon VIP)
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'SAL-' || g, 'S' || g, 4, 'Salon', 'salon', g, 0, 0
from generate_series(1, 20) g;

-- Étage 2 — E1..E20
insert into restaurant_tables (id, label, seats, zone, layer, sort, x, y)
select 'E2-' || g, 'E' || g, 4, 'Étage 2', 'etage2', g, 0, 0
from generate_series(1, 20) g;
