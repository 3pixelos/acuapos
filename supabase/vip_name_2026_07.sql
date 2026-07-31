-- ============================================================
-- Beymen POS — record WHO a VIP (100% remise) order was offered to.
-- Run once in the Supabase SQL Editor.
--
-- The caisse types the guest's name when picking VIP; it never appears on
-- the customer's receipt — it exists so the admin can see, in analytics,
-- who the comped orders went to.
-- ============================================================
set search_path = public, extensions;

alter table table_sessions add column if not exists vip_name text;
