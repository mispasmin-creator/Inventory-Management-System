-- Run this in the main Supabase project.
-- Unified Finished Goods table matching the BranchInventory finished-goods headers.
-- This does not change any existing application output by itself.

create table if not exists public.finished_goods_inventory_master (
  id bigserial primary key,
  firm_name text not null,
  s_no integer,
  product_name text not null,
  op_stock numeric(14, 3) not null default 0,
  stock_adjustment numeric(14, 3) not null default 0,
  sales_order_pending numeric(14, 3) not null default 0,
  purchase_material_received numeric(14, 3) not null default 0,
  lift_material numeric(14, 3) not null default 0,
  in_transit numeric(14, 3) not null default 0,
  purchase_return numeric(14, 3) not null default 0,
  production numeric(14, 3) not null default 0,
  sales numeric(14, 3) not null default 0,
  sales_return numeric(14, 3) not null default 0,
  consumption numeric(14, 3) not null default 0,
  current_level numeric(14, 3) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_name, product_name)
);

comment on column public.finished_goods_inventory_master.s_no is 'Header: S.No.';
comment on column public.finished_goods_inventory_master.product_name is 'Header: Product Name';
comment on column public.finished_goods_inventory_master.op_stock is 'Header: o/p stock';
comment on column public.finished_goods_inventory_master.stock_adjustment is 'Header: Stock Adjustment';
comment on column public.finished_goods_inventory_master.sales_order_pending is 'Header: Sales Order Pending';
comment on column public.finished_goods_inventory_master.purchase_material_received is 'Header: Purhcase Material Received / Purchase Material Received';
comment on column public.finished_goods_inventory_master.lift_material is 'Header: Lift Material';
comment on column public.finished_goods_inventory_master.in_transit is 'Header: In Transit';
comment on column public.finished_goods_inventory_master.purchase_return is 'Header: Purchase Return';
comment on column public.finished_goods_inventory_master.production is 'Header: Production';
comment on column public.finished_goods_inventory_master.sales is 'Header: Sales';
comment on column public.finished_goods_inventory_master.sales_return is 'Header: Sales Return';
comment on column public.finished_goods_inventory_master.consumption is 'Header: Consumption';
comment on column public.finished_goods_inventory_master.current_level is 'Header: Current Level';

create index if not exists idx_finished_goods_inventory_master_firm_name
  on public.finished_goods_inventory_master using btree (firm_name);

create index if not exists idx_finished_goods_inventory_master_product_name
  on public.finished_goods_inventory_master using btree (product_name);

create or replace function public.touch_finished_goods_inventory_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_finished_goods_inventory_master_updated_at
  on public.finished_goods_inventory_master;

create trigger trg_finished_goods_inventory_master_updated_at
before update on public.finished_goods_inventory_master
for each row execute function public.touch_finished_goods_inventory_master_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'finished_goods_inventory_master'
  ) then
    alter publication supabase_realtime add table public.finished_goods_inventory_master;
  end if;
end $$;
