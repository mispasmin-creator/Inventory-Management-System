-- Real-time purchase inventory, updated exactly once when a lab test is submitted.

create table if not exists public.inventory (
  id bigint generated always as identity primary key,
  firm_name text not null,
  product_name text not null,
  quantity numeric not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint inventory_firm_product_unique unique (firm_name, product_name),
  constraint inventory_firm_name_not_blank check (firm_name <> ''),
  constraint inventory_product_name_not_blank check (product_name <> '')
);

-- Private receipt ledger. It makes the lab transition idempotent even if Actual 2
-- is cleared and later submitted again for the same lift.
create table if not exists public.inventory_lab_receipts (
  lift_account_id bigint primary key,
  processed_at timestamp with time zone not null default now()
);

alter table public.inventory enable row level security;
alter table public.inventory_lab_receipts enable row level security;

grant select on public.inventory to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.inventory from anon, authenticated;
revoke all on public.inventory_lab_receipts from anon, authenticated;

drop policy if exists "Inventory is readable" on public.inventory;
create policy "Inventory is readable"
on public.inventory
for select
to anon, authenticated
using (true);

drop policy if exists "No direct inventory receipt access" on public.inventory_lab_receipts;
create policy "No direct inventory receipt access"
on public.inventory_lab_receipts
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.normalize_inventory_label(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.normalize_inventory_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.firm_name := public.normalize_inventory_label(new.firm_name);
  new.product_name := public.normalize_inventory_label(new.product_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_normalize_inventory_row on public.inventory;
create trigger trg_normalize_inventory_row
before insert or update of firm_name, product_name, quantity
on public.inventory
for each row
execute function public.normalize_inventory_row();

-- Seed inventory and the receipt ledger before enabling the live trigger.
insert into public.inventory (firm_name, product_name, quantity)
select
  public.normalize_inventory_label("Firm Name"),
  public.normalize_inventory_label("Raw Material Name"),
  sum("Actual Quantity")
from public."LIFT-ACCOUNTS"
where "Actual 2" is not null
  and lower(btrim(coalesce("Area lifting", ''))) <> 'direct supply to party'
  and "Actual Quantity" is not null
  and "Actual Quantity"::text not in ('NaN', 'Infinity', '-Infinity')
  and btrim(coalesce("Firm Name", '')) <> ''
  and btrim(coalesce("Raw Material Name", '')) <> ''
group by 1, 2
on conflict (firm_name, product_name)
do update set
  quantity = excluded.quantity,
  updated_at = now();

insert into public.inventory_lab_receipts (lift_account_id)
select id
from public."LIFT-ACCOUNTS"
where "Actual 2" is not null
  and lower(btrim(coalesce("Area lifting", ''))) <> 'direct supply to party'
  and "Actual Quantity" is not null
  and "Actual Quantity"::text not in ('NaN', 'Infinity', '-Infinity')
  and btrim(coalesce("Firm Name", '')) <> ''
  and btrim(coalesce("Raw Material Name", '')) <> ''
on conflict (lift_account_id) do nothing;

create or replace function public.add_submitted_lab_quantity_to_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_receipts integer;
  normalized_firm text;
  normalized_product text;
begin
  if new."Actual Quantity" is null
     or new."Actual Quantity"::text in ('NaN', 'Infinity', '-Infinity')
     or lower(btrim(coalesce(new."Area lifting", ''))) = 'direct supply to party' then
    return new;
  end if;

  normalized_firm := public.normalize_inventory_label(new."Firm Name");
  normalized_product := public.normalize_inventory_label(new."Raw Material Name");

  if normalized_firm is null or normalized_firm = ''
     or normalized_product is null or normalized_product = '' then
    return new;
  end if;

  insert into public.inventory_lab_receipts (lift_account_id)
  values (new.id)
  on conflict (lift_account_id) do nothing;

  get diagnostics inserted_receipts = row_count;
  if inserted_receipts = 0 then
    return new;
  end if;

  insert into public.inventory (firm_name, product_name, quantity)
  values (normalized_firm, normalized_product, new."Actual Quantity")
  on conflict (firm_name, product_name)
  do update set
    quantity = public.inventory.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.add_submitted_lab_quantity_to_inventory() from public, anon, authenticated;

drop trigger if exists trg_add_submitted_lab_quantity_to_inventory on public."LIFT-ACCOUNTS";
create trigger trg_add_submitted_lab_quantity_to_inventory
after update of "Actual 2"
on public."LIFT-ACCOUNTS"
for each row
when (old."Actual 2" is null and new."Actual 2" is not null)
execute function public.add_submitted_lab_quantity_to_inventory();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory'
  ) then
    alter publication supabase_realtime add table public.inventory;
  end if;
end;
$$;
