-- Purchase-system egress reduction for the Inventory app.
--
-- Run this on the PURCHASE Supabase project (the one that owns "LIFT-ACCOUNTS").
-- It is READ-ONLY: one STABLE function, no table / trigger / data change.
--
-- Why: every inventory load used to download the whole "LIFT-ACCOUNTS" history (~2,400 rows x 18 columns)
-- just to (a) sum "Actual Quantity" per firm + product and (b) find the latest receipt's rate per firm +
-- product. This function does the filtering/grouping in the database and returns only what the app needs,
-- while the app keeps doing the exact same arithmetic it always did:
--
--   quantities : per firm::product, the "Actual Quantity" values of rows that count towards stock
--                (quality check done, lab test recorded, on/after the selected date), listed in the same
--                order the app used to read them ("Actual 1" DESC). The app adds them up itself, so the
--                floating-point result is unchanged.
--   rate_rows  : per firm::product, the single latest-receipt row (rate / transport rate source).
--                Packaging-bag items (p_bag_item_keys) need every row, because their rate is only valid
--                once unload approval is complete, so all their rows are returned.
--
-- Mirrors src/services/externalSyncService.js (fetchLiftDataMaps) and src/services/helpers.js:
--   normalizeFirmKey / normalizeItemKey, isLabTestRecorded, the "Date Of Test -> Actual 2 -> Date Of
--   Receiving" date priority and the "selected date" comparison.

create or replace function public.lift_inventory_summary(
  p_start_date text default '',
  p_bag_item_keys text[] default '{}'
)
returns json
language sql
stable
set search_path = public
as $$
  with src as (
    select
      row_number() over (order by l."Actual 1" desc, l.id desc) as ord,
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(l."Firm Name", '')), 'pmmpl\s*order', 'pmmpl', 'g'),
          'pmmpl|madhya', 'pmmpl', 'g'),
        '[^a-z0-9]', '', 'g') as firm_key,
      regexp_replace(lower(coalesce(l."Raw Material Name", '')), '[^a-z0-9]', '', 'g') as item_key,
      to_char(
        coalesce(l."Date Of Test", l."Actual 2"::date, l."Date Of Receiving"),
        'YYYY-MM-DD') as row_date,
      (
        l."Actual 2" is not null
        or regexp_replace(lower(coalesce(l."Area lifting", '')), '^\s+|\s+$', '', 'g') = 'direct supply to party'
      ) as lab_recorded,
      l."Firm Name", l."Raw Material Name", l."Actual Quantity", l."Actual 1",
      l."Rate", l."Transporter Rate", l."Lifting Qty", l."Total Bags Qty",
      l."Type Of Transporting Rate", l."Date Of Receiving", l."Date Of Test",
      l."Unload Approval Status", l."Unload Approval Required", l."Planned 2", l."Actual 2", l."Area lifting"
    from public."LIFT-ACCOUNTS" l
    where l."Actual 1" is not null
      and l."Actual Quantity" is not null
  ),
  elig as (
    select * from src where firm_key <> '' and item_key <> ''
  ),
  qty as (
    select
      firm_key || '::' || item_key as key,
      item_key,
      json_agg("Actual Quantity" order by ord) as quantities
    from elig
    where lab_recorded
      and (
        coalesce(p_start_date, '') = ''
        or (row_date is not null and row_date >= p_start_date collate "C")
      )
    group by firm_key, item_key
  ),
  ranked as (
    select
      elig.*,
      row_number() over (partition by firm_key, item_key order by row_date desc, ord) as rn
    from elig
    where row_date is not null
  )
  select json_build_object(
    'quantities', coalesce((select json_agg(json_build_object('key', key, 'item_key', item_key, 'quantities', quantities)) from qty), '[]'::json),
    'rate_rows', coalesce((
      select json_agg(
        case when item_key = any(p_bag_item_keys) then
          json_build_object(
            'Firm Name', "Firm Name",
            'Raw Material Name', "Raw Material Name",
            'Actual Quantity', "Actual Quantity",
            'Actual 1', "Actual 1",
            'Rate', "Rate",
            'Transporter Rate', "Transporter Rate",
            'Lifting Qty', "Lifting Qty",
            'Total Bags Qty', "Total Bags Qty",
            'Type Of Transporting Rate', "Type Of Transporting Rate",
            'Date Of Receiving', "Date Of Receiving",
            'Date Of Test', "Date Of Test",
            'Unload Approval Status', "Unload Approval Status",
            'Unload Approval Required', "Unload Approval Required",
            'Planned 2', "Planned 2",
            'Actual 2', "Actual 2"
          )
        else
          -- Non-bag items only need the rate / date columns, so the unused ones are left out.
          json_build_object(
            'Firm Name', "Firm Name",
            'Raw Material Name', "Raw Material Name",
            'Actual Quantity', "Actual Quantity",
            'Actual 1', "Actual 1",
            'Rate', "Rate",
            'Transporter Rate', "Transporter Rate",
            'Lifting Qty', "Lifting Qty",
            'Type Of Transporting Rate', "Type Of Transporting Rate",
            'Date Of Receiving', "Date Of Receiving",
            'Date Of Test', "Date Of Test",
            'Actual 2', "Actual 2"
          )
        end order by ord)
      from ranked
      where rn = 1 or item_key = any(p_bag_item_keys)
    ), '[]'::json)
  );
$$;

grant execute on function public.lift_inventory_summary(text, text[]) to anon, authenticated;

-- Trading Material "Purchase Received": mirrors fetchPurchaseReceivedMap in src/pages/TradingMaterial.jsx
-- (that page uses its own, slightly different key normalisation and date fallback, so it gets its own
-- function). Returns, per firm::product, the "Actual Quantity" values that count (quality check done, lab
-- test recorded, on/after p_start_date) so the page adds them up exactly as before.
create or replace function public.lift_purchase_received_summary(p_start_date text default '')
returns json
language sql
stable
set search_path = public
as $$
  with src as (
    select
      l.id,
      regexp_replace(
        regexp_replace(lower(coalesce(l."Firm Name", '')), 'pmmpl|madhya', 'pmmpl', 'g'),
        '[^a-z0-9]', '', 'g') as firm_key,
      regexp_replace(lower(coalesce(l."Raw Material Name", '')), '[^a-z0-9]', '', 'g') as item_key,
      to_char(
        coalesce(l."Date Of Test", l."Actual 2"::date, l."Date Of Receiving", l."Actual 1"::date),
        'YYYY-MM-DD') as row_date,
      l."Actual Quantity"
    from public."LIFT-ACCOUNTS" l
    where l."Actual 1" is not null
      and l."Actual Quantity" is not null
      and (
        l."Actual 2" is not null
        or regexp_replace(lower(coalesce(l."Area lifting", '')), '^s+|s+$', '', 'g') = 'direct supply to party'
      )
  )
  select coalesce(json_agg(json_build_object('key', key, 'quantities', quantities)), '[]'::json)
  from (
    select firm_key || '::' || item_key as key, json_agg("Actual Quantity" order by id) as quantities
    from src
    where firm_key <> '' and item_key <> ''
      and (row_date is null or row_date >= coalesce(p_start_date, '') collate "C")
    group by firm_key, item_key
  ) t;
$$;

grant execute on function public.lift_purchase_received_summary(text) to anon, authenticated;
