import { createClient } from '@supabase/supabase-js';

// Retrieve values from environment
const rawUrl = import.meta.env.SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || '';
const rawPurchaseUrl = import.meta.env.PURCHASE_URL || '';
const purchaseAnonKey = import.meta.env.PURCHASE_ANON_KEY || '';
const rawProductionUrl = import.meta.env.PRODUCTION_URL || '';
const productionAnonKey = import.meta.env.PRODUCTION_ANON_KEY || '';
const rawOrderUrl = import.meta.env.ORDER_URL || '';
const orderAnonKey = import.meta.env.ORDER_ANON_KEY || '';

let rawSalesRawUrl = import.meta.env.SALES_OF_RAW_MATERIAL_URL || '';
let salesRawAnonKey = import.meta.env.SALES_OF_RAW_MATERIAL_ANON_KEY || '';

// Robust check: swap if the URL and anon key values are swapped in .env
if (rawSalesRawUrl.startsWith('eyJ') || salesRawAnonKey.startsWith('http')) {
  const temp = rawSalesRawUrl;
  rawSalesRawUrl = salesRawAnonKey;
  salesRawAnonKey = temp;
}

// Clean up the URL: in case it contains '/rest/v1/' at the end, strip it
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').trim();
const purchaseSupabaseUrl = rawPurchaseUrl.replace(/\/rest\/v1\/?$/, '').trim();
const productionSupabaseUrl = rawProductionUrl.replace(/\/rest\/v1\/?$/, '').trim();
const orderSupabaseUrl = rawOrderUrl.replace(/\/rest\/v1\/?$/, '').trim();
const salesRawSupabaseUrl = rawSalesRawUrl.replace(/\/rest\/v1\/?$/, '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing in your .env file!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const purchaseSupabase = createClient(purchaseSupabaseUrl, purchaseAnonKey);
export const productionSupabase = createClient(productionSupabaseUrl, productionAnonKey);
export const orderSupabase = createClient(orderSupabaseUrl, orderAnonKey);
export const salesRawSupabase = createClient(salesRawSupabaseUrl, salesRawAnonKey);
