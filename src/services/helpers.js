// Inventory & System Utility Helpers

export const normalizeFirmKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/pmmpl\s*order/g, 'pmmpl')
    .replace(/pmmpl|madhya/g, 'pmmpl')
    .replace(/[^a-z0-9]/g, '');

// Only Material Return rows with this reason count towards inventory.
// Other reasons (Material Shortage, Quality Issue, Rate Difference, Material Reject, Other) are ignored.
export const MATERIAL_RETURN_REASON = 'material return';

export const isMaterialReturnReason = (value) =>
  String(value || '').trim().toLowerCase() === MATERIAL_RETURN_REASON;

export const normalizeItemKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const cleanJsonString = (val) => {
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

export const getLocalDateString = (val) => {
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

export const isBlankValue = (value) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export const toFiniteNumber = (value) => {
  if (isBlankValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const calculateOptimumStockTotal = (optimumStock, productRate) => {
  if (isBlankValue(optimumStock) || isBlankValue(productRate)) return '';

  const optimum = toFiniteNumber(optimumStock);
  const rate = toFiniteNumber(productRate);
  return optimum !== null && rate !== null ? optimum * rate : '';
};

export const calculateStockTotal = (actualLevel, productRate) => {
  if (isBlankValue(actualLevel) || isBlankValue(productRate) || String(actualLevel).trim() === '-') return '';

  const actual = toFiniteNumber(actualLevel);
  const rate = toFiniteNumber(productRate);
  if (actual === null || rate === null || actual < 0) return '';

  return actual * rate;
};

export const roundTo = (value, decimals = 2) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const factor = 10 ** decimals;
  return Math.round((number + Number.EPSILON) * factor) / factor;
};

export const hasFiniteNumber = (value) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

export const numberOrZero = (value) => (hasFiniteNumber(value) ? Number(value) : 0);

export const calculateFinishedGoodCurrentLevel = (item) => {
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

export const ANNUAL_CONSUMPTION_DAYS = 365;
export const DAILY_CONSUMPTION_WORKING_DAYS = 300;

export const getAnnualConsumptionCutoff = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ANNUAL_CONSUMPTION_DAYS);
  return cutoff;
};

export const parseProductionDate = (row) => {
  const rawDate = row['Date Of Production'] || row.Timestamp;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const productionFirmNameMap = {
  puraborder: 'Purab',
  rklorder: 'Rkl',
  pmmplorder: 'Pmmpl'
};

export const normalizeProductionFirmName = (value) => {
  const firmKey = normalizeItemKey(value);
  return productionFirmNameMap[firmKey] || value;
};

export const orderFirmNameMap = {
  puraborder: 'Purab',
  rklorder: 'Rkl',
  pmmplorder: 'Pmmpl'
};

export const normalizeOrderFirmName = (value) => {
  const firmKey = normalizeItemKey(value);
  return orderFirmNameMap[firmKey] || value;
};

export const toTimeValue = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};

// Packaging items whose Product Rate is computed as (Billing Qty * Rate) / Total Bag Qty
// instead of using the plain "Rate" column.
export const BAG_RATE_ITEM_KEYS = new Set([
  'Pasheat-CLC PP Bags 25 Kg',
  'PP Bag (25 kgs)',
  'Pp Bag (50 kgs)',
  'PP BAG B - 25',
  'PP BAG R - 25'
].map(normalizeItemKey));

// Items whose LIFT-ACCOUNTS "Rate" is stored per 1000 units, so the Product Rate is divided by 1000.
export const RATE_DIVIDE_BY_1000_ITEM_KEYS = new Set([
  'Light Diesel Oil'
].map(normalizeItemKey));

// Same "Unload Approval" completion filter used for the packaging bag rate calculation.
export const isUnloadApprovalComplete = (row) => {
  const status = row['Unload Approval Status'];
  const required = row['Unload Approval Required'];
  if (status === 'Rejected' || status === 'Completed') return true;
  if (status === 'Approved' && required !== 'Yes') return true;
  if (status === 'Approved' && required === 'Yes' && Boolean(row['Planned 2'] || row['Actual 2'])) return true;
  return false;
};

// A purchase receipt counts towards inventory only once its lab test is recorded
// (LIFT-ACCOUNTS "Actual 2" is filled, whether the test was Accepted or Rejected).
// "Direct Supply To Party" lifts skip the Lab page, so they never get "Actual 2" and are not gated.
export const isLabTestRecorded = (row) =>
  !isBlankValue(row['Actual 2']) ||
  String(row['Area lifting'] || '').trim().toLowerCase() === 'direct supply to party';

export const getOrderPendingQty = (order) => {
  const totalQty = Number(order.Quantity) || 0;
  const deliveredQty = Number(order.Delivered) || 0;

  if (order['Pending Qty'] !== null && order['Pending Qty'] !== undefined && String(order['Pending Qty']).trim() !== '') {
    return Math.max(0, Number(order['Pending Qty']));
  }

  return Math.max(0, totalQty - deliveredQty);
};

export const hasActualLevel = (item) => {
  const actualLevel = item.actual_level;
  return actualLevel !== null && actualLevel !== undefined && actualLevel !== '' && Number.isFinite(Number(actualLevel));
};

export const hasMeaningfulValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue !== 0;
  return true;
};

export const mergeDuplicateInventoryRows = (rows) => {
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
