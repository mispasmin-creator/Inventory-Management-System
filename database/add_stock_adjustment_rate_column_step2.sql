-- Step 2 (run this in the Supabase SQL editor).
-- You've already run: ADD COLUMN IF NOT EXISTS rate numeric(15, 3) NULL;
-- but "Add Product Rate" still fails because qty/status are NOT NULL with
-- check constraints, and a rate-only row doesn't set either of them.
--
-- This makes qty and status nullable (keeping their existing checks for
-- non-null values), without touching any existing rows or the Stock
-- Adjustments / OP. Stock tabs, which never insert/select rows with
-- qty or status left blank.

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
