-- Run this in the Inventory Management System Supabase project (ozrgaddkpixwvcyypqid).
--
-- Daily stock history for raw material + finished goods.
--
-- WHY IT WORKS THIS WAY
-- ---------------------
-- Stock levels are NOT stored in this database. inventory_master and
-- finished_goods_inventory_master only hold opening stock + config; the real
-- levels are computed in the browser (src/services/api.js) by combining data
-- from five separate Supabase projects (Inventory, Purchase, Production, Order,
-- Sale of Raw Material).
--
-- A plain pg_cron job therefore cannot compute the daily figures — this database
-- cannot see the other four projects. Instead the nightly job calls the
-- `daily-inventory-history` Edge Function, which re-runs the same calculation as
-- api.js and writes the result back into the two history tables below.
--
-- This script is additive: it does not read, alter or drop any existing table,
-- column, function or trigger used by the app.
--
-- ORDER OF INSTALLATION
--   1. Run section 0-3 of this file.
--   2. Deploy the Edge Function (see supabase/functions/daily-inventory-history).
--   3. Fill in the placeholders in section 4 and run it.

-- ---------------------------------------------------------------------------
-- 0. Clean up the earlier (incorrect) attempt
-- ---------------------------------------------------------------------------
-- The first version of this file snapshotted columns that do not exist on the
-- live masters (actual_level, product_rate, ...). Its cron job fails every
-- night, so remove it. Both history tables were empty, so nothing is lost.

select cron.unschedule('capture_inventory_daily_history')
where exists (select 1 from cron.job where jobname = 'capture_inventory_daily_history');

drop view if exists public.inventory_master_daily_movement;
drop view if exists public.finished_goods_daily_movement;
drop function if exists public.capture_inventory_daily_history(date);
drop table if exists public.inventory_master_history;
drop table if exists public.finished_goods_inventory_history;

-- ---------------------------------------------------------------------------
-- 1. Raw material daily history
-- ---------------------------------------------------------------------------
-- Column names mirror what the Raw Material screen shows, so a history row can
-- be read the same way as a live row.

-- Only the columns the History page reads are stored. The movement and rate
-- figures still drive the calculation inside the Edge Function; they are simply
-- not persisted, since nothing reads them back.
create table if not exists public.inventory_master_history (
  id bigserial primary key,
  snapshot_date date not null,
  firm_name text not null,
  item_name text not null,
  unit text default '',
  actual_level numeric(14, 3),
  captured_at timestamptz not null default timezone('utc', now()),
  unique (snapshot_date, firm_name, item_name)
);

comment on table public.inventory_master_history is
  'Closing stock per raw material item per IST day. Written by the daily-inventory-history Edge Function.';
comment on column public.inventory_master_history.snapshot_date is
  'IST business day these figures are the closing values for.';
comment on column public.inventory_master_history.actual_level is
  'Computed exactly as the Raw Material screen: op_stock + receipts - consumption + adjustments since 2026-06-23.';

create index if not exists idx_inventory_master_history_snapshot_date
  on public.inventory_master_history using btree (snapshot_date desc);

create index if not exists idx_inventory_master_history_firm_item_date
  on public.inventory_master_history using btree (firm_name, item_name, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- 2. Finished goods daily history
-- ---------------------------------------------------------------------------

create table if not exists public.finished_goods_inventory_history (
  id bigserial primary key,
  snapshot_date date not null,
  firm_name text not null,
  product_name text not null,
  current_level numeric(14, 3),
  captured_at timestamptz not null default timezone('utc', now()),
  unique (snapshot_date, firm_name, product_name)
);

comment on table public.finished_goods_inventory_history is
  'Closing stock per finished good per IST day. Written by the daily-inventory-history Edge Function.';
comment on column public.finished_goods_inventory_history.current_level is
  'Computed by the Edge Function as op_stock + purchase + production + adjustment - sales + sales_return - consumption - purchase_return; only the result is stored.';

create index if not exists idx_finished_goods_history_snapshot_date
  on public.finished_goods_inventory_history using btree (snapshot_date desc);

create index if not exists idx_finished_goods_history_firm_product_date
  on public.finished_goods_inventory_history using btree (firm_name, product_name, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- 3. Day-on-day movement views
-- ---------------------------------------------------------------------------
-- These answer "us product ka aaj kitna move hua" without any client-side maths.

create or replace view public.inventory_master_daily_movement as
select
  h.snapshot_date,
  h.firm_name,
  h.item_name,
  h.unit,
  h.actual_level,
  h.actual_level - lag(h.actual_level) over (
    partition by h.firm_name, h.item_name order by h.snapshot_date
  ) as qty_change
from public.inventory_master_history h;

create or replace view public.finished_goods_daily_movement as
select
  h.snapshot_date,
  h.firm_name,
  h.product_name,
  h.current_level,
  h.current_level - lag(h.current_level) over (
    partition by h.firm_name, h.product_name order by h.snapshot_date
  ) as qty_change
from public.finished_goods_inventory_history h;

-- ---------------------------------------------------------------------------
-- 4. Nightly 12 AM IST job
-- ---------------------------------------------------------------------------
-- Run this part only AFTER the Edge Function is deployed.
--
-- Replace <SERVICE_ROLE_KEY> with the project's service_role key
-- (Dashboard > Project Settings > API). Do not commit the filled-in version.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('daily_inventory_history')
where exists (select 1 from cron.job where jobname = 'daily_inventory_history');

-- 18:30 UTC == 00:00 IST. The function defaults to snapshotting the IST day
-- that just ended.
select cron.schedule(
  'daily_inventory_history',
  '30 18 * * *',
  $job$
  select net.http_post(
    url := 'https://ozrgaddkpixwvcyypqid.supabase.co/functions/v1/daily-inventory-history',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 5. Checking the job
-- ---------------------------------------------------------------------------
-- Last few runs:
--   select jobid, runid, status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'daily_inventory_history')
--   order by start_time desc limit 10;
--
-- Rows captured per day:
--   select snapshot_date, count(*) from public.inventory_master_history
--   group by snapshot_date order by snapshot_date desc;
