// API Service Layer with Google Apps Script & Mock Fallback
import axios from 'axios';
import * as mockDb from './mockData';
import { orderSupabase, productionSupabase, purchaseSupabase, salesRawSupabase, supabase } from './supabaseClient';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

const isMock = !APPS_SCRIPT_URL;

if (isMock) {
  console.log('IMS System: VITE_APPS_SCRIPT_URL not set. Operating in Local Mock Database mode.');
} else {
  console.log(`IMS System: Connecting to Google Sheets API at: ${APPS_SCRIPT_URL}`);
}

// Axios helper for Google Apps Script Web App
// Web Apps redirect with a 302, Axios handles this automatically in browser environments.
const client = axios.create({
  baseURL: APPS_SCRIPT_URL,
  headers: {
    'Content-Type': 'text/plain;charset=utf-8', // Google Apps Script handles POST payloads best with this or no Content-Type
  },
});

const normalizeFirmKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/pmmpl|madhya/g, 'pmmpl')
    .replace(/[^a-z0-9]/g, '');

const normalizeItemKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const cleanJsonString = (val) => {
  if (!val) return '';
  let str = String(val).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) && parsed.length > 0) {
        str = String(parsed[0]).trim();
      }
    } catch (e) {
      str = str.slice(1, -1).replace(/^["']|["']$/g, '').trim();
    }
  }
  return str;
};

const getLocalDateString = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) return trimmed.replace(/\//g, '-');
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
    if (match) return match[1];
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isBlankValue = (value) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const toFiniteNumber = (value) => {
  if (isBlankValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const calculateOptimumStockTotal = (optimumStock, productRate) => {
  if (isBlankValue(optimumStock) || isBlankValue(productRate)) return '';

  const optimum = toFiniteNumber(optimumStock);
  const rate = toFiniteNumber(productRate);
  return optimum !== null && rate !== null ? optimum * rate : '';
};

const calculateStockTotal = (actualLevel, productRate) => {
  if (isBlankValue(actualLevel) || isBlankValue(productRate) || String(actualLevel).trim() === '-') return '';

  const actual = toFiniteNumber(actualLevel);
  const rate = toFiniteNumber(productRate);
  if (actual === null || rate === null || actual < 0) return '';

  return actual * rate;
};

const roundTo = (value, decimals = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const factor = 10 ** decimals;
  return Math.round((number + Number.EPSILON) * factor) / factor;
};

const hasFiniteNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const numberOrZero = (value) => (hasFiniteNumber(value) ? Number(value) : 0);

const calculateFinishedGoodCurrentLevel = (item) => {
  if (hasFiniteNumber(item.current_level)) return Number(item.current_level);

  const fields = [
    'op_stock',
    'stock_adjustment',
    'purchase_material_received',
    'lift_material',
    'in_transit',
    'purchase_return',
    'production',
    'sales',
    'sales_return',
    'consumption'
  ];

  const hasAnyValue = fields.some((field) => hasFiniteNumber(item[field]));
  if (!hasAnyValue) return item.current_level;

  return numberOrZero(item.op_stock)
    + numberOrZero(item.stock_adjustment)
    + numberOrZero(item.purchase_material_received)
    + numberOrZero(item.lift_material)
    + numberOrZero(item.in_transit)
    + numberOrZero(item.production)
    + numberOrZero(item.sales_return)
    - numberOrZero(item.purchase_return)
    - numberOrZero(item.sales)
    - numberOrZero(item.consumption);
};

const ANNUAL_CONSUMPTION_DAYS = 365;
const DAILY_CONSUMPTION_WORKING_DAYS = 300;

const getAnnualConsumptionCutoff = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ANNUAL_CONSUMPTION_DAYS);
  return cutoff;
};

const parseProductionDate = (row) => {
  const rawDate = row['Date Of Production'] || row.Timestamp;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const productionFirmNameMap = {
  puraborder: 'Purab',
  rklorder: 'Rkl',
  pmmplorder: 'Pmmpl'
};

const normalizeProductionFirmName = (value) => {
  const firmKey = normalizeItemKey(value);
  return productionFirmNameMap[firmKey] || value;
};

const orderFirmNameMap = {
  puraborder: 'Purab',
  rklorder: 'Rkl',
  pmmplorder: 'Pmmpl'
};

const normalizeOrderFirmName = (value) => {
  const firmKey = normalizeItemKey(value);
  return orderFirmNameMap[firmKey] || value;
};

const buildProductionUsageMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const usageMap = {};
  const annualUsageMap = {};
  const annualCutoff = getAnnualConsumptionCutoff();

  try {
    const rawMaterialColumns = Array.from({ length: 20 }, (_, index) => {
      const rawIndex = index + 1;
      return `"Raw Material Name ${rawIndex}", "Quantity Of Raw Material ${rawIndex}"`;
    }).join(', ');
    const selectColumns = `id, "Timestamp", "Date Of Production", "FIRM Name", ${rawMaterialColumns}`;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select(selectColumns)
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
        if (!firmKey) return;

        const productionDate = parseProductionDate(row);
        const isAnnualConsumption = productionDate !== null && productionDate >= annualCutoff;
        const productionDateString = getLocalDateString(row['Date Of Production'] || row.Timestamp);
        const isInSelectedPeriod = !selectedDate || (productionDateString && productionDateString >= selectedDate);

        for (let i = 1; i <= 20; i += 1) {
          const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
          if (!itemKey) continue;

          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) continue;

          const key = `${firmKey}::${itemKey}`;
          if (isInSelectedPeriod) {
            usageMap[key] = (usageMap[key] || 0) + quantity;
          }
          if (isAnnualConsumption) {
            annualUsageMap[key] = (annualUsageMap[key] || 0) + quantity;
          }
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase production usage sync failed:', error.message);
  }

  return { usageMap, annualUsageMap };
};

const buildSemiFinishedActualLevelMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const productionFirmMap = new Map();
  const semiAdjustmentMap = {};
  const semiGrainsMap = {};
  const semiFinesMap = {};
  const semiRawConsumptionMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_production')
        .select('id, "SF-Sr No.", "Name Of Semi Finished Good", "Firm name"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (row['SF-Sr No.']) {
          const productionKey = `${row['SF-Sr No.']}::${normalizeItemKey(row['Name Of Semi Finished Good'])}`;
          productionFirmMap.set(productionKey, row['Firm name']);
        }
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_actual')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp || row.created_at || row.date);
        if (selectedDate && (!rowDate || rowDate < selectedDate)) return;

        const serialNumber = row['S No.'];
        if (!serialNumber || !String(serialNumber).startsWith('SA-')) return;

        const productName = row['Product Name'];
        const productKey = normalizeItemKey(productName);
        const productionKey = `${row['Semi Finished Production No.']}::${productKey}`;
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(productionFirmMap.get(productionKey)));
        const rawQuantity = row['Qty Of Semi Finished Good'];
        const quantity = Number(rawQuantity);
        if (!firmKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        // Process raw materials consumed — runs for ALL valid rows regardless of product type
        for (let i = 1; i <= 5; i++) {
          const rmName = row[`Raw Material Name ${i}`];
          const rmKey = normalizeItemKey(rmName);
          const rmQtyRaw = row[`Quantity Of Raw Material ${i}`];
          const rmQty = Number(rmQtyRaw);
          if (rmKey && rmQtyRaw !== null && rmQtyRaw !== '' && Number.isFinite(rmQty) && rmQty > 0) {
            const rmMapKey = `${firmKey}::${rmKey}`;
            semiRawConsumptionMap[rmMapKey] = (semiRawConsumptionMap[rmMapKey] || 0) + rmQty;
          }
        }

        // Semi finished output adjustment (only for fines/grains products)
        if (!productKey) return;
        const productText = String(productName || '').toLowerCase();
        const signedQuantity = productText.includes('grains')
          ? -quantity
          : productText.includes('fines')
            ? quantity
            : 0;
        if (signedQuantity === 0) return;

        const key = `${firmKey}::${productKey}`;
        semiAdjustmentMap[key] = (semiAdjustmentMap[key] || 0) + signedQuantity;
        if (productText.includes('grains')) {
          semiGrainsMap[key] = (semiGrainsMap[key] || 0) + signedQuantity;
        } else if (productText.includes('fines')) {
          semiFinesMap[key] = (semiFinesMap[key] || 0) + signedQuantity;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase semi finished actual sync failed:', error.message);
  }

  return { semiAdjustmentMap, semiGrainsMap, semiFinesMap, semiRawConsumptionMap };
};

const buildCrushingActualLevelMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const crushingAdjustmentMap = {};
  const crushingGrainsMap = {};
  const crushingFinesMap = {};
  const crushingLumpsMap = {};
  const crushingOutputsMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('crushing_actual')
        .select('*')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const rowDate = getLocalDateString(row.Timestamp || row.created_at || row.date);
        if (selectedDate && (!rowDate || rowDate < selectedDate)) return;

        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['Firm Name']));
        if (!firmKey) return;

        // Process Input Product (if available and valid)
        const productName = row['Crushing Product Name'];
        const productKey = normalizeItemKey(productName);
        const rawQuantity = row['Qty Of Crushing Product'];
        const quantity = Number(rawQuantity);

        if (productKey && rawQuantity !== null && rawQuantity !== '' && Number.isFinite(quantity)) {
          const productText = String(productName || '').toLowerCase();
          // Any crushing input product is consumed (−) unless it's explicitly a
          // produced grains/fines semi-good (+). Previously, product names that
          // didn't literally contain "lumps"/"fired" (e.g. "Ferro Chrome Slag")
          // fell through to 0 and their consumption was silently dropped.
          const isProducedType = productText.includes('grains') || productText.includes('fines');
          const signedQuantity = isProducedType ? quantity : -quantity;
          if (signedQuantity !== 0) {
            const key = `${firmKey}::${productKey}`;
            crushingAdjustmentMap[key] = (crushingAdjustmentMap[key] || 0) + signedQuantity;
            if (productText.includes('grains')) {
              crushingGrainsMap[key] = (crushingGrainsMap[key] || 0) + signedQuantity;
            } else if (productText.includes('fines')) {
              crushingFinesMap[key] = (crushingFinesMap[key] || 0) + signedQuantity;
            } else {
              crushingLumpsMap[key] = (crushingLumpsMap[key] || 0) + signedQuantity;
            }
          }
        }

        // Process Finished Goods Outputs (1 to 4)
        for (let i = 1; i <= 4; i++) {
          const fgName = row[`Finished Goods Name ${i}`];
          const fgQtyRaw = row[`Qty ${i}`];
          const fgQty = Number(fgQtyRaw);
          const fgKey = normalizeItemKey(fgName);

          if (!fgKey || fgQtyRaw === null || fgQtyRaw === '' || !Number.isFinite(fgQty)) continue;

          const fgMapKey = `${firmKey}::${fgKey}`;
          crushingOutputsMap[fgMapKey] = (crushingOutputsMap[fgMapKey] || 0) + fgQty;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase crushing actual sync failed:', error.message);
  }

  return {
    crushingAdjustmentMap,
    crushingGrainsMap,
    crushingFinesMap,
    crushingLumpsMap,
    crushingOutputsMap
  };
};

const buildFinishedGoodProductionMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const productionMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select('id, "FIRM Name", "Product Name", "Quantity Of FG", "Timestamp", "Date Of Production", "Job Card No."')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
        const productKey = normalizeItemKey(row['Product Name']);
        const rawQuantity = row['Quantity Of FG'];
        const quantity = Number(rawQuantity);

        if (!firmKey || !productKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const key = `${firmKey}::${productKey}`;
        if (!productionMap[key]) {
          productionMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
        productionMap[key].total += quantity;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          productionMap[key].after += quantity;
        } else {
          productionMap[key].before += quantity;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good production sync failed:', error.message);
  }

  // Fetch crushing_actual outputs for finished goods production
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('crushing_actual')
        .select('id, "Timestamp", "Date Of Production", "Firm Name", "Finished Goods Name 1", "Qty 1", "Finished Goods Name 2", "Qty 2", "Finished Goods Name 3", "Qty 3", "Finished Goods Name 4", "Qty 4"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['Firm Name']));
        if (!firmKey) return;

        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);

        for (let i = 1; i <= 4; i++) {
          const fgName = row[`Finished Goods Name ${i}`];
          const fgQtyRaw = row[`Qty ${i}`];
          const fgQty = Number(fgQtyRaw);
          const fgKey = normalizeItemKey(fgName);

          if (!fgKey || fgQtyRaw === null || fgQtyRaw === '' || !Number.isFinite(fgQty)) continue;

          const key = `${firmKey}::${fgKey}`;
          if (!productionMap[key]) {
            productionMap[key] = { before: 0, after: 0, total: 0 };
          }

          productionMap[key].total += fgQty;
          if (selectedDate && rowDate && rowDate >= selectedDate) {
            productionMap[key].after += fgQty;
          } else {
            productionMap[key].before += fgQty;
          }
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good crushing production sync failed:', error.message);
  }

  return productionMap;
};

const buildFinishedGoodConsumptionMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const consumptionMap = {};

  try {
    const rawMaterialColumns = Array.from({ length: 20 }, (_, index) => {
      const rawIndex = index + 1;
      return `"Raw Material Name ${rawIndex}", "Quantity Of Raw Material ${rawIndex}"`;
    }).join(', ');
    const selectColumns = `id, "Timestamp", "Date Of Production", "FIRM Name", ${rawMaterialColumns}`;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select(selectColumns)
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
        if (!firmKey) return;

        const productionDateString = getLocalDateString(row['Date Of Production'] || row.Timestamp);

        for (let i = 1; i <= 20; i += 1) {
          const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
          if (!itemKey) continue;

          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) continue;

          const key = `${firmKey}::${itemKey}`;
          if (!consumptionMap[key]) {
            consumptionMap[key] = { before: 0, after: 0, total: 0 };
          }

          consumptionMap[key].total += quantity;
          if (selectedDate && productionDateString && productionDateString >= selectedDate) {
            consumptionMap[key].after += quantity;
          } else {
            consumptionMap[key].before += quantity;
          }
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good consumption map build failed:', error.message);
  }

  return consumptionMap;
};

const buildFinishedGoodPurchaseReturnMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const purchaseReturnMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('Purchase Returns')
        .select('"ID", "Firm Name", "Product Name", "Return This Time", "Time Stamp"')
        .order('ID', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const cleanFirm = cleanJsonString(row['Firm Name']);
        const cleanProduct = cleanJsonString(row['Product Name']);
        const firmKey = normalizeFirmKey(cleanFirm);
        const productKey = normalizeItemKey(cleanProduct);
        const rawQty = row['Return This Time'];
        const qty = Number(rawQty);

        if (!firmKey || !productKey || rawQty === null || rawQty === '' || !Number.isFinite(qty)) return;

        const key = `${firmKey}::${productKey}`;
        if (!purchaseReturnMap[key]) {
          purchaseReturnMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(row['Time Stamp']);
        purchaseReturnMap[key].total += qty;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          purchaseReturnMap[key].after += qty;
        } else {
          purchaseReturnMap[key].before += qty;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good purchase return sync failed:', error.message);
  }

  return purchaseReturnMap;
};

const buildFinishedGoodDispatchMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const orderMap = new Map();
  const dispatchMap = {};
  const normalizeJoinId = (value) => String(value ?? '').trim();

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('id, "Firm Name", "Product Name"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const orderId = normalizeJoinId(row.id);
        if (orderId) orderMap.set(orderId, row);
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('DISPATCH')
        .select('id, po_id, "Product Name", "Qty To Be Dispatched", "Actual Truck Qty", "Planned4", "Actual4", "Bill Date"')
        .not('Planned4', 'is', null)
        .not('Actual4', 'is', null)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const invoiceActualizedAt = String(row['Bill Date'] || row.Actual4 || '').trim();
        if (!invoiceActualizedAt) return;

        const po = orderMap.get(normalizeJoinId(row.po_id)) || {};
        const firmKey = normalizeFirmKey(normalizeOrderFirmName(po['Firm Name']));
        const dispatchProductName = String(row['Product Name'] || '').trim();
        const productKey = normalizeItemKey(dispatchProductName || po['Product Name']);
        if (!firmKey || !productKey) return;

        const actualTruckQty = Number(row['Actual Truck Qty']);
        const plannedDispatchQty = Number(row['Qty To Be Dispatched']);
        const validActualTruckQty = Number.isFinite(actualTruckQty) && actualTruckQty > 0 ? actualTruckQty : 0;
        const validPlannedDispatchQty = Number.isFinite(plannedDispatchQty) && plannedDispatchQty > 0 ? plannedDispatchQty : 0;
        const truckQty = validActualTruckQty && validPlannedDispatchQty
          ? Math.min(validActualTruckQty, validPlannedDispatchQty)
          : validActualTruckQty || validPlannedDispatchQty;
        const key = `${firmKey}::${productKey}`;
        if (!dispatchMap[key]) {
          dispatchMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(invoiceActualizedAt);
        dispatchMap[key].total += truckQty;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          dispatchMap[key].after += truckQty;
        } else {
          dispatchMap[key].before += truckQty;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good dispatch sync failed:', error.message);
  }

  return dispatchMap;
};

const getOrderPendingQty = (order) => {
  const totalQty = Number(order.Quantity) || 0;
  const deliveredQty = Number(order.Delivered) || 0;

  if (order['Pending Qty'] !== null && order['Pending Qty'] !== undefined && String(order['Pending Qty']).trim() !== '') {
    return Math.max(0, Number(order['Pending Qty']));
  }

  return Math.max(0, totalQty - deliveredQty);
};

const buildFinishedGoodPendingOrderMap = async () => {
  const pageSize = 1000;
  const orderRows = [];
  const pendingMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('id, "PARTY PO NO (As Per Po Exact)", "Firm Name", "Product Name", "Quantity", "Delivered", "Pending Qty", "Actual 2", logistics_status')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      orderRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const poGroups = {};
    orderRows.forEach((order) => {
      const poKey = order['PARTY PO NO (As Per Po Exact)'] || `__no_po_${order.id}`;
      if (!poGroups[poKey]) {
        poGroups[poKey] = [];
      }
      poGroups[poKey].push(order);
    });

    Object.values(poGroups).forEach((ordersInPO) => {
      const isCancelled = ordersInPO.some(order => order.logistics_status === 'Order Cancelled');
      if (isCancelled) return;

      const accountsApprovalDone = ordersInPO.every(order => order['Actual 2'] && String(order['Actual 2']).trim() !== '');
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
  } catch (error) {
    console.warn('Supabase finished good pending order sync failed:', error.message);
  }

  return pendingMap;
};

const buildFinishedGoodPurchaseMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const purchaseMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Firm Name", "Raw Material Name", "Actual Quantity", "Date Of Receiving", "Timestamp"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(row['Firm Name']);
        const productKey = normalizeItemKey(row['Raw Material Name']);
        const rawQuantity = row['Actual Quantity'];
        const quantity = Number(rawQuantity);

        if (!firmKey || !productKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const key = `${firmKey}::${productKey}`;
        if (!purchaseMap[key]) {
          purchaseMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(row['Date Of Receiving'] || row['Timestamp']);
        purchaseMap[key].total += quantity;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          purchaseMap[key].after += quantity;
        } else {
          purchaseMap[key].before += quantity;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good purchase sync failed:', error.message);
  }

  return purchaseMap;
};

const buildFinishedGoodReturnMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const firmByDoNumber = {};
  const returnMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('"DO-Delivery Order No.", "Firm Name"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const doNumber = row['DO-Delivery Order No.'];
        if (doNumber) {
          firmByDoNumber[doNumber] = row['Firm Name'];
        }
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('Material Return')
        .select('id, "D.O Number", "Product Name", "Qty Of Return Material", "Qty", "Return Dispatched At", "Actual5", "Debit Note Issued At"')
        .not('Actual5', 'is', null)
        .not('Debit Note Issued At', 'is', null)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const returnDispatchedAt = row['Return Dispatched At'] || '';
        if (!returnDispatchedAt || String(returnDispatchedAt).trim() === '') return;

        const firmKey = normalizeFirmKey(normalizeOrderFirmName(firmByDoNumber[row['D.O Number']]));
        const productKey = normalizeItemKey(row['Product Name']);
        if (!firmKey || !productKey) return;

        const returnQty = Number(row['Qty Of Return Material']) || Number(row['Qty']) || 0;
        const key = `${firmKey}::${productKey}`;
        if (!returnMap[key]) {
          returnMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(returnDispatchedAt);
        returnMap[key].total += returnQty;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          returnMap[key].after += returnQty;
        } else {
          returnMap[key].before += returnQty;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good return sync failed:', error.message);
  }

  return returnMap;
};

const buildFinishedGoodAdjustmentMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const adjustmentMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, qty, status, material_type, entry_date')
        .eq('material_type', 'finish_good')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(row.firm_name);
        const productKey = normalizeItemKey(row.item_name);
        const qty = Number(row.qty || 0);
        if (!firmKey || !productKey || !Number.isFinite(qty)) return;

        const key = `${firmKey}::${productKey}`;
        if (!adjustmentMap[key]) {
          adjustmentMap[key] = { before: 0, after: 0, total: 0 };
        }

        const value = row.status === 'Factory -' ? -qty : qty;
        const rowDate = getLocalDateString(row.entry_date);
        adjustmentMap[key].total += value;
        if (selectedDate && rowDate && rowDate >= selectedDate) {
          adjustmentMap[key].after += value;
        } else {
          adjustmentMap[key].before += value;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good adjustment sync failed:', error.message);
  }

  return adjustmentMap;
};

// Packaging items whose Product Rate is computed as (Billing Qty * Rate) / Total Bag Qty
// instead of using the plain "Rate" column.
const BAG_RATE_ITEM_KEYS = new Set([
  'Pasheat-CLC PP Bags 25 Kg',
  'PP Bag (25 kgs)',
  'Pp Bag (50 kgs)',
  'PP BAG B - 25',
  'PP BAG R - 25'
].map(normalizeItemKey));

// Items whose LIFT-ACCOUNTS "Rate" is stored per 1000 units, so the Product Rate is divided by 1000.
const RATE_DIVIDE_BY_1000_ITEM_KEYS = new Set([
  'Light Diesel Oil'
].map(normalizeItemKey));

// Same "Unload Approval" completion filter used for the packaging bag rate calculation.
const isUnloadApprovalComplete = (row) => {
  const status = row['Unload Approval Status'];
  const required = row['Unload Approval Required'];
  if (status === 'Rejected' || status === 'Completed') return true;
  if (status === 'Approved' && required !== 'Yes') return true;
  if (status === 'Approved' && required === 'Yes' && Boolean(row['Planned 2'] || row['Actual 2'])) return true;
  return false;
};

const buildLiftDataMaps = async (selectedDate = '') => {
  const pageSize = 1000;
  const liftRows = [];

  try {
    // 1. Fetch only receipts completed through Receipt Of Material / Physical Quality Check.
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Lift No", "Firm Name", "Raw Material Name", "Actual Quantity", "Rate", "Transporter Rate", "Lifting Qty", "Total Bags Qty", "Type Of Transporting Rate", "Date Of Receiving", "Actual 1", "Unload Approval Status", "Unload Approval Required", "Planned 2", "Actual 2"')
        .not('Actual 1', 'is', null)
        .not('Actual Quantity', 'is', null)
        .order('Actual 1', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      liftRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const actualQuantityMap = {};
    const purchaseQuantityMap = {};
    const transportingRatesMap = {};
    const poRatesMap = {};
    const latestReceivingDateMap = {};

    // Process LIFT-ACCOUNTS
    liftRows.forEach((row) => {
      if (isBlankValue(row['Actual 1']) || isBlankValue(row['Actual Quantity'])) return;

      const firmKey = normalizeFirmKey(row['Firm Name']);
      const itemKey = normalizeItemKey(row['Raw Material Name']);
      if (!firmKey || !itemKey) return;

      const key = `${firmKey}::${itemKey}`;
      const rowDate = getLocalDateString(row['Date Of Receiving']);
      const isInSelectedPeriod = !selectedDate || (rowDate && rowDate >= selectedDate);

      // Accumulate only receipts whose quality-check process has completed.
      const rawActualQuantity = row['Actual Quantity'];
      const actualQuantity = Number(rawActualQuantity);
      if (isInSelectedPeriod && Number.isFinite(actualQuantity)) {
        actualQuantityMap[key] = (actualQuantityMap[key] || 0) + actualQuantity;
        purchaseQuantityMap[key] = (purchaseQuantityMap[key] || 0) + actualQuantity;
      }

      // Product Rate: take the Rate from the LIFT-ACCOUNTS record with the latest Date Of Receiving.
      // For packaging bag items (BAG_RATE_ITEM_KEYS), the rate is instead computed as
      // (Billing Qty * Rate) / Total Bag Qty from rows whose Unload Approval is complete.
      let liftMaterialRate;
      if (BAG_RATE_ITEM_KEYS.has(itemKey)) {
        const billingQty = Number(row['Lifting Qty']);
        const rate = Number(row['Rate']);
        const totalBagQty = Number(row['Total Bags Qty']);
        liftMaterialRate = (
          isUnloadApprovalComplete(row) &&
          Number.isFinite(billingQty) &&
          Number.isFinite(rate) &&
          Number.isFinite(totalBagQty) &&
          totalBagQty !== 0
        ) ? (billingQty * rate) / totalBagQty : NaN;
      } else {
        liftMaterialRate = Number(row['Rate']);
      }
      if (RATE_DIVIDE_BY_1000_ITEM_KEYS.has(itemKey) && Number.isFinite(liftMaterialRate)) {
        liftMaterialRate = liftMaterialRate / 1000;
      }
      if (
        rowDate &&
        Number.isFinite(liftMaterialRate) &&
        (latestReceivingDateMap[key] === undefined || rowDate > latestReceivingDateMap[key])
      ) {
        latestReceivingDateMap[key] = rowDate;
        poRatesMap[key] = liftMaterialRate;
      }

      // Set the latest Per MT Transportation Rate.
      // Applicable when Type Of Transporting Rate is "Per MT" or "Fixed":
      // perMTRate = Transporter Rate / Lifting Qty (rounded to 2 decimals).
      if (transportingRatesMap[key] === undefined) {
        const rateType = String(row['Type Of Transporting Rate'] || '').trim().toLowerCase();
        const transporterRate = Number(row['Transporter Rate']);
        const liftingQty = Number(row['Lifting Qty']);

        if (
          (rateType === 'per mt' || rateType === 'fixed') &&
          Number.isFinite(transporterRate) &&
          Number.isFinite(liftingQty) &&
          liftingQty !== 0
        ) {
          transportingRatesMap[key] = roundTo(transporterRate / liftingQty, 2);
        }
      }
    });

    const [
      { usageMap: productionUsageMap, annualUsageMap: annualProductionUsageMap },
      { semiAdjustmentMap, semiGrainsMap, semiFinesMap, semiRawConsumptionMap },
      { crushingAdjustmentMap, crushingGrainsMap, crushingFinesMap, crushingLumpsMap, crushingOutputsMap }
    ] = await Promise.all([
      buildProductionUsageMap(selectedDate),
      buildSemiFinishedActualLevelMap(selectedDate),
      buildCrushingActualLevelMap(selectedDate)
    ]);
    Object.entries(productionUsageMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) - quantity;
    });
    Object.entries(semiRawConsumptionMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) - quantity;
    });
    Object.entries(semiAdjustmentMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) + quantity;
    });
    Object.entries(crushingAdjustmentMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) + quantity;
    });
    Object.entries(crushingOutputsMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) + quantity;
    });

    // Merge rates
    const ratesMap = {};
    Object.keys(poRatesMap).forEach((key) => {
      const poRate = poRatesMap[key];
      const transRate = transportingRatesMap[key] || 0;
      ratesMap[key] = poRate + transRate;
    });

    // Add keys from transportingRatesMap that might not be in poRatesMap (fallback)
    Object.keys(transportingRatesMap).forEach((key) => {
      if (ratesMap[key] === undefined) {
        ratesMap[key] = transportingRatesMap[key];
      }
    });

    return {
      actualQuantityMap,
      ratesMap,
      poRatesMap,
      transportingRatesMap,
      annualProductionUsageMap,
      purchaseQuantityMap,
      productionUsageMap,
      semiGrainsMap,
      semiFinesMap,
      semiRawConsumptionMap,
      crushingGrainsMap,
      crushingFinesMap,
      crushingLumpsMap,
      crushingOutputsMap
    };
  } catch (error) {
    console.warn('Supabase purchase tables data sync failed:', error.message);
    return {
      actualQuantityMap: {},
      ratesMap: {},
      poRatesMap: {},
      transportingRatesMap: {},
      annualProductionUsageMap: {},
      purchaseQuantityMap: {},
      productionUsageMap: {},
      semiGrainsMap: {},
      semiFinesMap: {},
      semiRawConsumptionMap: {},
      crushingGrainsMap: {},
      crushingFinesMap: {},
      crushingLumpsMap: {},
      crushingOutputsMap: {}
    };
  }
};

const hasActualLevel = (item) => {
  const actualLevel = item.actual_level;
  return actualLevel !== null && actualLevel !== undefined && actualLevel !== '' && Number.isFinite(Number(actualLevel));
};

const hasMeaningfulValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue !== 0;
  return true;
};

const mergeDuplicateInventoryRows = (rows) => {
  const byFirmAndItem = new Map();

  rows.forEach((row) => {
    const key = `${normalizeFirmKey(row.firm_name)}::${normalizeItemKey(row.item_name)}`;
    const existing = byFirmAndItem.get(key);

    if (!existing) {
      byFirmAndItem.set(key, row);
      return;
    }

    [
      'annu_con',
      'd_con',
      'sf',
      'lead_time',
      'max_stock',
      'optimum_stock',
      'actual_level',
      'product_rate',
      'material_rate',
      'transportation_rate',
      'optimum_stock_total',
      'stock_total',
      'unit',
      'colour'
    ].forEach((field) => {
      if (!hasMeaningfulValue(existing[field]) && hasMeaningfulValue(row[field])) {
        existing[field] = row[field];
      }
    });
  });

  return Array.from(byFirmAndItem.values());
};

// Helper to make API calls to Google Apps Script
const callApi = async (action, payload = {}) => {
  try {
    const response = await client.post('', {
      action,
      ...payload
    });
    
    if (response.data && response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data?.message || 'API request failed');
    }
  } catch (error) {
    console.error(`API Error on action [${action}]:`, error);
    // Alert the user and throw error
    throw error;
  }
};

export const apiService = {
  // Authentication
  login: async (username, password) => {
    try {
      const { data, error } = await supabase
        .from('login')
        .select('*')
        .eq('username', username)
        .eq('password', password); // In production, passwords should be salted and hashed.
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        const loggedUser = data[0];
        
        // If role is Admin, don't restrict page_access and firm_name (allow all)
        if (loggedUser.role === 'Admin') {
          return {
            success: true,
            user: {
              username: loggedUser.username,
              name: loggedUser.username === 'admin' ? 'System Administrator' : loggedUser.username,
              role: loggedUser.role,
              branch: 'All', // Admin sees all branches
              page_access: null
            }
          };
        } else {
          // Parse firm_name: may be 'All', a single branch, or comma-separated list
          const rawFirm = loggedUser.firm_name || 'All';
          const branch = rawFirm === 'All' ? 'All' : rawFirm.split(',').map(s => s.trim()).filter(Boolean);
          return {
            success: true,
            user: {
              username: loggedUser.username,
              name: loggedUser.username,
              role: loggedUser.role,
              branch,  // 'All' string OR array like ['Purab','Pmmpl']
              page_access: loggedUser.page_access || []
            }
          };
        }
      }
      
      return { success: false, message: 'Invalid username or password' };
    } catch (e) {
      console.warn('Supabase authentication failed, trying mock fallback:', e.message);
      // Fallback to mock logins if Supabase is not configured/offline
      return mockDb.mockLogin(username, password);
    }
  },

  // Inventory
  getInventory: async (branch, selectedDate = '', page = 1, pageSize = 100, searchQuery = '', firmFilter = '') => {
    try {
      const normalizedBranch = branch?.toLowerCase().trim();
      let query = supabase
        .from('inventory_master')
        .select('*', { count: 'exact' });

      if (firmFilter) {
        query = query.ilike('firm_name', `%${firmFilter}%`);
      } else if (normalizedBranch && normalizedBranch !== 'all') {
        if (normalizedBranch === 'pmmpl' || normalizedBranch === 'madhya') {
          query = query.in('firm_name', ['Pmmpl', 'Madhya', 'pmmpl', 'madhya']);
        } else {
          query = query.ilike('firm_name', `%${normalizedBranch}%`);
        }
      }

      if (searchQuery) {
        query = query.ilike('item_name', `%${searchQuery}%`);
      }

      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      query = query.range(start, end)
        .order('firm_name', { ascending: true })
        .order('item_name', { ascending: true });

      const [
        { data, count, error },
        {
          actualQuantityMap,
          ratesMap,
          poRatesMap,
          transportingRatesMap,
          annualProductionUsageMap,
          purchaseQuantityMap,
          productionUsageMap,
          semiGrainsMap,
          semiFinesMap,
          semiRawConsumptionMap,
          crushingGrainsMap,
          crushingFinesMap,
          crushingLumpsMap,
          crushingOutputsMap
        },
        salesRawOrdersResult
      ] = await Promise.all([
        query,
        buildLiftDataMaps(selectedDate),
        salesRawSupabase
          .from('orders')
          .select('*')
          .eq('status', 'Completed')
          .then(res => {
            if (res.error) throw res.error;
            return res.data || [];
          })
          .catch(err => {
            console.warn('Failed to fetch Sales of Raw Material orders:', err.message);
            return [];
          })
      ]);

      if (error) throw error;

      const salesRawQtyMap = {};

      (salesRawOrdersResult || []).forEach(order => {
        const orderDate = getLocalDateString(
          order.completed_at || order.updated_at || order.created_at || order.order_date || order.date
        );
        if (selectedDate && (!orderDate || orderDate < selectedDate)) return;

        const firmKey = normalizeFirmKey(order.firm_name);
        const itemKey = normalizeItemKey(order.product_name);
        if (!firmKey || !itemKey) return;

        const key = `${firmKey}::${itemKey}`;
        salesRawQtyMap[key] = (salesRawQtyMap[key] || 0) + (Number(order.qty) || 0);
      });

      const inventoryRows = mergeDuplicateInventoryRows((data || [])
        .map((item, index) => {
          const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.item_name)}`;
          const baseRate = poRatesMap[key] !== undefined ? poRatesMap[key] : (item.product_rate ?? '');
          const transRate = transportingRatesMap[key] || 0;
          let rate = baseRate;
          if (rate !== '') {
            rate = Number(rate) + transRate;
          } else if (transRate > 0) {
            rate = transRate;
          }
          const opStock = numberOrZero(item.op_stock);

          let actualLevel = actualQuantityMap[key] ?? item.actual_level ?? '';
          const salesRawQty = salesRawQtyMap[key] || 0;
          if (actualLevel !== '' || salesRawQty !== 0 || opStock !== 0) {
            actualLevel = opStock + Number(actualLevel || 0) - salesRawQty;
          }

          const optimumStock = item.optimum_stock ?? item.optimum_qty ?? '';
          const dbAnnuCon = item.annu_con ?? item.annual_consumption;
          const annualConsumption = dbAnnuCon !== null && dbAnnuCon !== undefined && dbAnnuCon !== '' ? Number(dbAnnuCon) : 0;
          const dailyConsumption = annualConsumption > 0 ? roundTo(annualConsumption / 300, 3) : 0;

          const calculatedOptimumTotal = calculateOptimumStockTotal(optimumStock, rate);
          const calculatedStockTotal = calculateStockTotal(actualLevel, rate);

          return {
            ...item,
            _originalIndex: index,
            annu_con: annualConsumption,
            d_con: dailyConsumption,
            sf: item.safety_factor ?? item.sf ?? '',
            lead_time: item.lead_time_days ?? item.lead_time ?? '',
            max_stock: item.max_stock ?? item.max_qty ?? '',
            optimum_stock: optimumStock,
            op_stock: opStock,
            purchase_system: purchaseQuantityMap[key] || 0,
            production_consumption: -(productionUsageMap[key] || 0) + (semiGrainsMap[key] || 0) - (semiRawConsumptionMap[key] || 0) + (semiFinesMap[key] || 0) + (crushingGrainsMap[key] || 0) + (crushingLumpsMap[key] || 0) + (crushingOutputsMap[key] || 0),
            semi_grains: (semiGrainsMap[key] || 0) - (semiRawConsumptionMap[key] || 0),
            semi_fines: semiFinesMap[key] || 0,
            crushing_grains: crushingGrainsMap[key] || 0,
            crushing_fines: crushingFinesMap[key] || 0,
            crushing_lumps: crushingLumpsMap[key] || 0,
            crushing_outputs: crushingOutputsMap[key] || 0,
            raw_material_sales: -salesRawQty,
            actual_level: actualLevel,
            product_rate: rate,
            material_rate: baseRate,
            transportation_rate: transportingRatesMap[key] !== undefined ? transportingRatesMap[key] : 0,
            optimum_stock_total: calculatedOptimumTotal,
            stock_total: calculatedStockTotal,
            unit: item.unit ?? '',
            colour: item.colour ?? ''
          };
        }));

      return {
        data: inventoryRows
          .sort((a, b) => {
            const aHasActualLevel = hasActualLevel(a);
            const bHasActualLevel = hasActualLevel(b);

            if (aHasActualLevel && bHasActualLevel) {
              const actualLevelDiff = Number(b.actual_level) - Number(a.actual_level);
              if (actualLevelDiff !== 0) return actualLevelDiff;
            }

            if (aHasActualLevel !== bHasActualLevel) return aHasActualLevel ? -1 : 1;
            return a._originalIndex - b._originalIndex;
          })
          .map((row, index) => {
            const item = { ...row };
            delete item._originalIndex;
            return {
              ...item,
              s_no: index + 1
            };
          }),
        count: count || 0
      };
    } catch (e) {
      console.warn(`Supabase getInventory for ${branch} failed:`, e.message);
      return { data: [], count: 0 };
    }
  },

  // Finish Good Inventory — each branch has its own table & schema
  getFinishGoodInventory: async (branch, selectedDate = '', page = 1, pageSize = 100, searchQuery = '', firmFilter = '') => {
    try {
      const b = branch ? branch.toLowerCase().trim() : '';
      const productionMapPromise = buildFinishedGoodProductionMap(selectedDate);
      const dispatchMapPromise = buildFinishedGoodDispatchMap(selectedDate);
      const pendingOrderMapPromise = buildFinishedGoodPendingOrderMap();
      const purchaseMapPromise = buildFinishedGoodPurchaseMap(selectedDate);
      const returnMapPromise = buildFinishedGoodReturnMap(selectedDate);
      const adjustmentMapPromise = buildFinishedGoodAdjustmentMap(selectedDate);
      const consumptionMapPromise = buildFinishedGoodConsumptionMap(selectedDate);
      const purchaseReturnMapPromise = buildFinishedGoodPurchaseReturnMap(selectedDate);
      let query = supabase
        .from('finished_goods_inventory_master')
        .select('*', { count: 'exact' });

      if (firmFilter) {
        query = query.ilike('firm_name', `%${firmFilter}%`);
      } else if (b && b !== 'all') {
        if (b === 'pmmpl' || b === 'madhya') {
          query = query.in('firm_name', ['Pmmpl', 'Madhya', 'pmmpl', 'madhya']);
        } else {
          query = query.ilike('firm_name', `%${b}%`);
        }
      }

      if (searchQuery) {
        query = query.ilike('product_name', `%${searchQuery}%`);
      }

      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      query = query.range(start, end)
        .order('firm_name', { ascending: true })
        .order('product_name', { ascending: true });

      const { data, count, error } = await query;
      if (error) throw error;

      const productionMap = await productionMapPromise;
      const dispatchMap = await dispatchMapPromise;
      const pendingOrderMap = await pendingOrderMapPromise;
      const purchaseMap = await purchaseMapPromise;
      const returnMap = await returnMapPromise;
      const adjustmentMap = await adjustmentMapPromise;
      const consumptionMap = await consumptionMapPromise;
      const purchaseReturnMap = await purchaseReturnMapPromise;
      return {
        data: (data || [])
          .map((item) => {
            const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.product_name)}`;
            
            let productionQuantity, dispatchQuantity, purchaseQuantity, returnQuantity, adjustmentQuantity, consumptionQuantity, purchaseReturnQuantity;
            let adjustmentQuantityForCurrentLevel;

            if (selectedDate) {
              productionQuantity = productionMap[key]?.after || 0;
              dispatchQuantity = dispatchMap[key]?.after || 0;
              purchaseQuantity = purchaseMap[key]?.after || 0;
              returnQuantity = returnMap[key]?.after || 0;
              adjustmentQuantity = adjustmentMap[key]?.total || 0;
              adjustmentQuantityForCurrentLevel = adjustmentMap[key]?.total || 0;
              consumptionQuantity = consumptionMap[key]?.after || 0;
              purchaseReturnQuantity = purchaseReturnMap[key]?.after || 0;
            } else {
              productionQuantity = productionMap[key]?.total || 0;
              dispatchQuantity = dispatchMap[key]?.total || 0;
              purchaseQuantity = purchaseMap[key]?.total || 0;
              returnQuantity = returnMap[key]?.total || 0;
              adjustmentQuantity = adjustmentMap[key]?.total || 0;
              adjustmentQuantityForCurrentLevel = adjustmentMap[key]?.total || 0;
              consumptionQuantity = consumptionMap[key]?.total || 0;
              purchaseReturnQuantity = purchaseReturnMap[key]?.total || 0;
            }

            const pendingOrderQuantity = pendingOrderMap[key];
            const hasCurrentLevelSync = productionQuantity !== undefined || dispatchQuantity !== undefined || purchaseQuantity !== undefined || returnQuantity !== undefined || adjustmentQuantity !== undefined || consumptionQuantity !== undefined || purchaseReturnQuantity !== undefined;
            const opStock = numberOrZero(item.op_stock);

            return {
              ...item,
              op_stock: opStock,
              stock_adjustment: adjustmentQuantity !== undefined ? adjustmentQuantity : item.stock_adjustment,
              sales_order_pending: pendingOrderQuantity !== undefined ? pendingOrderQuantity : item.sales_order_pending,
              purchase_material_received: purchaseQuantity !== undefined ? purchaseQuantity : item.purchase_material_received,
              production: productionQuantity !== undefined ? productionQuantity : item.production,
              sales: dispatchQuantity !== undefined ? dispatchQuantity : item.sales,
              sales_return: returnQuantity !== undefined ? returnQuantity : item.sales_return,
              consumption: consumptionQuantity !== undefined ? consumptionQuantity : item.consumption,
              purchase_return: purchaseReturnQuantity !== undefined ? purchaseReturnQuantity : item.purchase_return,
              current_level: hasCurrentLevelSync
                ? opStock + purchaseQuantity + productionQuantity + adjustmentQuantityForCurrentLevel - dispatchQuantity + returnQuantity - consumptionQuantity - purchaseReturnQuantity
                : item.current_level,
              _hasCurrentLevelSync: hasCurrentLevelSync
            };
          })
          .sort((a, b) => {
            if (a._hasCurrentLevelSync !== b._hasCurrentLevelSync) {
              return a._hasCurrentLevelSync ? -1 : 1;
            }
            return 0;
          })
          .map((item, index) => {
            const cleanedItem = { ...item };
            delete cleanedItem._hasCurrentLevelSync;
            return {
              ...cleanedItem,
              s_no: index + 1
            };
          }),
        count: count || 0
      };
    } catch (e) {
      console.warn(`Supabase getFinishGoodInventory for ${branch} failed:`, e.message);
      return { data: [], count: 0 };
    }
  },

  addInventory: async (branch, item) => {
    const itemForSave = {
      ...item,
      optimum_stock_total: calculateOptimumStockTotal(item.optimum_stock, item.product_rate),
      stock_total: calculateStockTotal(item.actual_level, item.product_rate)
    };

    try {
      const getTableName = (bName) => {
        const b = bName ? bName.toLowerCase().trim() : '';
        if (b === 'purab') return 'purab_stock';
        if (b === 'rkl') return 'rkl_stock';
        if (b === 'pmmpl' || b === 'madhya') return 'madhya_stock';
        return 'purab_stock';
      };

      const tableName = getTableName(branch);
      const { data, error } = await supabase
        .from(tableName)
        .insert([{
          s_no: itemForSave.s_no !== undefined && itemForSave.s_no !== '' ? Number(itemForSave.s_no) : null,
          item_name: itemForSave.item_name || itemForSave.itemName,
          annu_con: itemForSave.annu_con !== undefined && itemForSave.annu_con !== '' ? Number(itemForSave.annu_con) : null,
          d_con: itemForSave.d_con !== undefined && itemForSave.d_con !== '' ? Number(itemForSave.d_con) : null,
          sf: itemForSave.sf !== undefined && itemForSave.sf !== '' ? Number(itemForSave.sf) : null,
          lead_time: itemForSave.lead_time !== undefined && itemForSave.lead_time !== '' ? Number(itemForSave.lead_time) : null,
          max_stock: itemForSave.max_stock !== undefined && itemForSave.max_stock !== '' ? Number(itemForSave.max_stock) : null,
          optimum_stock: itemForSave.optimum_stock !== undefined && itemForSave.optimum_stock !== '' ? Number(itemForSave.optimum_stock) : null,
          actual_level: itemForSave.actual_level !== undefined && itemForSave.actual_level !== '' ? Number(itemForSave.actual_level) : null,
          product_rate: itemForSave.product_rate !== undefined && itemForSave.product_rate !== '' ? Number(itemForSave.product_rate) : null,
          optimum_stock_total: itemForSave.optimum_stock_total !== '' ? Number(itemForSave.optimum_stock_total) : null,
          stock_total: itemForSave.stock_total !== '' ? Number(itemForSave.stock_total) : null,
          unit: itemForSave.unit,
          colour: itemForSave.colour
        }])
        .select();

      if (error) throw error;
      return { success: true, item: data[0] };
    } catch (e) {
      console.warn(`Supabase addInventory for ${branch} failed, trying mock fallback:`, e.message);
      return mockDb.mockAddInventory(branch, itemForSave);
    }
  },

  updateInventory: async (branch, itemId, updatedFields) => {
    const fieldsForSave = {
      ...updatedFields,
      optimum_stock_total: calculateOptimumStockTotal(updatedFields.optimum_stock, updatedFields.product_rate),
      stock_total: calculateStockTotal(updatedFields.actual_level, updatedFields.product_rate)
    };

    try {
      const getTableName = (bName) => {
        const b = bName ? bName.toLowerCase().trim() : '';
        if (b === 'purab') return 'purab_stock';
        if (b === 'rkl') return 'rkl_stock';
        if (b === 'pmmpl' || b === 'madhya') return 'madhya_stock';
        return 'purab_stock';
      };

      const tableName = getTableName(branch);
      const { data, error } = await supabase
        .from(tableName)
        .update({
          s_no: fieldsForSave.s_no !== undefined ? (fieldsForSave.s_no !== '' ? Number(fieldsForSave.s_no) : null) : undefined,
          item_name: fieldsForSave.item_name || fieldsForSave.itemName,
          annu_con: fieldsForSave.annu_con !== undefined && fieldsForSave.annu_con !== '' ? Number(fieldsForSave.annu_con) : undefined,
          d_con: fieldsForSave.d_con !== undefined && fieldsForSave.d_con !== '' ? Number(fieldsForSave.d_con) : undefined,
          sf: fieldsForSave.sf !== undefined && fieldsForSave.sf !== '' ? Number(fieldsForSave.sf) : undefined,
          lead_time: fieldsForSave.lead_time !== undefined && fieldsForSave.lead_time !== '' ? Number(fieldsForSave.lead_time) : undefined,
          max_stock: fieldsForSave.max_stock !== undefined ? (fieldsForSave.max_stock !== null && fieldsForSave.max_stock !== '' ? Number(fieldsForSave.max_stock) : null) : undefined,
          optimum_stock: fieldsForSave.optimum_stock !== undefined ? (fieldsForSave.optimum_stock !== null && fieldsForSave.optimum_stock !== '' ? Number(fieldsForSave.optimum_stock) : null) : undefined,
          actual_level: fieldsForSave.actual_level !== undefined && fieldsForSave.actual_level !== '' ? Number(fieldsForSave.actual_level) : undefined,
          product_rate: fieldsForSave.product_rate !== undefined && fieldsForSave.product_rate !== '' ? Number(fieldsForSave.product_rate) : undefined,
          optimum_stock_total: fieldsForSave.optimum_stock_total !== '' ? Number(fieldsForSave.optimum_stock_total) : null,
          stock_total: fieldsForSave.stock_total !== '' ? Number(fieldsForSave.stock_total) : null,
          unit: fieldsForSave.unit,
          colour: fieldsForSave.colour
        })
        .eq('id', itemId)
        .select();

      if (error) throw error;
      return { success: true, item: data[0] };
    } catch (e) {
      console.warn(`Supabase updateInventory for ${branch} failed, trying mock fallback:`, e.message);
      return mockDb.mockUpdateInventory(branch, itemId, fieldsForSave);
    }
  },

  deleteInventory: async (branch, itemId) => {
    try {
      const getTableName = (bName) => {
        const b = bName ? bName.toLowerCase().trim() : '';
        if (b === 'purab') return 'purab_stock';
        if (b === 'rkl') return 'rkl_stock';
        if (b === 'pmmpl' || b === 'madhya') return 'madhya_stock';
        return 'purab_stock';
      };

      const tableName = getTableName(branch);
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.warn(`Supabase deleteInventory for ${branch} failed, trying mock fallback:`, e.message);
      return mockDb.mockDeleteInventory(branch, itemId);
    }
  },

  // Rates
  getRates: async () => {
    if (isMock) {
      return mockDb.mockGetRates();
    }
    const res = await callApi('getRates');
    return res.data;
  },

  updateRate: async (rateId, newRate, effectiveDate) => {
    if (isMock) {
      return mockDb.mockUpdateRate(rateId, newRate, effectiveDate);
    }
    return callApi('updateRate', { rateId, newRate, effectiveDate });
  },

  // Purchases
  addPurchase: async (purchase) => {
    if (isMock) {
      return mockDb.mockAddPurchase(purchase);
    }
    return callApi('addPurchase', { purchase });
  },

  getPurchases: async () => {
    if (isMock) {
      return mockDb.getDatabase().purchases;
    }
    const res = await callApi('getReports');
    return res.data.purchases;
  },

  // Dispatches
  addDispatch: async (dispatch) => {
    if (isMock) {
      return mockDb.mockAddDispatch(dispatch);
    }
    return callApi('addDispatch', { dispatch });
  },

  getDispatches: async () => {
    if (isMock) {
      return mockDb.getDatabase().dispatches;
    }
    const res = await callApi('getReports');
    return res.data.dispatches;
  },

  // Crushing Logs
  addCrushingLog: async (log) => {
    if (isMock) {
      return mockDb.mockAddCrushingLog(log);
    }
    return callApi('addCrushingLog', { log });
  },

  getCrushingLogs: async () => {
    if (isMock) {
      return mockDb.getDatabase().crushingLogs;
    }
    const res = await callApi('getReports');
    return res.data.crushing;
  },

  // Transfers
  transferMaterial: async (transfer) => {
    if (isMock) {
      return mockDb.mockTransferMaterial(transfer);
    }
    return callApi('branchTransfer', { transfer });
  },

  getTransfers: async () => {
    if (isMock) {
      return mockDb.getDatabase().transfers;
    }
    const res = await callApi('getReports');
    return res.data.transfers;
  },

  approveTransfer: async (transferId, approvedBy) => {
    if (isMock) {
      return mockDb.mockApproveTransfer(transferId, approvedBy);
    }
    return callApi('approveTransfer', { transferId, approvedBy });
  },

  rejectTransfer: async (transferId, approvedBy) => {
    if (isMock) {
      return mockDb.mockRejectTransfer(transferId, approvedBy);
    }
    return callApi('rejectTransfer', { transferId, approvedBy });
  },

  // Reports
  getReports: async () => {
    if (isMock) {
      return mockDb.mockGetReports();
    }
    const res = await callApi('getReports');
    return res.data;
  },

  // Settings
  getSettings: async () => {
    if (isMock) {
      return mockDb.mockGetSettings();
    }
    const res = await callApi('getSettings');
    return res.data;
  },

  updateSettings: async (settings) => {
    if (isMock) {
      return mockDb.mockUpdateSettings(settings);
    }
    return callApi('updateSettings', { settings });
  }
};
