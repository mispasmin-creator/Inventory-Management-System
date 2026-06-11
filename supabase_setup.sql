-- Create login table for Login and Access Control
CREATE TABLE IF NOT EXISTS login (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Stored as text (use hashing in production)
    role VARCHAR(100) NOT NULL,
    firm_name VARCHAR(255) NOT NULL,
    page_access TEXT[] DEFAULT '{}', -- Array of pages the user has access to, e.g. ARRAY['Dashboard', 'Reports']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert mock users matching the existing application configuration
INSERT INTO login (username, password, role, firm_name, page_access) VALUES
('admin', '123', 'Admin', 'PMMPL Mining & Infra Private Limited', ARRAY['Dashboard', 'BranchInventory', 'Crushing', 'Dispatch', 'PmmplRate', 'Purchase', 'Reports', 'Settings']),
('manager_main', '123', 'Branch Manager', 'PMMPL Mining & Infra Private Limited', ARRAY['Dashboard', 'BranchInventory', 'Crushing', 'Dispatch', 'Purchase']),
('manager_madhya', '123', 'Branch Manager', 'PMMPL Mining & Infra Private Limited', ARRAY['Dashboard', 'BranchInventory', 'Crushing']),
('viewer_rkl', '123', 'Viewer', 'PMMPL Mining & Infra Private Limited', ARRAY['Dashboard', 'BranchInventory'])
ON CONFLICT (username) DO NOTHING;

-- Create purab_stock table
CREATE TABLE IF NOT EXISTS public.purab_stock (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint purab_stock_pkey primary key (id),
  constraint purab_stock_item_unique unique (item_name)
) TABLESPACE pg_default;

-- Create rkl_stock table
CREATE TABLE IF NOT EXISTS public.rkl_stock (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint rkl_stock_pkey primary key (id),
  constraint rkl_stock_item_unique unique (item_name)
) TABLESPACE pg_default;

-- Create madhya_stock table
CREATE TABLE IF NOT EXISTS public.madhya_stock (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint madhya_stock_pkey primary key (id),
  constraint madhya_stock_item_unique unique (item_name)
) TABLESPACE pg_default;

-- Create purab_finish_goods table
CREATE TABLE IF NOT EXISTS public.purab_finish_goods (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint purab_finish_goods_pkey primary key (id),
  constraint purab_finish_goods_item_unique unique (item_name)
) TABLESPACE pg_default;

-- Create rkl_finish_goods table
CREATE TABLE IF NOT EXISTS public.rkl_finish_goods (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint rkl_finish_goods_pkey primary key (id),
  constraint rkl_finish_goods_item_unique unique (item_name)
) TABLESPACE pg_default;

-- Create madhya_finish_goods table
CREATE TABLE IF NOT EXISTS public.madhya_finish_goods (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  s_no integer null,
  item_name character varying(255) not null,
  annu_con numeric(15, 2) null,
  d_con numeric(15, 2) null,
  sf numeric(15, 2) null,
  lead_time numeric(15, 2) null,
  max_stock numeric(15, 2) null,
  optimum_stock numeric(15, 2) null,
  actual_level numeric(15, 2) null,
  product_rate numeric(15, 2) null,
  optimum_stock_total numeric(15, 2) null,
  stock_total numeric(15, 2) null,
  unit character varying(50) null,
  colour character varying(100) null,
  constraint madhya_finish_goods_pkey primary key (id),
  constraint madhya_finish_goods_item_unique unique (item_name)
) TABLESPACE pg_default;