// API Service Layer with Google Apps Script & Mock Fallback
import axios from 'axios';
import * as mockDb from './mockData';
import { productionSupabase, purchaseSupabase, supabase } from './supabaseClient';

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

    const { usageMap: productionUsageMap, annualUsageMap: annualProductionUsageMap } = await buildProductionUsageMap();
    Object.entries(productionUsageMap).forEach(([key, quantity]) => {
      actualQuantityMap[key] = (actualQuantityMap[key] || 0) - quantity;
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
      if (b === 'all') {
        const [rklRes, madhyaRes, purabRes] = await Promise.all([
          supabase.from('finished_goods_rkl').select('*').order('sn', { ascending: true }),
          supabase.from('finished_goods_pmmpl').select('*').order('s_no', { ascending: true }),
          supabase.from('finished_good_purab').select('*').order('s_no', { ascending: true })
        ]);

        if (rklRes.error) throw rklRes.error;
        if (madhyaRes.error) throw madhyaRes.error;
        if (purabRes.error) throw purabRes.error;

        return [
          ...(rklRes.data || []).map(item => ({ ...item, firm_name: 'Rkl' })),
          ...(madhyaRes.data || []).map(item => ({ ...item, firm_name: 'Pmmpl' })),
          ...(purabRes.data || []).map(item => ({ ...item, firm_name: 'Purab' }))
        ];
      }
      // RKL uses 'sn' as sort key; Purab & Pmmpl use 's_no'
      if (b === 'rkl') {
        const { data, error } = await supabase
          .from('finished_goods_rkl')
          .select('*')
          .order('sn', { ascending: true });
        if (error) throw error;
        return (data || []).map(item => ({ ...item, firm_name: 'Rkl' }));
      } else if (b === 'pmmpl' || b === 'madhya') {
        const { data, error } = await supabase
          .from('finished_goods_pmmpl')
          .select('*')
          .order('s_no', { ascending: true });
        if (error) throw error;
        return (data || []).map(item => ({ ...item, firm_name: 'Pmmpl' }));
      } else {
        // purab (default)
        const { data, error } = await supabase
          .from('finished_good_purab')
          .select('*')
          .order('s_no', { ascending: true });
        if (error) throw error;
        return (data || []).map(item => ({ ...item, firm_name: 'Purab' }));
      }
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
