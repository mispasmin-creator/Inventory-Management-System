// Daily inventory history snapshot.
//
// Stock levels are not stored anywhere — they are derived by combining five
// Supabase projects. This function re-runs the same calculation that
// src/services/api.js performs in the browser and writes the result into
// public.inventory_master_history / public.finished_goods_inventory_history.
//
// Invoked nightly at 00:00 IST by the `daily_inventory_history` pg_cron job
// (see inventory_daily_history.sql). Can also be called by hand:
//   POST /functions/v1/daily-inventory-history  {"snapshot_date":"2026-07-16"}
//
// It always computes CURRENT levels; `snapshot_date` only labels the rows. It
// cannot reconstruct a past day, so backdating it stores today's figures under
// an old date. History therefore only builds up from the first run onwards.
//
// Every formula, key-normalisation rule and date filter below is a deliberate
// mirror of api.js. If the screen's maths changes, this must change with it.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// The app always fetches with this date (useInventory.js / BranchInventory.jsx).
// op_stock is the opening balance as of this date and movements accumulate from
// it, so the snapshot must use the same cutoff to match what users see.
const INVENTORY_START_DATE = '2026-06-23';

const PAGE_SIZE = 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// --- helpers (ported verbatim from api.js) ---------------------------------

const normalizeFirmKey = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .replace(/pmmpl|madhya/g, 'pmmpl')
    .replace(/[^a-z0-9]/g, '');

const normalizeItemKey = (value: unknown): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const cleanJsonString = (val: unknown): string => {
  if (!val) return '';
  let str = String(val).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) && parsed.length > 0) str = String(parsed[0]).trim();
    } catch {
      str = str.slice(1, -1).replace(/^["']|["']$/g, '').trim();
    }
  }
  return str;
};

// api.js runs in the browser, where "local" is IST. Deno runs in UTC, so the
// offset is applied explicitly — otherwise every row after 18:30 UTC would be
// bucketed into the wrong day.
const getLocalDateString = (val: unknown): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) return trimmed.replace(/\//g, '-');
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
    if (match) return match[1];
  }
  const d = new Date(val as string);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

const istToday = (): string => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const isBlankValue = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const hasFiniteNumber = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const numberOrZero = (value: unknown): number => (hasFiniteNumber(value) ? Number(value) : 0);

const productionFirmNameMap: Record<string, string> = {
  puraborder: 'Purab',
  rklorder: 'Rkl',
  pmmplorder: 'Pmmpl',
};

const normalizeProductionFirmName = (value: unknown): unknown =>
  productionFirmNameMap[normalizeItemKey(value)] || value;

// Order firms use the same mapping as production.
const normalizeOrderFirmName = normalizeProductionFirmName;


type Row = Record<string, any>;
type Bucket = { before: number; after: number; total: number };

/** Pages through a table, applying `tweak` to the query builder each page. */
const fetchAll = async (
  client: SupabaseClient,
  table: string,
  select: string,
  tweak: (q: any) => any = (q) => q,
): Promise<Row[]> => {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await tweak(client.from(table).select(select)).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
};

const addToBucket = (map: Record<string, Bucket>, key: string, qty: number, rowDate: string, selectedDate: string) => {
  if (!map[key]) map[key] = { before: 0, after: 0, total: 0 };
  map[key].total += qty;
  if (selectedDate && rowDate && rowDate >= selectedDate) map[key].after += qty;
  else map[key].before += qty;
};

// --- clients ---------------------------------------------------------------

const need = (name: string): string => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
};

// The .env values carry a trailing /rest/v1/, which createClient appends to
// again — supabaseClient.js strips it the same way.
const needUrl = (name: string): string => need(name).replace(/\/rest\/v1\/?$/, '').trim();

// Built on first request rather than at module load, so a missing secret comes
// back as a readable JSON error instead of a boot crash.
let clients: {
  inventoryDb: SupabaseClient;
  purchaseDb: SupabaseClient;
  productionDb: SupabaseClient;
  orderDb: SupabaseClient;
  salesRawDb: SupabaseClient;
} | null = null;

const db = () => {
  if (!clients) {
    clients = {
      inventoryDb: createClient(needUrl('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY')),
      purchaseDb: createClient(needUrl('PURCHASE_URL'), need('PURCHASE_ANON_KEY')),
      productionDb: createClient(needUrl('PRODUCTION_URL'), need('PRODUCTION_ANON_KEY')),
      orderDb: createClient(needUrl('ORDER_URL'), need('ORDER_ANON_KEY')),
      salesRawDb: createClient(needUrl('SALES_OF_RAW_MATERIAL_URL'), need('SALES_OF_RAW_MATERIAL_ANON_KEY')),
    };
  }
  return clients;
};

// --- raw material source maps ---------------------------------------------

const rawMaterialColumns = Array.from({ length: 20 }, (_, i) =>
  `"Raw Material Name ${i + 1}", "Quantity Of Raw Material ${i + 1}"`).join(', ');

const buildProductionUsageMap = async (selectedDate: string) => {
  const usageMap: Record<string, number> = {};
  const rows = await fetchAll(
    db().productionDb,
    'actual_production',
    `id, "Timestamp", "Date Of Production", "FIRM Name", ${rawMaterialColumns}`,
    (q) => q.order('id', { ascending: false }),
  );

  rows.forEach((row) => {
    const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
    if (!firmKey) return;
    const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
    if (selectedDate && !(rowDate && rowDate >= selectedDate)) return;

    for (let i = 1; i <= 20; i += 1) {
      const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
      if (!itemKey) continue;
      const raw = row[`Quantity Of Raw Material ${i}`];
      const qty = Number(raw);
      if (raw === null || raw === '' || !Number.isFinite(qty)) continue;
      const key = `${firmKey}::${itemKey}`;
      usageMap[key] = (usageMap[key] || 0) + qty;
    }
  });

  return usageMap;
};

const buildSemiFinishedActualLevelMap = async (selectedDate: string) => {
  const semiAdjustmentMap: Record<string, number> = {};
  const semiRawConsumptionMap: Record<string, number> = {};
  const productionFirmMap = new Map<string, unknown>();

  const semiProduction = await fetchAll(
    db().productionDb,
    'semi_production',
    'id, "SF-Sr No.", "Name Of Semi Finished Good", "Firm name"',
  );
  semiProduction.forEach((row) => {
    if (row['SF-Sr No.']) {
      productionFirmMap.set(
        `${row['SF-Sr No.']}::${normalizeItemKey(row['Name Of Semi Finished Good'])}`,
        row['Firm name'],
      );
    }
  });

  const semiActual = await fetchAll(db().productionDb, 'semi_actual', '*');
  semiActual.forEach((row) => {
    const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp || row.created_at || row.date);
    if (selectedDate && (!rowDate || rowDate < selectedDate)) return;

    const serialNumber = row['S No.'];
    if (!serialNumber || !String(serialNumber).startsWith('SA-')) return;

    const productName = row['Product Name'];
    const productKey = normalizeItemKey(productName);
    const firmKey = normalizeFirmKey(
      normalizeProductionFirmName(productionFirmMap.get(`${row['Semi Finished Production No.']}::${productKey}`)),
    );
    const rawQuantity = row['Qty Of Semi Finished Good'];
    const quantity = Number(rawQuantity);
    if (!firmKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

    for (let i = 1; i <= 5; i++) {
      const rmKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
      const rmQtyRaw = row[`Quantity Of Raw Material ${i}`];
      const rmQty = Number(rmQtyRaw);
      if (rmKey && rmQtyRaw !== null && rmQtyRaw !== '' && Number.isFinite(rmQty) && rmQty > 0) {
        const rmMapKey = `${firmKey}::${rmKey}`;
        semiRawConsumptionMap[rmMapKey] = (semiRawConsumptionMap[rmMapKey] || 0) + rmQty;
      }
    }

    if (!productKey) return;
    const productText = String(productName || '').toLowerCase();
    const signedQuantity = productText.includes('grains') ? -quantity : productText.includes('fines') ? quantity : 0;
    if (signedQuantity === 0) return;
    const key = `${firmKey}::${productKey}`;
    semiAdjustmentMap[key] = (semiAdjustmentMap[key] || 0) + signedQuantity;
  });

  return { semiAdjustmentMap, semiRawConsumptionMap };
};

const buildCrushingActualLevelMap = async (selectedDate: string) => {
  const crushingAdjustmentMap: Record<string, number> = {};
  const crushingOutputsMap: Record<string, number> = {};

  const rows = await fetchAll(db().productionDb, 'crushing_actual', '*', (q) => q.order('id', { ascending: false }));
  rows.forEach((row) => {
    const rowDate = getLocalDateString(row.Timestamp || row.created_at || row.date);
    if (selectedDate && (!rowDate || rowDate < selectedDate)) return;

    const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['Firm Name']));
    if (!firmKey) return;

    const productName = row['Crushing Product Name'];
    const productKey = normalizeItemKey(productName);
    const rawQuantity = row['Qty Of Crushing Product'];
    const quantity = Number(rawQuantity);

    if (productKey && rawQuantity !== null && rawQuantity !== '' && Number.isFinite(quantity)) {
      const productText = String(productName || '').toLowerCase();
      const isProducedType = productText.includes('grains') || productText.includes('fines');
      const signedQuantity = isProducedType ? quantity : -quantity;
      if (signedQuantity !== 0) {
        const key = `${firmKey}::${productKey}`;
        crushingAdjustmentMap[key] = (crushingAdjustmentMap[key] || 0) + signedQuantity;
      }
    }

    for (let i = 1; i <= 4; i++) {
      const fgKey = normalizeItemKey(row[`Finished Goods Name ${i}`]);
      const fgQtyRaw = row[`Qty ${i}`];
      const fgQty = Number(fgQtyRaw);
      if (!fgKey || fgQtyRaw === null || fgQtyRaw === '' || !Number.isFinite(fgQty)) continue;
      const fgMapKey = `${firmKey}::${fgKey}`;
      crushingOutputsMap[fgMapKey] = (crushingOutputsMap[fgMapKey] || 0) + fgQty;
    }
  });

  return { crushingAdjustmentMap, crushingOutputsMap };
};

// Only the receipt quantities are needed — the rate columns api.js reads are not
// stored in the history, so they are neither fetched nor computed here.
const buildLiftDataMaps = async (selectedDate: string) => {
  const actualQuantityMap: Record<string, number> = {};

  const liftRows = await fetchAll(
    db().purchaseDb,
    'LIFT-ACCOUNTS',
    'id, "Firm Name", "Raw Material Name", "Actual Quantity", "Date Of Receiving", "Actual 1"',
    (q) => q.not('Actual 1', 'is', null).not('Actual Quantity', 'is', null).order('Actual 1', { ascending: false }),
  );

  liftRows.forEach((row) => {
    if (isBlankValue(row['Actual 1']) || isBlankValue(row['Actual Quantity'])) return;

    const firmKey = normalizeFirmKey(row['Firm Name']);
    const itemKey = normalizeItemKey(row['Raw Material Name']);
    if (!firmKey || !itemKey) return;

    const rowDate = getLocalDateString(row['Date Of Receiving']);
    if (selectedDate && !(rowDate && rowDate >= selectedDate)) return;

    const actualQuantity = Number(row['Actual Quantity']);
    if (!Number.isFinite(actualQuantity)) return;

    const key = `${firmKey}::${itemKey}`;
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) + actualQuantity;
  });

  const [productionUsageMap, semi, crushing] = await Promise.all([
    buildProductionUsageMap(selectedDate),
    buildSemiFinishedActualLevelMap(selectedDate),
    buildCrushingActualLevelMap(selectedDate),
  ]);

  Object.entries(productionUsageMap).forEach(([key, qty]) => {
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) - qty;
  });
  Object.entries(semi.semiRawConsumptionMap).forEach(([key, qty]) => {
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) - qty;
  });
  Object.entries(semi.semiAdjustmentMap).forEach(([key, qty]) => {
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) + qty;
  });
  Object.entries(crushing.crushingAdjustmentMap).forEach(([key, qty]) => {
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) + qty;
  });
  Object.entries(crushing.crushingOutputsMap).forEach(([key, qty]) => {
    actualQuantityMap[key] = (actualQuantityMap[key] || 0) + qty;
  });

  return { actualQuantityMap };
};

// --- finished goods source maps -------------------------------------------

const buildFinishedGoodProductionMap = async (selectedDate: string) => {
  const productionMap: Record<string, Bucket> = {};

  const production = await fetchAll(
    db().productionDb,
    'actual_production',
    'id, "FIRM Name", "Product Name", "Quantity Of FG", "Timestamp", "Date Of Production", "Job Card No."',
    (q) => q.order('id', { ascending: false }),
  );
  production.forEach((row) => {
    const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
    const productKey = normalizeItemKey(row['Product Name']);
    const raw = row['Quantity Of FG'];
    const qty = Number(raw);
    if (!firmKey || !productKey || raw === null || raw === '' || !Number.isFinite(qty)) return;
    addToBucket(
      productionMap,
      `${firmKey}::${productKey}`,
      qty,
      getLocalDateString(row['Date Of Production'] || row.Timestamp),
      selectedDate,
    );
  });

  const crushing = await fetchAll(
    db().productionDb,
    'crushing_actual',
    'id, "Timestamp", "Date Of Production", "Firm Name", "Finished Goods Name 1", "Qty 1", "Finished Goods Name 2", "Qty 2", "Finished Goods Name 3", "Qty 3", "Finished Goods Name 4", "Qty 4"',
    (q) => q.order('id', { ascending: false }),
  );
  crushing.forEach((row) => {
    const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['Firm Name']));
    if (!firmKey) return;
    const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
    for (let i = 1; i <= 4; i++) {
      const fgKey = normalizeItemKey(row[`Finished Goods Name ${i}`]);
      const raw = row[`Qty ${i}`];
      const qty = Number(raw);
      if (!fgKey || raw === null || raw === '' || !Number.isFinite(qty)) continue;
      addToBucket(productionMap, `${firmKey}::${fgKey}`, qty, rowDate, selectedDate);
    }
  });

  return productionMap;
};

const buildFinishedGoodConsumptionMap = async (selectedDate: string) => {
  const consumptionMap: Record<string, Bucket> = {};
  const rows = await fetchAll(
    db().productionDb,
    'actual_production',
    `id, "Timestamp", "Date Of Production", "FIRM Name", ${rawMaterialColumns}`,
    (q) => q.order('id', { ascending: false }),
  );
  rows.forEach((row) => {
    const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
    if (!firmKey) return;
    const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
    for (let i = 1; i <= 20; i += 1) {
      const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
      if (!itemKey) continue;
      const raw = row[`Quantity Of Raw Material ${i}`];
      const qty = Number(raw);
      if (raw === null || raw === '' || !Number.isFinite(qty)) continue;
      addToBucket(consumptionMap, `${firmKey}::${itemKey}`, qty, rowDate, selectedDate);
    }
  });
  return consumptionMap;
};

const buildFinishedGoodPurchaseReturnMap = async (selectedDate: string) => {
  const purchaseReturnMap: Record<string, Bucket> = {};
  const rows = await fetchAll(
    db().purchaseDb,
    'Purchase Returns',
    '"ID", "Firm Name", "Product Name", "Return This Time", "Time Stamp"',
    (q) => q.order('ID', { ascending: false }),
  );
  rows.forEach((row) => {
    const firmKey = normalizeFirmKey(cleanJsonString(row['Firm Name']));
    const productKey = normalizeItemKey(cleanJsonString(row['Product Name']));
    const raw = row['Return This Time'];
    const qty = Number(raw);
    if (!firmKey || !productKey || raw === null || raw === '' || !Number.isFinite(qty)) return;
    addToBucket(purchaseReturnMap, `${firmKey}::${productKey}`, qty, getLocalDateString(row['Time Stamp']), selectedDate);
  });
  return purchaseReturnMap;
};

const buildFinishedGoodDispatchMap = async (selectedDate: string) => {
  const dispatchMap: Record<string, Bucket> = {};
  const orderMap = new Map<string, Row>();
  const normalizeJoinId = (value: unknown) => String(value ?? '').trim();

  const orders = await fetchAll(db().orderDb, 'ORDER RECEIPT', 'id, "Firm Name", "Product Name"');
  orders.forEach((row) => {
    const orderId = normalizeJoinId(row.id);
    if (orderId) orderMap.set(orderId, row);
  });

  const dispatches = await fetchAll(
    db().orderDb,
    'DISPATCH',
    'id, po_id, "Product Name", "Qty To Be Dispatched", "Actual Truck Qty", "Planned4", "Actual4", "Bill Date"',
    (q) => q.not('Planned4', 'is', null).not('Actual4', 'is', null),
  );
  dispatches.forEach((row) => {
    const invoiceActualizedAt = String(row['Bill Date'] || row.Actual4 || '').trim();
    if (!invoiceActualizedAt) return;

    const po = orderMap.get(normalizeJoinId(row.po_id)) || {};
    const firmKey = normalizeFirmKey(normalizeOrderFirmName(po['Firm Name']));
    const dispatchProductName = String(row['Product Name'] || '').trim();
    const productKey = normalizeItemKey(dispatchProductName || po['Product Name']);
    if (!firmKey || !productKey) return;

    const actualTruckQty = Number(row['Actual Truck Qty']);
    const plannedDispatchQty = Number(row['Qty To Be Dispatched']);
    const validActual = Number.isFinite(actualTruckQty) && actualTruckQty > 0 ? actualTruckQty : 0;
    const validPlanned = Number.isFinite(plannedDispatchQty) && plannedDispatchQty > 0 ? plannedDispatchQty : 0;
    const truckQty = validActual && validPlanned ? Math.min(validActual, validPlanned) : validActual || validPlanned;

    addToBucket(dispatchMap, `${firmKey}::${productKey}`, truckQty, getLocalDateString(invoiceActualizedAt), selectedDate);
  });

  return dispatchMap;
};


const buildFinishedGoodPurchaseMap = async (selectedDate: string) => {
  const purchaseMap: Record<string, Bucket> = {};
  const rows = await fetchAll(
    db().purchaseDb,
    'LIFT-ACCOUNTS',
    'id, "Firm Name", "Raw Material Name", "Actual Quantity", "Date Of Receiving", "Timestamp"',
    (q) => q.order('id', { ascending: false }),
  );
  rows.forEach((row) => {
    const firmKey = normalizeFirmKey(row['Firm Name']);
    const productKey = normalizeItemKey(row['Raw Material Name']);
    const raw = row['Actual Quantity'];
    const qty = Number(raw);
    if (!firmKey || !productKey || raw === null || raw === '' || !Number.isFinite(qty)) return;
    addToBucket(
      purchaseMap,
      `${firmKey}::${productKey}`,
      qty,
      getLocalDateString(row['Date Of Receiving'] || row['Timestamp']),
      selectedDate,
    );
  });
  return purchaseMap;
};

const buildFinishedGoodReturnMap = async (selectedDate: string) => {
  const returnMap: Record<string, Bucket> = {};
  const firmByDoNumber: Record<string, unknown> = {};

  const orders = await fetchAll(db().orderDb, 'ORDER RECEIPT', '"DO-Delivery Order No.", "Firm Name"');
  orders.forEach((row) => {
    const doNumber = row['DO-Delivery Order No.'];
    if (doNumber) firmByDoNumber[doNumber] = row['Firm Name'];
  });

  const returns = await fetchAll(
    db().orderDb,
    'Material Return',
    'id, "D.O Number", "Product Name", "Qty Of Return Material", "Qty", "Return Dispatched At", "Actual5", "Debit Note Issued At"',
    (q) => q.not('Actual5', 'is', null).not('Debit Note Issued At', 'is', null),
  );
  returns.forEach((row) => {
    const returnDispatchedAt = row['Return Dispatched At'] || '';
    if (!returnDispatchedAt || String(returnDispatchedAt).trim() === '') return;
    const firmKey = normalizeFirmKey(normalizeOrderFirmName(firmByDoNumber[row['D.O Number']]));
    const productKey = normalizeItemKey(row['Product Name']);
    if (!firmKey || !productKey) return;
    const returnQty = Number(row['Qty Of Return Material']) || Number(row['Qty']) || 0;
    addToBucket(returnMap, `${firmKey}::${productKey}`, returnQty, getLocalDateString(returnDispatchedAt), selectedDate);
  });

  return returnMap;
};

const buildFinishedGoodAdjustmentMap = async (selectedDate: string) => {
  const adjustmentMap: Record<string, Bucket> = {};
  const rows = await fetchAll(
    db().inventoryDb,
    'stock_adjustment',
    'firm_name, item_name, qty, status, material_type, entry_date',
    (q) => q.eq('material_type', 'finish_good'),
  );
  rows.forEach((row) => {
    const firmKey = normalizeFirmKey(row.firm_name);
    const productKey = normalizeItemKey(row.item_name);
    const qty = Number(row.qty || 0);
    if (!firmKey || !productKey || !Number.isFinite(qty)) return;
    const value = row.status === 'Factory -' ? -qty : qty;
    addToBucket(adjustmentMap, `${firmKey}::${productKey}`, value, getLocalDateString(row.entry_date), selectedDate);
  });
  return adjustmentMap;
};

// --- snapshot builders -----------------------------------------------------

const snapshotRawMaterial = async (snapshotDate: string, selectedDate: string) => {
  const [masters, lift, salesRawOrders, adjustmentRows] = await Promise.all([
    fetchAll(db().inventoryDb, 'inventory_master', 'id, firm_name, item_name, unit, op_stock, optimum_qty, max_qty'),
    buildLiftDataMaps(selectedDate),
    // Left as * — api.js falls back across completed_at/updated_at/created_at/
    // order_date/date, and naming them would break if a column is absent.
    fetchAll(db().salesRawDb, 'orders', '*', (q) => q.eq('status', 'Completed')),
    fetchAll(db().inventoryDb, 'stock_adjustment', 'firm_name, item_name, qty, status, material_type, entry_date'),
  ]);

  const salesRawQtyMap: Record<string, number> = {};
  salesRawOrders.forEach((order) => {
    const orderDate = getLocalDateString(
      order.completed_at || order.updated_at || order.created_at || order.order_date || order.date,
    );
    if (selectedDate && (!orderDate || orderDate < selectedDate)) return;
    const firmKey = normalizeFirmKey(order.firm_name);
    const itemKey = normalizeItemKey(order.product_name);
    if (!firmKey || !itemKey) return;
    const key = `${firmKey}::${itemKey}`;
    salesRawQtyMap[key] = (salesRawQtyMap[key] || 0) + (Number(order.qty) || 0);
  });

  // BranchInventory.jsx applies stock adjustments on top of the api.js figure,
  // and keys them on the trimmed/lowercased names rather than the stripped
  // normalize* keys. A blank firm is a legacy wildcard that applies to every firm.
  const rawEntries = adjustmentRows.filter((e) => !e.material_type || e.material_type === 'raw_material');
  const adjustmentAfter: Record<string, number> = {};
  rawEntries.forEach((entry) => {
    const firmKey = entry.firm_name?.trim().toLowerCase() || '*';
    const itemKey = entry.item_name?.trim().toLowerCase();
    if (!itemKey) return;
    if (!entry.entry_date || entry.entry_date < INVENTORY_START_DATE) return;
    const qty = Number(entry.qty || 0);
    const key = `${firmKey}::${itemKey}`;
    adjustmentAfter[key] = (adjustmentAfter[key] || 0) + (entry.status === 'Factory -' ? -qty : qty);
  });

  return masters.map((item) => {
    const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.item_name)}`;
    const opStock = numberOrZero(item.op_stock);
    let actualLevel: number | '' = lift.actualQuantityMap[key] ?? '';
    const salesRawQty = salesRawQtyMap[key] || 0;
    if (actualLevel !== '' || salesRawQty !== 0 || opStock !== 0) {
      actualLevel = opStock + Number(actualLevel || 0) - salesRawQty;
    }

    const plainFirm = item.firm_name?.trim().toLowerCase();
    const plainItem = item.item_name?.trim().toLowerCase();
    const adjAfter = (adjustmentAfter[`${plainFirm}::${plainItem}`] || 0) + (adjustmentAfter[`*::${plainItem}`] || 0);
    const adjustedLevel: number | null = actualLevel !== '' ? Number(actualLevel) + adjAfter : null;

    // Only the columns the History page reads are stored. optimum_qty/max_qty
    // ride along because the page tints each cell against them.
    return {
      snapshot_date: snapshotDate,
      firm_name: item.firm_name,
      item_name: item.item_name,
      unit: item.unit ?? '',
      actual_level: adjustedLevel,
      optimum_qty: item.optimum_qty ?? null,
      max_qty: item.max_qty ?? null,
    };
  });
};

const getOrderPendingQty = (order: Row): number => {
  const totalQty = Number(order.Quantity) || 0;
  const deliveredQty = Number(order.Delivered) || 0;
  if (order['Pending Qty'] !== null && order['Pending Qty'] !== undefined && String(order['Pending Qty']).trim() !== '') {
    return Math.max(0, Number(order['Pending Qty']));
  }
  return Math.max(0, totalQty - deliveredQty);
};

// Drives the Finished Good shortage colour: current_level below this is red.
const buildFinishedGoodPendingOrderMap = async () => {
  const pendingMap: Record<string, number> = {};
  const orderRows = await fetchAll(
    db().orderDb,
    'ORDER RECEIPT',
    'id, "PARTY PO NO (As Per Po Exact)", "Firm Name", "Product Name", "Quantity", "Delivered", "Pending Qty", "Actual 2", logistics_status',
    (q) => q.order('id', { ascending: false }),
  );

  const poGroups: Record<string, Row[]> = {};
  orderRows.forEach((order) => {
    const poKey = order['PARTY PO NO (As Per Po Exact)'] || `__no_po_${order.id}`;
    (poGroups[poKey] ||= []).push(order);
  });

  Object.values(poGroups).forEach((ordersInPO) => {
    if (ordersInPO.some((o) => o.logistics_status === 'Order Cancelled')) return;
    const accountsApprovalDone = ordersInPO.every((o) => o['Actual 2'] && String(o['Actual 2']).trim() !== '');
    if (!accountsApprovalDone) return;

    ordersInPO.forEach((order) => {
      const firmKey = normalizeFirmKey(normalizeOrderFirmName(order['Firm Name']));
      const productKey = normalizeItemKey(order['Product Name']);
      const pendingQty = getOrderPendingQty(order);
      if (!firmKey || !productKey || pendingQty <= 0) return;
      const key = `${firmKey}::${productKey}`;
      pendingMap[key] = (pendingMap[key] || 0) + pendingQty;
    });
  });

  return pendingMap;
};

const snapshotFinishedGoods = async (snapshotDate: string, selectedDate: string) => {
  const [masters, productionMap, dispatchMap, pendingOrderMap, purchaseMap, returnMap, adjustmentMap, consumptionMap, purchaseReturnMap] =
    await Promise.all([
      fetchAll(db().inventoryDb, 'finished_goods_inventory_master', 'id, firm_name, product_name, op_stock'),
      buildFinishedGoodProductionMap(selectedDate),
      buildFinishedGoodDispatchMap(selectedDate),
      buildFinishedGoodPendingOrderMap(),
      buildFinishedGoodPurchaseMap(selectedDate),
      buildFinishedGoodReturnMap(selectedDate),
      buildFinishedGoodAdjustmentMap(selectedDate),
      buildFinishedGoodConsumptionMap(selectedDate),
      buildFinishedGoodPurchaseReturnMap(selectedDate),
    ]);

  // With a selectedDate the screen reads the `after` bucket for every movement
  // except adjustments, which always use `total`.
  const pick = (m: Record<string, Bucket>, key: string) => (selectedDate ? m[key]?.after || 0 : m[key]?.total || 0);

  return masters.map((item) => {
    const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.product_name)}`;

    const production = pick(productionMap, key);
    const sales = pick(dispatchMap, key);
    const purchase = pick(purchaseMap, key);
    const salesReturn = pick(returnMap, key);
    const consumption = pick(consumptionMap, key);
    const purchaseReturn = pick(purchaseReturnMap, key);
    const adjustment = adjustmentMap[key]?.total || 0;
    const opStock = numberOrZero(item.op_stock);

    // The movement figures only feed current_level; they are not stored.
    // sales_order_pending is, because the page tints against it.
    return {
      snapshot_date: snapshotDate,
      firm_name: item.firm_name,
      product_name: item.product_name,
      current_level: opStock + purchase + production + adjustment - sales + salesReturn - consumption - purchaseReturn,
      sales_order_pending: pendingOrderMap[key] ?? 0,
    };
  });
};

const upsertChunked = async (table: string, rows: Row[], onConflict: string) => {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().inventoryDb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
};

// --- entrypoint ------------------------------------------------------------

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    let body: Row = {};
    try {
      body = await req.json();
    } catch {
      // cron posts an empty body
    }

    // At 00:00 IST the day that just ended is "yesterday" in IST.
    const snapshotDate: string = body.snapshot_date
      || new Date(Date.now() + IST_OFFSET_MS - 86400000).toISOString().slice(0, 10);

    const [rawRows, fgRows] = await Promise.all([
      snapshotRawMaterial(snapshotDate, INVENTORY_START_DATE),
      snapshotFinishedGoods(snapshotDate, INVENTORY_START_DATE),
    ]);

    await upsertChunked('inventory_master_history', rawRows, 'snapshot_date,firm_name,item_name');
    await upsertChunked('finished_goods_inventory_history', fgRows, 'snapshot_date,firm_name,product_name');

    const result = {
      ok: true,
      snapshot_date: snapshotDate,
      ist_today: istToday(),
      raw_material_rows: rawRows.length,
      finished_goods_rows: fgRows.length,
      took_ms: Date.now() - startedAt,
    };
    console.log('daily-inventory-history', JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('daily-inventory-history failed:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
