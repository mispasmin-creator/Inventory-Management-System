import { createClient } from '@supabase/supabase-js';

const PRODUCTION_URL = 'https://bliuwvkdtvxmteyzuzds.supabase.co';
const PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsaXV3dmtkdHZ4bXRleXp1emRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MzQxNzIsImV4cCI6MjA4OTMxMDE3Mn0.chkEGIGUfKxyOLvD7UMD729j6kZ7cajdS9ifBaXNR5g';

const productionSupabase = createClient(PRODUCTION_URL, PRODUCTION_ANON_KEY);

async function testFetch() {
    const { data, error } = await productionSupabase
        .from('crushing_actual')
        .select('"Firm Name", "Finished Goods Name 1", "Processing Cost 1", "Finished Goods Name 2", "Processing Cost 2", "Finished Goods Name 3", "Processing Cost 3", "Finished Goods Name 4", "Processing Cost 4"')
        .order('id', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Fetched Data (Sample):');
    const map = {};
    (data || []).forEach(row => {
        const firm = (row['Firm Name'] || '').trim().toLowerCase();
        
        console.log(`Row Firm Name: "${row['Firm Name']}" -> lower: "${firm}"`);
        
        [
          [row['Finished Goods Name 1'], row['Processing Cost 1']],
          [row['Finished Goods Name 2'], row['Processing Cost 2']],
          [row['Finished Goods Name 3'], row['Processing Cost 3']],
          [row['Finished Goods Name 4'], row['Processing Cost 4']],
        ].forEach(([name, cost]) => {
          if (name && cost != null && Number(cost) > 0) {
            const key = `${firm}::${name.trim().toLowerCase()}`;
            map[key] = Number(cost);
          }
        });
    });
    
    console.log('\nResulting Map:', map);
}

testFetch();
