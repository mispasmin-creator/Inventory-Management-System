-- Run this once in the Supabase SQL editor for the main inventory project
-- (the one behind SUPABASE_URL / SUPABASE_ANON_KEY in .env).
--
-- Adds a "rate" column to stock_adjustment so the new "Add Product Rate"
-- option on the Stock Adjustment > Products tab can save a rate-only row
-- (no qty / status) for a given firm + item.

ALTER TABLE public.stock_adjustment
  ADD COLUMN IF NOT EXISTS rate numeric(15, 3) NULL;

ALTER TABLE public.stock_adjustment
  ALTER COLUMN qty DROP NOT NULL;

ALTER TABLE public.stock_adjustment
  DROP CONSTRAINT IF EXISTS raw_material_factory_entries_qty_check;

ALTER TABLE public.stock_adjustment
  ADD CONSTRAINT stock_adjustment_qty_check CHECK (qty IS NULL OR qty > 0);

ALTER TABLE public.stock_adjustment
  ALTER COLUMN status DROP NOT NULL;

ALTER TABLE public.stock_adjustment
  DROP CONSTRAINT IF EXISTS raw_material_factory_entries_status_check;

ALTER TABLE public.stock_adjustment
  ADD CONSTRAINT stock_adjustment_status_check
  CHECK (status IS NULL OR status = ANY (ARRAY['Factory +'::text, 'Factory -'::text]));
