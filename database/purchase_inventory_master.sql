-- Run this in the Supabase project that contains public.inventory_master.
-- It powers the Raw Material page without changing its existing table headers.

create table if not exists public.inventory_master (
  id bigserial primary key,
  firm_name text not null,
  item_name text not null,
  unit text default '',
  op_stock numeric(14, 3) not null default 0,
  op_stock_date date,
  actual_level numeric(14, 3) not null default 0,
  product_rate numeric(14, 2) not null default 0,
  annual_consumption numeric(14, 3) not null default 0,
  safety_factor numeric(8, 3) not null default 1,
  lead_time_days numeric(10, 2) not null default 0,
  daily_consumption numeric(14, 3)
    generated always as (round((annual_consumption / 365.0), 3)) stored,
  optimum_stock numeric(14, 3)
    generated always as (round(((annual_consumption / 365.0) * lead_time_days * safety_factor), 3)) stored,
  max_stock numeric(14, 3)
    generated always as (round((((annual_consumption / 365.0) * lead_time_days * safety_factor) * 1.5), 3)) stored,
  optimum_stock_total numeric(14, 2)
    generated always as (round((((annual_consumption / 365.0) * lead_time_days * safety_factor) * product_rate), 2)) stored,
  stock_total numeric(14, 2)
    generated always as (round((actual_level * product_rate), 2)) stored,
  colour text
    generated always as (
      case
        when actual_level > round((((annual_consumption / 365.0) * lead_time_days * safety_factor) * 1.5), 3)
          then 'Excess Stock'
        else ''
      end
    ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_name, item_name)
);

alter table public.inventory_master
  add column if not exists op_stock numeric(14, 3) not null default 0,
  add column if not exists op_stock_date date;

create table if not exists public.inventory_movements (
  id bigserial primary key,
  inventory_master_id bigint references public.inventory_master(id) on delete cascade,
  firm_name text not null,
  item_name text not null,
  movement_type text not null,
  quantity numeric(14, 3) not null,
  source_table text not null,
  source_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (source_table, source_id, movement_type)
);

create or replace function public.normalize_inventory_firm(input_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(input_value, '')) like '%pmmpl%' then 'Pmmpl'
    when lower(coalesce(input_value, '')) like '%madhya%' then 'Pmmpl'
    when lower(coalesce(input_value, '')) like '%rkl%' then 'Rkl'
    when lower(coalesce(input_value, '')) like '%purab%' then 'Purab'
    else coalesce(input_value, '')
  end;
$$;

create or replace function public.touch_inventory_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_inventory_master_updated_at on public.inventory_master;
create trigger trg_inventory_master_updated_at
before update on public.inventory_master
for each row execute function public.touch_inventory_master_updated_at();

create or replace function public.apply_inventory_movement(
  p_firm_name text,
  p_item_name text,
  p_unit text,
  p_movement_type text,
  p_quantity numeric,
  p_source_table text,
  p_source_id text
)
returns void
language plpgsql
as $$
declare
  v_master_id bigint;
  v_previous_quantity numeric(14, 3);
  v_delta numeric(14, 3);
begin
  if coalesce(p_firm_name, '') = '' or coalesce(p_item_name, '') = '' or p_quantity is null then
    return;
  end if;

  insert into public.inventory_master (firm_name, item_name, unit)
  values (p_firm_name, p_item_name, coalesce(p_unit, ''))
  on conflict (firm_name, item_name) do update
    set unit = case
      when coalesce(public.inventory_master.unit, '') = '' then excluded.unit
      else public.inventory_master.unit
    end
  returning id into v_master_id;

  select quantity
    into v_previous_quantity
  from public.inventory_movements
  where source_table = p_source_table
    and source_id = p_source_id
    and movement_type = p_movement_type;

  v_delta := p_quantity - coalesce(v_previous_quantity, 0);

  insert into public.inventory_movements (
    inventory_master_id,
    firm_name,
    item_name,
    movement_type,
    quantity,
    source_table,
    source_id
  )
  values (
    v_master_id,
    p_firm_name,
    p_item_name,
    p_movement_type,
    p_quantity,
    p_source_table,
    p_source_id
  )
  on conflict (source_table, source_id, movement_type) do update
    set quantity = excluded.quantity,
        inventory_master_id = excluded.inventory_master_id,
        firm_name = excluded.firm_name,
        item_name = excluded.item_name;

  update public.inventory_master
  set actual_level = actual_level + v_delta
  where id = v_master_id;
end;
$$;

create or replace function public.sync_lift_accounts_to_inventory()
returns trigger
language plpgsql
as $$
declare
  v_firm text;
  v_item text;
  v_quantity numeric;
  v_source_id text;
begin
  v_firm := public.normalize_inventory_firm(new."Firm Name");
  v_item := new."Raw Material Name";
  v_quantity := coalesce(new."Actual Quantity", new."Lifting Qty", new."Qty");
  v_source_id := coalesce(new."Lift No", new.id::text);

  perform public.apply_inventory_movement(
    v_firm,
    v_item,
    '',
    'RECEIPT',
    v_quantity,
    'LIFT-ACCOUNTS',
    v_source_id
  );

  return new;
end;
$$;

drop trigger if exists trg_sync_lift_accounts_to_inventory on public."LIFT-ACCOUNTS";
create trigger trg_sync_lift_accounts_to_inventory
after insert or update of "Actual Quantity", "Lifting Qty", "Qty", "Firm Name", "Raw Material Name"
on public."LIFT-ACCOUNTS"
for each row execute function public.sync_lift_accounts_to_inventory();

create or replace function public.sync_mismatch_rate_to_inventory()
returns trigger
language plpgsql
as $$
declare
  v_firm text;
  v_item text;
begin
  v_firm := public.normalize_inventory_firm(new."Firm Name");
  v_item := coalesce(new."Product Name", new."Party Name");

  if coalesce(v_firm, '') = '' or coalesce(v_item, '') = '' or new."Rate" is null then
    return new;
  end if;

  insert into public.inventory_master (firm_name, item_name, product_rate)
  values (v_firm, v_item, new."Rate")
  on conflict (firm_name, item_name) do update
    set product_rate = excluded.product_rate;

  return new;
end;
$$;

drop trigger if exists trg_sync_mismatch_rate_to_inventory on public."Mismatch";
create trigger trg_sync_mismatch_rate_to_inventory
after insert or update of "Rate", "Firm Name", "Product Name", "Status"
on public."Mismatch"
for each row execute function public.sync_mismatch_rate_to_inventory();

create or replace function public.sync_indent_po_to_inventory()
returns trigger
language plpgsql
as $$
declare
  v_firm text;
  v_item text;
  v_rate numeric;
begin
  v_firm := public.normalize_inventory_firm(new."Firm Name");
  v_item := new."Material";
  v_rate := case
    when coalesce(new."Approved Rate", '') ~ '^[0-9]+(\.[0-9]+)?$' then new."Approved Rate"::numeric
    else new."Rate"
  end;

  if coalesce(v_firm, '') = '' or coalesce(v_item, '') = '' then
    return new;
  end if;

  insert into public.inventory_master (firm_name, item_name, unit, product_rate)
  values (v_firm, v_item, coalesce(new."UOM", ''), coalesce(v_rate, 0))
  on conflict (firm_name, item_name) do update
    set unit = case
          when coalesce(excluded.unit, '') <> '' then excluded.unit
          else public.inventory_master.unit
        end,
        product_rate = case
          when excluded.product_rate <> 0 then excluded.product_rate
          else public.inventory_master.product_rate
        end;

  return new;
end;
$$;

drop trigger if exists trg_sync_indent_po_to_inventory on public."INDENT-PO";
create trigger trg_sync_indent_po_to_inventory
after insert or update of "Firm Name", "Material", "UOM", "Rate", "Approved Rate"
on public."INDENT-PO"
for each row execute function public.sync_indent_po_to_inventory();

-- Optional one-time backfill after creating the tables/triggers:
insert into public.inventory_master (firm_name, item_name)
select distinct
  public.normalize_inventory_firm("Firm Name"),
  "Raw Material Name"
from public."LIFT-ACCOUNTS"
where coalesce("Firm Name", '') <> ''
  and coalesce("Raw Material Name", '') <> ''
on conflict (firm_name, item_name) do nothing;

insert into public.inventory_movements (
  inventory_master_id,
  firm_name,
  item_name,
  movement_type,
  quantity,
  source_table,
  source_id
)
select
  im.id,
  im.firm_name,
  im.item_name,
  'RECEIPT',
  coalesce(la."Actual Quantity", la."Lifting Qty", la."Qty"),
  'LIFT-ACCOUNTS',
  coalesce(la."Lift No", la.id::text)
from public."LIFT-ACCOUNTS" la
join public.inventory_master im
  on im.firm_name = public.normalize_inventory_firm(la."Firm Name")
 and im.item_name = la."Raw Material Name"
where coalesce(la."Firm Name", '') <> ''
  and coalesce(la."Raw Material Name", '') <> ''
  and coalesce(la."Actual Quantity", la."Lifting Qty", la."Qty") is not null
on conflict (source_table, source_id, movement_type) do update
  set quantity = excluded.quantity,
      inventory_master_id = excluded.inventory_master_id,
      firm_name = excluded.firm_name,
      item_name = excluded.item_name;

update public.inventory_master im
set actual_level = coalesce(t.total_quantity, 0)
from (
  select inventory_master_id, sum(quantity) as total_quantity
  from public.inventory_movements
  where movement_type = 'RECEIPT'
  group by inventory_master_id
) t
where im.id = t.inventory_master_id;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_master'
  ) then
    alter publication supabase_realtime add table public.inventory_master;
  end if;
end $$;
