import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ozrgaddkpixwvcyypqid.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96cmdhZGRrcGl4d3ZjeXlwcWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NzQ1MDgsImV4cCI6MjA5NTM1MDUwOH0.Z4B9J0xIPHxYFQsmj7lO2ygEcPGg5jFKvEHQMbzFoPg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFetch() {
    const { data, error } = await supabase
        .from('inventory_master')
        .select('firm_name, item_name')
        .like('item_name', 'Insulator%')
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Fetched Inventory Master (Sample):');
    data.forEach(row => {
        console.log(`firm_name: "${row.firm_name}", item_name: "${row.item_name}"`);
    });
}

testFetch();
