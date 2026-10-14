const fs = require('fs');

const src = 'C:/Users/ASUS/.codex/attachments/d244e7aa-057f-4889-98a4-4054058ff033/pasted-text.txt';
const out = 'update_inventory_master_product_rate.sql';

let text = fs.readFileSync(src, 'utf8')
  .replace(/\u00a0/g, ' ')
  .replace(/Â/g, '');

text = `__FIRM__Purab\n${text}`
  .replace(/ye hai Purab firm ka and item_name\s+product_rate/i, '\n__FIRM__Rkl\nitem_name\tproduct_rate')
  .replace(/ye hai RKL Firm ka and item_name\s+product_rate/i, '\n__FIRM__Pmmpl\nitem_name\tproduct_rate')
  .replace(/and ye hai PMMPL ka iska bhi chahiye\.?/i, '');

const rows = [];
let firm = null;

for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  if (line === '__FIRM__Purab') { firm = 'Purab'; continue; }
  if (line === '__FIRM__Rkl') { firm = 'Rkl'; continue; }
  if (line === '__FIRM__Pmmpl') { firm = 'Pmmpl'; continue; }
  if (/^item_name/i.test(line) || !firm) continue;

  const parts = line.split('\t');
  const item = (parts[0] || '').trim().replace(/\s+/g, ' ');
  if (!item) continue;

  const rateText = (parts.slice(1).join('\t') || '').trim();
  const rate = (rateText.match(/^([0-9]+(?:\.[0-9]+)?)/) || [null, '0'])[1];
  rows.push(`    ('${firm}', '${item.replace(/'/g, "''")}', ${rate})`);
}

const sql = [
  'ALTER TABLE public.inventory_master',
  'ADD COLUMN IF NOT EXISTS product_rate numeric(14, 3) DEFAULT 0;',
  '',
  'WITH data(firm_name, item_name, product_rate) AS (',
  '  VALUES',
  rows.map((row, i) => i === rows.length - 1 ? row : `${row},`).join('\n'),
  ')',
  'INSERT INTO public.inventory_master (firm_name, item_name, product_rate)',
  'SELECT firm_name, item_name, product_rate',
  'FROM data',
  'ON CONFLICT (firm_name, item_name)',
  'DO UPDATE SET product_rate = EXCLUDED.product_rate;',
  '',
  'SELECT firm_name, count(*) AS rows_after_update,',
  '       count(*) FILTER (WHERE product_rate <> 0) AS non_zero_product_rate',
  'FROM public.inventory_master',
  "WHERE firm_name IN ('Purab', 'Rkl', 'Pmmpl')",
  'GROUP BY firm_name',
  'ORDER BY firm_name;',
  ''
].join('\n');

fs.writeFileSync(out, sql, 'utf8');
console.log(`Generated ${out} with ${rows.length} rows`);
