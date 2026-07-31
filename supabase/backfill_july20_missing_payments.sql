-- ============================================================
-- Beymen POS — backfill the 3 payments that were physically collected on
-- 2026-07-20 but never recorded at the till (the tables were freed
-- without pressing Espèces/Carte): TER-4 167 + E2-20 22 + SAL-4 111
-- = 300 DH, which is exactly the gap between the physical receipts
-- (3 689) and the app's revenue (3 389). Recorded as cash. Run once.
-- ============================================================
set search_path = public, extensions;

insert into payments (session_id, cashier_id, method, amount, kind)
select v.sid::uuid, null, 'cash', v.amount, 'full'
from (values
  ('023c1741-4bff-4aa7-a788-f3f9203cef4f', 167),  -- TER-4, closed 12:02 UTC
  ('d604f840-4eb5-4fd4-929d-c02ad6b19112', 22),   -- E2-20, closed 12:57 UTC
  ('ef3d3067-5c72-4b01-aaa4-ddecbb276e80', 111)   -- SAL-4, closed 12:41 UTC
) as v(sid, amount)
where not exists (select 1 from payments p where p.session_id = v.sid::uuid);
