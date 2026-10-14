# Database SQL Files & Schemas

This folder contains all the database setup, migration, and seed SQL scripts for the Supabase Postgres database.

## Files Description

| File Name | Description |
| :--- | :--- |
| `supabase_setup.sql` | Initial Supabase setup script (login table, trigger, base schemas). |
| `inventory_daily_history.sql` | Tables and functions for daily midnight inventory history snapshots. |
| `finished_goods_inventory_master.sql` | Finished goods inventory master schema and indexes. |
| `purchase_inventory_master.sql` | Purchase inventory master table schema and initial data. |
| `trading_material_master.sql` | Trading material master schema and initial setup. |
| `seed_inventory_master_items.sql` | Master items seed script with initial inventory data. |
| `add_product_rate_to_history.sql` | Migration adding `product_rate` to `inventory_master_history`. |
| `add_stock_adjustment_rate_column.sql` | Migration adding rate columns to `stock_adjustment`. |
| `add_stock_adjustment_rate_column_step2.sql` | Second phase migration for stock adjustment rates. |
