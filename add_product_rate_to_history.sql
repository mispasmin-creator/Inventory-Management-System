-- Run this once in the Inventory Management System Supabase project
-- (ozrgaddkpixwvcyypqid), in the SQL editor.
--
-- Adds the Raw Material screen's "Product Rate" column to the nightly
-- history snapshot, so History.jsx can show it alongside Actual Level.
-- Deploy the updated daily-inventory-history Edge Function together with
-- this migration -- until then the column stays null for new rows.

alter table public.inventory_master_history
  add column if not exists product_rate numeric(14, 2);

comment on column public.inventory_master_history.product_rate is
  'Computed exactly as the Raw Material screen''s Product Rate: LIFT-ACCOUNTS latest rate '
  '(or the bag-rate / divide-by-1000 special cases) plus the per-MT transportation rate, '
  'falling back to the Stock Adjustment Products-tab rate, then the derived semi-finished '
  'rate, then inventory_master.product_rate.';
