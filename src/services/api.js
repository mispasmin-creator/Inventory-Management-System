// API Service Layer with Google Apps Script & Mock Fallback
import axios from 'axios';
import * as mockDb from './mockData';
import { orderSupabase, productionSupabase, purchaseSupabase, supabase } from './supabaseClient';

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

const buildProductionUsageMap = async () => {
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

        for (let i = 1; i <= 20; i += 1) {
          const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
          if (!itemKey) continue;

          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) continue;

          const key = `${firmKey}::${itemKey}`;
          usageMap[key] = (usageMap[key] || 0) + quantity;
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

const buildSemiFinishedActualLevelMap = async () => {
  const pageSize = 1000;
  const productionFirmMap = new Map();
  const semiAdjustmentMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_production')
        .select('id, "SF-Sr No.", "Firm name"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (row['SF-Sr No.']) {
          productionFirmMap.set(row['SF-Sr No.'], row['Firm name']);
        }
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_actual')
        .select('id, "S No.", "Semi Finished Production No.", "Product Name", "Qty Of Semi Finished Good"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const serialNumber = row['S No.'];
        if (!serialNumber || !String(serialNumber).startsWith('SA-')) return;

        const productName = row['Product Name'];
        const productKey = normalizeItemKey(productName);
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(productionFirmMap.get(row['Semi Finished Production No.'])));
        const rawQuantity = row['Qty Of Semi Finished Good'];
        const quantity = Number(rawQuantity);
        if (!firmKey || !productKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const productText = String(productName || '').toLowerCase();
        const signedQuantity = productText.includes('grains')
          ? quantity
          : productText.includes('fines')
            ? -quantity
            : 0;
        if (signedQuantity === 0) return;

        const key = `${firmKey}::${productKey}`;
        semiAdjustmentMap[key] = (semiAdjustmentMap[key] || 0) + signedQuantity;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase semi finished actual sync failed:', error.message);
  }

  return semiAdjustmentMap;
};

const buildCrushingActualLevelMap = async () => {
  const pageSize = 1000;
  const crushingAdjustmentMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('crushing_actual')
        .select('id, "Firm Name", "Crushing Product Name", "Qty Of Crushing Product"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['Firm Name']));
        const productName = row['Crushing Product Name'];
        const productKey = normalizeItemKey(productName);
        const rawQuantity = row['Qty Of Crushing Product'];
        const quantity = Number(rawQuantity);
        if (!firmKey || !productKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const productText = String(productName || '').toLowerCase();
        const signedQuantity = productText.includes('grains') || productText.includes('fines')
          ? quantity
          : productText.includes('lumps') || productText.includes('fired')
            ? -quantity
            : 0;
        if (signedQuantity === 0) return;

        const key = `${firmKey}::${productKey}`;
        crushingAdjustmentMap[key] = (crushingAdjustmentMap[key] || 0) + signedQuantity;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase crushing actual sync failed:', error.message);
  }

  return crushingAdjustmentMap;
};

const buildFinishedGoodProductionMap = async () => {
  const pageSize = 1000;
  const productionMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select('id, "FIRM Name", "Product Name", "Quantity Of FG", "Timestamp", "Job Card No."')
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
        productionMap[key] = (productionMap[key] || 0) + quantity;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good production sync failed:', error.message);
  }

  return productionMap;
};

const buildFinishedGoodDispatchMap = async () => {
  const pageSize = 1000;
  const orderMap = new Map();
  const dispatchMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('id, "Firm Name", "Product Name"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        orderMap.set(row.id, row);
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('DISPATCH')
        .select('id, po_id, "Product Name", "Qty To Be Dispatched", "Actual Truck Qty", "Fullkitting Actual", "Fullkitting Status", "Actual4"')
        .not('Actual4', 'is', null)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const fullkittingAt = row['Fullkitting Actual'] || '';
        if (!fullkittingAt || String(fullkittingAt).trim() === '') return;

        const po = row.po_id ? orderMap.get(row.po_id) || {} : {};
        const firmKey = normalizeFirmKey(normalizeOrderFirmName(po['Firm Name']));
        const productKey = normalizeItemKey(row['Product Name'] || po['Product Name']);
        if (!firmKey || !productKey) return;

        const truckQty = Number(row['Actual Truck Qty']) || Number(row['Qty To Be Dispatched']) || 0;
        const key = `${firmKey}::${productKey}`;
        dispatchMap[key] = (dispatchMap[key] || 0) + truckQty;
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

const buildFinishedGoodPurchaseMap = async () => {
  const pageSize = 1000;
  const purchaseMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Firm Name", "Raw Material Name", "Actual Quantity"')
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
        purchaseMap[key] = (purchaseMap[key] || 0) + quantity;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good purchase sync failed:', error.message);
  }

  return purchaseMap;
};

const buildFinishedGoodReturnMap = async () => {
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
        returnMap[key] = (returnMap[key] || 0) + returnQty;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good return sync failed:', error.message);
  }

  return returnMap;
};

const buildFinishedGoodAdjustmentMap = async () => {
  const pageSize = 1000;
  const adjustmentMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, qty, status, material_type')
        .eq('material_type', 'finish_good')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(row.firm_name);
        const productKey = normalizeItemKey(row.item_name);
        const qty = Number(row.qty || 0);
        if (!firmKey || !productKey || !Number.isFinite(qty)) return;

        const key = `${firmKey}::${productKey}`;
        adjustmentMap[key] = (adjustmentMap[key] || 0) + (row.status === 'Factory -' ? -qty : qty);
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good adjustment sync failed:', error.message);
  }

  return adjustmentMap;
};

const buildLiftDataMaps = async () => {
  const pageSize = 1000;
  const liftRows = [];
  const poRows = [];

  try {
    // 1. Fetch from LIFT-ACCOUNTS (for Quantities and Transporting Rates)
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Firm Name", "Raw Material Name", "Actual Quantity", "Transporting Rate"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      liftRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    // 2. Fetch from INDENT-PO (for PO Rates)
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('INDENT-PO')
        .select('id, "Firm Name", "Material", "Rate"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      poRows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }

    const actualQuantityMap = {};
    const transportingRatesMap = {};
    const poRatesMap = {};

    // Process LIFT-ACCOUNTS
    liftRows.forEach((row) => {
      const firmKey = normalizeFirmKey(row['Firm Name']);
      const itemKey = normalizeItemKey(row['Raw Material Name']);
      if (!firmKey || !itemKey) return;

      const key = `${firmKey}::${itemKey}`;

      // Accumulate actual quantities
      const rawActualQuantity = row['Actual Quantity'];
      const actualQuantity = Number(rawActualQuantity);
      if (rawActualQuantity !== null && rawActualQuantity !== '' && Number.isFinite(actualQuantity)) {
        actualQuantityMap[key] = (actualQuantityMap[key] || 0) + actualQuantity;
      }

      // Set the latest transporting rate
      if (transportingRatesMap[key] === undefined) {
        const transportingRate = Number(row['Transporting Rate']);
        if (row['Transporting Rate'] !== null && row['Transporting Rate'] !== '' && Number.isFinite(transportingRate)) {
          transportingRatesMap[key] = transportingRate;
        }
      }
    });

    const [
      { usageMap: productionUsageMap, annualUsageMap: annualProductionUsageMap },
      semiFinishedAdjustmentMap,
      crushingAdjustmentMap
    ] = await Promise.all([
      buildProductionUsageMap(),
      buildSemiFinishedActualLevelMap(),
      buildCrushingActualLevelMap()
    ]);
    Object.entries(productionUsageMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) - quantity;
    });
    Object.entries(semiFinishedAdjustmentMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) + quantity;
    });
    Object.entries(crushingAdjustmentMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) + quantity;
    });

    // Process INDENT-PO
    poRows.forEach((row) => {
      const firmKey = normalizeFirmKey(row['Firm Name']);
      const itemKey = normalizeItemKey(row['Material']);
      if (!firmKey || !itemKey) return;

      const key = `${firmKey}::${itemKey}`;

      // Set the latest PO rate
      if (poRatesMap[key] === undefined) {
        const rate = Number(row['Rate']);
        if (row['Rate'] !== null && row['Rate'] !== '' && Number.isFinite(rate)) {
          poRatesMap[key] = rate;
        }
      }
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

    return { actualQuantityMap, ratesMap, annualProductionUsageMap };
  } catch (error) {
    console.warn('Supabase purchase tables data sync failed:', error.message);
    return { actualQuantityMap: {}, ratesMap: {}, annualProductionUsageMap: {} };
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
  getInventory: async (branch) => {
    try {
      const [{ data, error }, { actualQuantityMap, ratesMap, annualProductionUsageMap }] = await Promise.all([
        supabase
          .from('inventory_master')
          .select('*')
          .order('firm_name', { ascending: true })
          .order('item_name', { ascending: true }),
        buildLiftDataMaps()
      ]);

      if (error) throw error;

      const normalizedBranch = branch?.toLowerCase().trim();
      const inventoryRows = mergeDuplicateInventoryRows((data || [])
        .filter(item => {
          if (!normalizedBranch || normalizedBranch === 'all') return true;
          const firmName = String(item.firm_name || '').toLowerCase();
          if (normalizedBranch === 'pmmpl') return firmName.includes('pmmpl') || firmName.includes('madhya');
          return firmName.includes(normalizedBranch);
        })
        .map((item, index) => {
          const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.item_name)}`;
          const rate = ratesMap[key] !== undefined ? ratesMap[key] : (item.product_rate ?? '');
          const actualLevel = actualQuantityMap[key] ?? item.actual_level ?? '';
          const optimumStock = item.optimum_stock ?? item.optimum_qty ?? '';
          const hasProductionUsage = Object.prototype.hasOwnProperty.call(annualProductionUsageMap, key);
          const annualConsumption = hasProductionUsage
            ? roundTo(annualProductionUsageMap[key], 2)
            : (item.annual_consumption ?? item.annu_con ?? '');
          const dailyConsumption = hasProductionUsage
            ? roundTo(Number(annualConsumption) / DAILY_CONSUMPTION_WORKING_DAYS, 2)
            : (item.daily_consumption ?? item.d_con ?? '');

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
            actual_level: actualLevel,
            product_rate: rate,
            optimum_stock_total: calculatedOptimumTotal,
            stock_total: calculatedStockTotal,
            unit: item.unit ?? '',
            colour: item.colour ?? ''
          };
        }));

      return inventoryRows
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
        });
    } catch (e) {
      console.warn(`Supabase getInventory for ${branch} failed:`, e.message);
      return [];
    }
  },

  // Finish Good Inventory — each branch has its own table & schema
  getFinishGoodInventory: async (branch) => {
    try {
      const b = branch ? branch.toLowerCase().trim() : '';
      const productionMapPromise = buildFinishedGoodProductionMap();
      const dispatchMapPromise = buildFinishedGoodDispatchMap();
      const pendingOrderMapPromise = buildFinishedGoodPendingOrderMap();
      const purchaseMapPromise = buildFinishedGoodPurchaseMap();
      const returnMapPromise = buildFinishedGoodReturnMap();
      const adjustmentMapPromise = buildFinishedGoodAdjustmentMap();
      let query = supabase
        .from('finished_goods_inventory_master')
        .select('*')
        .order('firm_name', { ascending: true })
        .order('product_name', { ascending: true });

      if (b && b !== 'all') {
        query = query.ilike('firm_name', b === 'madhya' ? 'Pmmpl' : branch);
      }

      const { data, error } = await query;
      if (error) throw error;

      const productionMap = await productionMapPromise;
      const dispatchMap = await dispatchMapPromise;
      const pendingOrderMap = await pendingOrderMapPromise;
      const purchaseMap = await purchaseMapPromise;
      const returnMap = await returnMapPromise;
      const adjustmentMap = await adjustmentMapPromise;
      return (data || [])
        .map((item) => {
          const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.product_name)}`;
          const productionQuantity = productionMap[key];
          const dispatchQuantity = dispatchMap[key];
          const pendingOrderQuantity = pendingOrderMap[key];
          const purchaseQuantity = purchaseMap[key];
          const returnQuantity = returnMap[key];
          const adjustmentQuantity = adjustmentMap[key];
          const hasCurrentLevelSync = productionQuantity !== undefined || dispatchQuantity !== undefined || purchaseQuantity !== undefined || returnQuantity !== undefined || adjustmentQuantity !== undefined;

          return {
            ...item,
            stock_adjustment: adjustmentQuantity !== undefined ? adjustmentQuantity : item.stock_adjustment,
            sales_order_pending: pendingOrderQuantity !== undefined ? pendingOrderQuantity : item.sales_order_pending,
            purchase_material_received: purchaseQuantity !== undefined ? purchaseQuantity : item.purchase_material_received,
            production: productionQuantity !== undefined ? productionQuantity : item.production,
            sales: dispatchQuantity !== undefined ? dispatchQuantity : item.sales,
            sales_return: returnQuantity !== undefined ? returnQuantity : item.sales_return,
            current_level: hasCurrentLevelSync
              ? numberOrZero(purchaseQuantity) + numberOrZero(productionQuantity) + numberOrZero(adjustmentQuantity) - numberOrZero(dispatchQuantity) + numberOrZero(returnQuantity)
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
        .map((item) => {
          const cleanedItem = { ...item };
          delete cleanedItem._hasCurrentLevelSync;
          return cleanedItem;
        });
    } catch (e) {
      console.warn(`Supabase getFinishGoodInventory for ${branch} failed:`, e.message);
      return [];
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
