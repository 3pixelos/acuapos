-- ============================================================
-- Acua POS — Salon table order (2026-08-03)
--
-- Reorders the SALON floor so the tables appear grouped by shape:
--
--     square (16)  ->  round (2)  ->  long / sofa (7)
--
-- The round tables were landing at the very end because they were added
-- last and `sort` was simply the order rows went in. Every floor view
-- (waiter, caisse, admin) renders `order by sort`, so fixing the numbers
-- fixes all three at once — no app change.
--
-- Touches ONLY the `sort` column of Salon tables. No table is added,
-- removed or renamed, no other room is affected, and nothing else — least
-- of all the printer settings, which live on each till — is involved.
-- Safe to re-run: it is idempotent, since running it again produces the
-- same numbering.
-- ============================================================
set search_path = public, extensions;

begin;

with ordered as (
  select
    id,
    row_number() over (
      order by
        case shape
          when 'square' then 0
          when 'round' then 1
          when 'long' then 2
          else 3
        end,
        -- keep the existing order inside each shape group, so S1..S16 stay
        -- in their familiar sequence and only the groups move
        sort,
        id
    ) as new_sort
  from restaurant_tables
  where layer = 'salon' and branch = 'main'
)
update restaurant_tables t
set sort = o.new_sort
from ordered o
where t.id = o.id;

commit;

-- ---------- verify ----------
-- Expect: S1..S16 square (1-16), then the 2 round (17-18),
-- then the 7 long (19-25).
select sort, label, shape, seats
from restaurant_tables
where layer = 'salon'
order by sort;
