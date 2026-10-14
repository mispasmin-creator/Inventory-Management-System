-- Run this in the main Supabase project (Inventory Management System, ozrgaddkpixwvcyypqid).
-- New, standalone "Trading Material" master table + seed data. This is purely additive: it
-- does not read, alter, or drop any existing table, column, function, or trigger used by the
-- app (inventory_master, finished_goods_inventory_master, etc. are untouched).

create table if not exists public.trading_material_master (
  id bigserial primary key,
  firm_name text not null,
  s_no integer,
  product_name text not null,
  unit text default '',
  op_stock numeric(14, 3) not null default 0,
  op_stock_date date,
  stock_adjustment numeric(14, 3) not null default 0,
  purchase_material_received numeric(14, 3) not null default 0,
  purchase_return numeric(14, 3) not null default 0,
  sales numeric(14, 3) not null default 0,
  sales_return numeric(14, 3) not null default 0,
  current_level numeric(14, 3) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (firm_name, product_name)
);

comment on table public.trading_material_master is
  'Master list + stock tracking for traded (bought-and-sold, not manufactured) materials. Backs the Trading Material page.';
comment on column public.trading_material_master.op_stock is 'Header: Op. Stock';
comment on column public.trading_material_master.op_stock_date is 'Date when Trading Material OP. Stock was manually added or updated';
comment on column public.trading_material_master.stock_adjustment is 'Header: Stock Adjustment';
comment on column public.trading_material_master.purchase_material_received is 'Header: Purchase Material Received';
comment on column public.trading_material_master.purchase_return is 'Header: Purchase Return';
comment on column public.trading_material_master.sales is 'Header: Sales';
comment on column public.trading_material_master.sales_return is 'Header: Sales Return';
comment on column public.trading_material_master.current_level is 'Header: Current Level = op_stock + stock_adjustment + purchase_material_received - purchase_return - sales + sales_return';

create index if not exists idx_trading_material_master_firm_name
  on public.trading_material_master using btree (firm_name);

create index if not exists idx_trading_material_master_product_name
  on public.trading_material_master using btree (product_name);

create or replace function public.touch_trading_material_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_trading_material_master_updated_at
  on public.trading_material_master;

create trigger trg_trading_material_master_updated_at
before update on public.trading_material_master
for each row execute function public.touch_trading_material_master_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trading_material_master'
  ) then
    alter publication supabase_realtime add table public.trading_material_master;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed data (given product lists, split by firm)
-- ---------------------------------------------------------------------------

insert into public.trading_material_master (firm_name, product_name) values
  ('Pmmpl', 'Anchor Brick (Pcpf)'),
  ('Pmmpl', 'Anchor'),
  ('Pmmpl', 'Ceramic Anchor Brick 200'),
  ('Pmmpl', 'Ceramic Anchor Brick 270'),
  ('Pmmpl', 'Ceramic Anchor Brick 365'),
  ('Pmmpl', 'Ceramic Anchor Brick 370'),
  ('Pmmpl', 'Ceramic Anchor Brick 415'),
  ('Pmmpl', 'Hysil Block'),
  ('Pmmpl', 'PCPF Block'),
  ('Pmmpl', 'PCPF Hearth Block'),
  ('Pmmpl', 'Ceramic Board 30 MM'),
  ('Pmmpl', 'Ceramic Blanket 25 MM'),
  ('Pmmpl', 'Ceramic Roll'),
  ('Pmmpl', 'Ceramic Paper 03 MM'),
  ('Pmmpl', 'Ceramic Paper 05 MM'),
  ('Pmmpl', 'Ceramic Paper 10 MM'),
  ('Pmmpl', 'Fire Clay Bricks'),
  ('Pmmpl', 'Insulation Pad'),
  ('Pmmpl', 'Neutral Roaming Mass (NRM)'),
  ('Pmmpl', 'Pas Phoscast - 90 XR With 6% Phosphoric Acid'),
  ('Pmmpl', 'SS 304 Y-200x25x5mm L-Zig Zag'),
  ('Pmmpl', 'SS 310 V-160x6mm Zig Zag'),
  ('Pmmpl', 'SS 310 V-180x8mm Zig Zag'),
  ('Pmmpl', 'V-50 x 6 MM Grade 304'),
  ('Pmmpl', 'Ceramic Paper 05 MM PCS'),
  ('Pmmpl', 'Ceramic Paper 10 MM PCS'),
  ('Pmmpl', 'SS 304 Kilt (50x50x8 mm)'),
  ('Pmmpl', 'SS 304 V-175'),
  ('Pmmpl', 'Y-200 Flat Anchor'),
  ('Pmmpl', 'Ceramic Paper 250x250x5 MM'),
  ('Pmmpl', 'SS ANCHOR BRICKS 230 H'),
  ('Pmmpl', 'SS ANCHOR BRICKS 365 H'),
  ('Pmmpl', 'Ceramic Fibre Paper 5 mm'),
  ('Pmmpl', 'Ceramic Anchor Brick 230'),
  ('Pmmpl', 'Insulation Pad Pcs'),
  ('Pmmpl', 'SS 304 Clit 40x40x8mm'),
  ('Pmmpl', 'SS 310 clit 40x40x8x10mm'),
  ('Pmmpl', 'SS 310 Clit 50X50X8X10 mm'),
  ('Pmmpl', 'Ss - 310 Anchor (UV-195x8Mm)'),
  ('Pmmpl', 'Insulation Brick'),
  ('Pmmpl', 'ANCHOR BRICKS 200 H'),
  ('Pmmpl', 'Hysil Block 50mm'),
  ('Pmmpl', 'Hysil Block 75mm'),
  ('Pmmpl', 'Hysil Block 100mm'),
  ('Pmmpl', 'Hook Rod'),
  ('Pmmpl', 'Ceramic Anchor Size:125X125-365'),
  ('Purab', 'Ceramic Blanket 12 mm'),
  ('Purab', 'Ceramic Blanket 25 mm'),
  ('Purab', 'Ceramic Fiber Board 30 mm'),
  ('Purab', 'Ceramic Paper 10Mm'),
  ('Purab', 'Ceramic Paper 3Mm'),
  ('Purab', 'Ceramic Paper 5Mm'),
  ('Purab', 'Insulation Pad 75mm'),
  ('Purab', 'Hysil Block'),
  ('Purab', 'Insulation Pad 50 Mm'),
  ('Purab', 'Fire Clay Bricks (230X115X75)'),
  ('Purab', 'High Alumina Brick 4005A'),
  ('Purab', 'High Alumina Brick 5047'),
  ('Purab', 'PCPF With SS Anchore'),
  ('Purab', 'Anchor Bricks 230 H'),
  ('Purab', 'Anchor Bricks 365 H'),
  ('Purab', 'SS 304 UV ANCHOR 50.75X8 MM')
on conflict (firm_name, product_name) do nothing;
