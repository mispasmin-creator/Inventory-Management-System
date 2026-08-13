import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ozrgaddkpixwvcyypqid.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96cmdhZGRrcGl4d3ZjeXlwcWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzQ1MDgsImV4cCI6MjA5NTM1MDUwOH0.Z4B9J0xIPHxYFQsmj7lO2ygEcPGg5jFKvEHQMbzFoPg';

const PURCHASE_URL = 'https://jcgmyvxcamstnhuwmemc.supabase.co';
const PURCHASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjZ215dnhjYW1zdG5odXdtZW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMDgyODAsImV4cCI6MjA4NTU4NDI4MH0.wMKYEcXGOgrRwy7DKBlBz-a_mWhAuZaknG_iXYvKLLo';

const inventoryDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const purchaseDb = createClient(PURCHASE_URL, PURCHASE_ANON_KEY);

async function check() {
  console.log('--- 1. Querying inventory_master_history for Pyro (Purab) ---');
  const { data: histData, error: histErr } = await inventoryDb
    .from('inventory_master_history')
    .select('*')
    .ilike('firm_name', '%purab%')
    .ilike('item_name', '%pyro%')
    .order('snapshot_date', { ascending: false });
  
  if (histErr) console.error('History error:', histErr);
  else console.log('inventory_master_history results:', JSON.stringify(histData, null, 2));

  console.log('\n--- 2. Querying inventory_master for Pyro (Purab) ---');
  const { data: masterData, error: masterErr } = await inventoryDb
    .from('inventory_master')
    .select('*')
    .ilike('firm_name', '%purab%')
    .ilike('item_name', '%pyro%');
  
  if (masterErr) console.error('Master error:', masterErr);
  else console.log('inventory_master results:', JSON.stringify(masterData, null, 2));

  console.log('\n--- 3. Querying LIFT-ACCOUNTS (Purchase DB) for Pyro (Purab) ---');
  const { data: liftData, error: liftErr } = await purchaseDb
    .from('LIFT-ACCOUNTS')
    .select('id, "Firm Name", "Raw Material Name", "Rate", "Transporter Rate", "Type Of Transporting Rate", "Date Of Receiving", "Actual Quantity", "Lifting Qty"')
    .ilike('Firm Name', '%purab%')
    .ilike('Raw Material Name', '%pyro%')
    .order('id', { ascending: false });

  if (liftErr) console.error('Lift error:', liftErr);
  else console.log('LIFT-ACCOUNTS results:', JSON.stringify(liftData, null, 2));

  console.log('\n--- 4. Querying stock_adjustment (product_rate) for Pyro (Purab) ---');
  const { data: adjData, error: adjErr } = await inventoryDb
    .from('stock_adjustment')
    .select('*')
    .ilike('firm_name', '%purab%')
    .ilike('item_name', '%pyro%')
    .not('rate', 'is', null)
    .order('created_at', { ascending: false });

  if (adjErr) console.error('Stock adjustment rate error:', adjErr);
  else console.log('stock_adjustment rate results:', JSON.stringify(adjData, null, 2));
}

check();
