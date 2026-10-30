// External Supabase Multi-Database Sync & Map Builders
import { orderSupabase, productionSupabase, purchaseSupabase, supabase } from './supabaseClient';
import {
  BAG_RATE_ITEM_KEYS,
  RATE_DIVIDE_BY_1000_ITEM_KEYS,
  cleanJsonString,
  getAnnualConsumptionCutoff,
  getLocalDateString,
  getOrderPendingQty,
  isBlankValue,
  isLabTestRecorded,
  isMaterialReturnReason,
  isUnloadApprovalComplete,
  normalizeFirmKey,
  normalizeItemKey,
  normalizeOrderFirmName,
  normalizeProductionFirmName,
  parseProductionDate,
  roundTo,
  toTimeValue
} from './helpers';

export const buildProductionUsageMap = async (selectedDate = '') => {
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

// semi_production "SF-Sr No." is reused across firms, so one "SF-xx + product" key can belong
// to several semi_production rows. Every candidate is kept and one is picked per semi_actual
// entry (the latest created at or before it), instead of the newest row overwriting the rest.
export const addSemiProductionFirmCandidate = (candidateMap, row) => {
  const firm = row['Firm name'];
  if (!row['SF-Sr No.'] || isBlankValue(firm)) return;
  const key = `${row['SF-Sr No.']}::${normalizeItemKey(row['Name Of Semi Finished Good'])}`;
  if (!candidateMap.has(key)) candidateMap.set(key, []);
  candidateMap.get(key).push({ firm, time: toTimeValue(row.Timestamp) ?? -Infinity, id: Number(row.id) || 0 });
};

export const resolveSemiProductionFirm = (candidateMap, productionKey, entryTimestamp) => {
  const candidates = candidateMap.get(productionKey);
  if (!candidates) return undefined;
  if (candidates.length === 1) return candidates[0].firm;

  const entryTime = toTimeValue(entryTimestamp) ?? Infinity;
  const ordered = [...candidates].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
  let match = ordered[0];
  ordered.forEach((candidate) => {
    if (candidate.time <= entryTime) match = candidate;
  });
  return match.firm;
};

export const fetchSemiProductionFirmCandidates = async () => {
  const pageSize = 1000;
  const productionFirmCandidates = new Map();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await productionSupabase
      .from('semi_production')
      .select('id, "SF-Sr No.", "Name Of Semi Finished Good", "Firm name", "Timestamp"')
      .range(from, from + pageSize - 1);

    if (error) throw error;

    (data || []).forEach((row) => addSemiProductionFirmCandidate(productionFirmCandidates, row));

    if (!data || data.length < pageSize) break;
  }

  return productionFirmCandidates;
};

// semi_actual.firm_name (filled when the entry is created) wins; older rows fall back to matching by date.
export const resolveSemiActualFirm = (row, productionFirmCandidates) => {
  if (!isBlankValue(row.firm_name)) return row.firm_name;
  const productionKey = `${row['Semi Finished Production No.']}::${normalizeItemKey(row['Product Name'])}`;
  return resolveSemiProductionFirm(productionFirmCandidates, productionKey, row.Timestamp);
};

export const buildSemiFinishedActualLevelMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const semiAdjustmentMap = {};
  const semiGrainsMap = {};
  const semiFinesMap = {};
  const semiGreenMap = {};
  const semiClinkerMap = {};
  const semiRawConsumptionMap = {};
  const latestSemiComponentsMap = {};

  try {
    const productionFirmCandidates = await fetchSemiProductionFirmCandidates();

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_actual')
        .select('*')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp || row.created_at || row.date);
        if (selectedDate && (!rowDate || rowDate < selectedDate)) return;

        const serialNumber = row['S No.'];
        if (!serialNumber || !String(serialNumber).startsWith('SA-')) return;

        const productName = row['Product Name'];
        const productKey = normalizeItemKey(productName);
        const entryFirm = resolveSemiActualFirm(row, productionFirmCandidates);
        const firmKey = normalizeFirmKey(normalizeProductionFirmName(entryFirm));
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

        // Semi finished output adjustment: Product Name column is produced output (+)
        if (!productKey) return;
        const productText = String(productName || '').toLowerCase();
        const signedQuantity = quantity;
        if (!Number.isFinite(signedQuantity) || signedQuantity <= 0) return;

        const key = `${firmKey}::${productKey}`;
        if (!latestSemiComponentsMap[key]) {
          latestSemiComponentsMap[key] = { components: [], processingCost: 0 };
        }
        if (!latestSemiComponentsMap[key].processingCost && row['Processing Cost']) {
          latestSemiComponentsMap[key].processingCost = Number(row['Processing Cost']);
        }
        if (latestSemiComponentsMap[key].components.length === 0) {
          const components = [];
          for (let i = 1; i <= 5; i++) {
            const rmName = row[`Raw Material Name ${i}`];
            const rmKey = normalizeItemKey(rmName);
            const rmQtyRaw = row[`Quantity Of Raw Material ${i}`];
            const rmQty = Number(rmQtyRaw);
            if (rmKey && rmQtyRaw !== null && rmQtyRaw !== '' && Number.isFinite(rmQty) && rmQty > 0) {
              components.push({ rmKey, qty: rmQty });
            }
          }
          if (components.length > 0) {
            latestSemiComponentsMap[key].components = components;
            // Qty made in this same production run — the divisor for the derived per-unit rate
            latestSemiComponentsMap[key].qtyMade = quantity;
          }
        }

        semiAdjustmentMap[key] = (semiAdjustmentMap[key] || 0) + signedQuantity;
        if (productText.includes('green')) {
          semiGreenMap[key] = (semiGreenMap[key] || 0) + signedQuantity;
        } else if (productText.includes('clinker')) {
          semiClinkerMap[key] = (semiClinkerMap[key] || 0) + signedQuantity;
        } else if (productText.includes('fines')) {
          semiFinesMap[key] = (semiFinesMap[key] || 0) + signedQuantity;
        } else if (productText.includes('grains')) {
          semiGrainsMap[key] = (semiGrainsMap[key] || 0) + signedQuantity;
        } else {
          semiGrainsMap[key] = (semiGrainsMap[key] || 0) + signedQuantity;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase semi finished actual sync failed:', error.message);
  }

  return { semiAdjustmentMap, semiGrainsMap, semiFinesMap, semiGreenMap, semiClinkerMap, semiRawConsumptionMap, latestSemiComponentsMap };
};

// Per-unit costing of items made in the production system: for every firm + product, the
// latest tallied actual_production row (newest "TallyActual", tie-break higher id) gives
// "Costing Amount" / "Quantity Of FG". Used as the rate of produced items (e.g. LC - 60 AR)
// when they are consumed as a component of a semi finished product.
export const buildProductionTallyRateMap = async () => {
  const pageSize = 1000;
  const latestByKey = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select('id, "FIRM Name", "Product Name", "Quantity Of FG", "Costing Amount", "TallyActual"')
        .not('TallyActual', 'is', null)
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const tallyText = String(row.TallyActual ?? '').trim();
        if (!tallyText || tallyText === 'N/A' || tallyText === '-') return;

        const firmKey = normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name']));
        const itemKey = normalizeItemKey(row['Product Name']);
        if (!firmKey || !itemKey) return;

        // Costing Amount is already the rate for 1 MT of the product (not divided by Quantity Of FG).
        const costingAmount = Number(row['Costing Amount']);
        if (!Number.isFinite(costingAmount) || costingAmount <= 0) return;

        const time = toTimeValue(row.TallyActual) ?? -Infinity;
        const id = Number(row.id) || 0;
        const key = `${firmKey}::${itemKey}`;
        const current = latestByKey[key];
        if (!current || time > current.time || (time === current.time && id > current.id)) {
          latestByKey[key] = { time, id, rate: costingAmount };
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase production tally rate sync failed:', error.message);
  }

  const tallyRateMap = {};
  Object.entries(latestByKey).forEach(([key, value]) => {
    tallyRateMap[key] = roundTo(value.rate, 2);
  });
  return tallyRateMap;
};

export const buildCrushingActualLevelMap = async (selectedDate = '') => {
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
          // produced grains/fines semi-good (+).
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

export const buildFinishedGoodProductionMap = async (selectedDate = '') => {
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

export const buildFinishedGoodConsumptionMap = async (selectedDate = '') => {
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

  // Finished goods used as raw material inside a Semi Finished (SA-) entry are consumed too.
  try {
    const productionFirmCandidates = await fetchSemiProductionFirmCandidates();

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('semi_actual')
        .select('*')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (!String(row['S No.'] || '').startsWith('SA-')) return;

        const outputQuantity = row['Qty Of Semi Finished Good'];
        if (outputQuantity === null || outputQuantity === '' || !Number.isFinite(Number(outputQuantity))) return;

        const firmKey = normalizeFirmKey(normalizeProductionFirmName(resolveSemiActualFirm(row, productionFirmCandidates)));
        if (!firmKey) return;

        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp || row.created_at || row.date);

        for (let i = 1; i <= 5; i += 1) {
          const itemKey = normalizeItemKey(row[`Raw Material Name ${i}`]);
          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (!itemKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity) || quantity <= 0) continue;

          const key = `${firmKey}::${itemKey}`;
          if (!consumptionMap[key]) {
            consumptionMap[key] = { before: 0, after: 0, total: 0 };
          }

          consumptionMap[key].total += quantity;
          if (selectedDate && rowDate && rowDate >= selectedDate) {
            consumptionMap[key].after += quantity;
          } else {
            consumptionMap[key].before += quantity;
          }
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase finished good semi finished consumption sync failed:', error.message);
  }

  return consumptionMap;
};

export const buildFinishedGoodPurchaseReturnMap = (selectedDate = '') =>
  shareInFlight(`fg-purchase-return::${selectedDate || ''}`, () => fetchFinishedGoodPurchaseReturnMap(selectedDate)).then(cloneKeyedMap);

const fetchFinishedGoodPurchaseReturnMap = async (selectedDate = '') => {
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

// A dispatch counts towards inventory only once its SALE FORM 3 row is Approved.
// Pending rows are not yet final and Rejected rows never move forward, so both are ignored.
// Returns Map(dispatch_id -> approval timestamp ("Actual")).
export const fetchApprovedSaleForm3Map = async () => {
  const pageSize = 1000;
  const approvedMap = new Map();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await orderSupabase
      .from('SALE FORM 3')
      .select('dispatch_id, "Status", "Actual"')
      .eq('Status', 'Approved')
      .range(from, from + pageSize - 1);

    if (error) throw error;

    (data || []).forEach((row) => {
      const dispatchId = String(row.dispatch_id ?? '').trim();
      if (dispatchId) approvedMap.set(dispatchId, String(row.Actual || '').trim());
    });

    if (!data || data.length < pageSize) break;
  }

  return approvedMap;
};

export const buildFinishedGoodDispatchMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const orderMap = new Map();
  const dispatchMap = {};
  const normalizeJoinId = (value) => String(value ?? '').trim();

  try {
    const approvedSaleForm3 = await fetchApprovedSaleForm3Map();

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
        const approvedAt = approvedSaleForm3.get(normalizeJoinId(row.id));
        if (approvedAt === undefined) return;

        const invoiceActualizedAt = String(approvedAt || row['Bill Date'] || row.Actual4 || '').trim();
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

export const buildFinishedGoodPendingOrderMap = async () => {
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

export const buildFinishedGoodPurchaseMap = (selectedDate = '') =>
  shareInFlight(`fg-purchase::${selectedDate || ''}`, () => fetchFinishedGoodPurchaseMap(selectedDate)).then(cloneKeyedMap);

const fetchFinishedGoodPurchaseMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const purchaseMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Firm Name", "Raw Material Name", "Actual Quantity", "Date Of Receiving", "Date Of Test", "Timestamp", "Actual 2", "Area lifting"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (!isLabTestRecorded(row)) return;

        const firmKey = normalizeFirmKey(row['Firm Name']);
        const productKey = normalizeItemKey(row['Raw Material Name']);
        const rawQuantity = row['Actual Quantity'];
        const quantity = Number(rawQuantity);

        if (!firmKey || !productKey || rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const key = `${firmKey}::${productKey}`;
        if (!purchaseMap[key]) {
          purchaseMap[key] = { before: 0, after: 0, total: 0 };
        }

        const rowDate = getLocalDateString(row['Date Of Test'] || row['Actual 2'] || row['Date Of Receiving'] || row['Timestamp']);
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

// Raw material "Pipeline": receipts pending on the Purchase Lab page (Planned 2 set, Actual 2 empty,
// unload approval cleared, not Direct Supply To Party). Returns "firmKey::itemKey" -> total Actual Quantity.
const fetchRawMaterialPipelineMap = async () => {
  const pageSize = 1000;
  const pipelineMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Firm Name", "Raw Material Name", "Actual Quantity", "Planned 2", "Actual 2", "Unload Approval Required", "Unload Approval Status", "Area lifting"')
        .not('Planned 2', 'is', null)
        // "Actual 2" is a timestamp column (cannot hold '' or whitespace), so IS NULL is exactly the
        // "blank" check the pending logic applies below — letting the server drop the completed rows.
        .is('Actual 2', null)
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (isBlankValue(row['Planned 2']) || !isBlankValue(row['Actual 2'])) return;
        if (String(row['Area lifting'] || '').trim() === 'Direct Supply To Party') return;

        const needsUnloadApproval = String(row['Unload Approval Required'] || '').toLowerCase() === 'yes';
        const unloadStatus = String(row['Unload Approval Status'] || '').toLowerCase();
        if (needsUnloadApproval && unloadStatus !== 'approved' && unloadStatus !== 'completed') return;

        const firmKey = normalizeFirmKey(row['Firm Name']);
        const itemKey = normalizeItemKey(row['Raw Material Name']);
        const rawQuantity = row['Actual Quantity'];
        const quantity = Number(rawQuantity);
        if (!firmKey || !itemKey || isBlankValue(rawQuantity) || !Number.isFinite(quantity)) return;

        // Same unit conversion as the purchase quantity (Light Diesel Oil: MT -> Ltr).
        const convertedQuantity = RATE_DIVIDE_BY_1000_ITEM_KEYS.has(itemKey) ? quantity * 1000 : quantity;
        const key = `${firmKey}::${itemKey}`;
        pipelineMap[key] = (pipelineMap[key] || 0) + convertedQuantity;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase raw material pipeline sync failed:', error.message);
  }

  return pipelineMap;
};

export const buildRawMaterialPipelineMap = () =>
  shareInFlight('raw-material-pipeline', fetchRawMaterialPipelineMap).then((map) => ({ ...map }));

export const buildFinishedGoodReturnMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const ordersByDoNumber = {};
  const returnMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('"DO-Delivery Order No.", "Firm Name", "Product Name", "Party Names"')
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const doNumber = row['DO-Delivery Order No.'];
        if (!doNumber) return;
        if (!ordersByDoNumber[doNumber]) ordersByDoNumber[doNumber] = [];
        ordersByDoNumber[doNumber].push({
          firm: row['Firm Name'],
          productKey: normalizeItemKey(row['Product Name']),
          partyKey: normalizeItemKey(row['Party Names'])
        });
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('Material Return')
        .select('id, "D.O Number", "Party Name", "Product Name", "Qty Of Return Material", "Qty", "Return Dispatched At", "Actual5", "Debit Note Issued At", "Reason Of Material Return"')
        .eq('Reason Of Material Return', 'Material Return')
        .not('Actual5', 'is', null)
        .not('Debit Note Issued At', 'is', null)
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        if (!isMaterialReturnReason(row['Reason Of Material Return'])) return;
        const returnDispatchedAt = row['Return Dispatched At'] || '';
        if (!returnDispatchedAt || String(returnDispatchedAt).trim() === '') return;

        const productKey = normalizeItemKey(row['Product Name']);
        const partyKey = normalizeItemKey(row['Party Name']);
        const candidates = ordersByDoNumber[row['D.O Number']] || [];
        // Same DO number can be reused across firms, so disambiguate by product + party before falling back.
        const matchedOrder =
          candidates.find((c) => c.productKey === productKey && c.partyKey === partyKey) ||
          candidates.find((c) => c.productKey === productKey) ||
          (candidates.length === 1 ? candidates[0] : null);
        const firmKey = normalizeFirmKey(normalizeOrderFirmName(matchedOrder?.firm));
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

export const buildFinishedGoodAdjustmentMap = async (selectedDate = '') => {
  const pageSize = 1000;
  const adjustmentMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, qty, status, material_type, entry_date')
        .eq('material_type', 'finish_good')
        .is('deleted_at', null)
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

// Rates entered manually in Stock Adjustment's "Product Rate" tab (stock_adjustment.rate).
// Used only as a fallback when the purchase system (LIFT-ACCOUNTS) has no rate for that item.
export const buildProductTabRateMap = async () => {
  const pageSize = 1000;
  const rateMap = {};

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, rate')
        .eq('material_type', 'raw_material')
        .not('rate', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(row.firm_name);
        const itemKey = normalizeItemKey(row.item_name);
        const rate = Number(row.rate);
        if (!firmKey || !itemKey || !Number.isFinite(rate)) return;

        const key = `${firmKey}::${itemKey}`;
        // Rows are ordered newest-first, so the first rate seen per key is the latest one.
        if (rateMap[key] === undefined) {
          rateMap[key] = rate;
        }
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (error) {
    console.warn('Supabase product tab rate sync failed:', error.message);
  }

  return rateMap;
};

// In-flight request sharing: identical concurrent builders (e.g. the paginated table fetch and the
// grand-totals fetch on the same screen load) share ONE Supabase scan instead of each downloading
// the same LIFT-ACCOUNTS history. The entry is removed as soon as the promise settles, so this is
// deliberately NOT a TTL/long-lived cache: any request started after the first one finishes
// queries Supabase again, and data never goes stale. A rejected promise is not retained either.
const inFlightRequests = new Map();

export const shareInFlight = (key, producer) => {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(producer)
    .finally(() => {
      if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
};

// Same idea for a single "key -> value" map: one level of copy so callers never share mutable state.
const cloneKeyedMap = (map) => {
  const copy = {};
  Object.keys(map).forEach((key) => {
    const value = map[key];
    copy[key] = Array.isArray(value) ? value.slice() : (value && typeof value === 'object' ? { ...value } : value);
  });
  return copy;
};

// Each caller gets its own copy of every top-level map so one caller can never mutate another's result.
const cloneMapBundle = (bundle) => {
  const copy = {};
  Object.keys(bundle).forEach((name) => {
    copy[name] = { ...bundle[name] };
  });
  return copy;
};

// LIFT-ACCOUNTS is summarised inside the database (database/lift_inventory_summary.sql) instead of being
// downloaded row by row. Returns only the rows that matter for the rate maps, plus the per-product
// quantity lists (already filtered / ordered by the database) that are added up below.
const fetchLiftSummary = async (selectedDate) => {
  const { data, error } = await purchaseSupabase.rpc('lift_inventory_summary', {
    p_start_date: selectedDate || '',
    p_bag_item_keys: [...BAG_RATE_ITEM_KEYS]
  });
  if (error) throw error;
  return data;
};

const fetchLiftDataMaps = async (selectedDate = '') => {
  try {
    const summary = await fetchLiftSummary(selectedDate);
    const liftRows = summary.rate_rows || [];
    const summaryQuantities = summary.quantities || [];

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
      const rowDate = getLocalDateString(row['Date Of Test'] || row['Actual 2'] || row['Date Of Receiving']);

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

        // Per MT Transportation Rate must come from this SAME record (not some other
        // row picked independently), so it always matches the row the base rate came from.
        // Applicable when Type Of Transporting Rate is "Per MT" or "Fixed":
        // perMTRate = Transporter Rate / Lifting Qty (rounded to 2 decimals).
        const rateType = String(row['Type Of Transporting Rate'] || '').trim().toLowerCase();
        const transporterRate = Number(row['Transporter Rate']);
        const liftingQty = Number(row['Lifting Qty']);
        transportingRatesMap[key] = (
          (rateType === 'per mt' || rateType === 'fixed') &&
          Number.isFinite(transporterRate) &&
          Number.isFinite(liftingQty) &&
          liftingQty !== 0
        ) ? roundTo(transporterRate / liftingQty, 2) : 0;
      }
    });

    // Same per-row conversion and the same left-to-right additions (in the same row order) as the
    // original row scan, so the totals are bit-for-bit the same.
    summaryQuantities.forEach(({ key, item_key: itemKey, quantities }) => {
      quantities.forEach((rawActualQuantity) => {
        const actualQuantity = Number(rawActualQuantity);
        if (!Number.isFinite(actualQuantity)) return;
        const convertedActualQuantity = RATE_DIVIDE_BY_1000_ITEM_KEYS.has(itemKey)
          ? actualQuantity * 1000
          : actualQuantity;
        actualQuantityMap[key] = (actualQuantityMap[key] || 0) + convertedActualQuantity;
        purchaseQuantityMap[key] = (purchaseQuantityMap[key] || 0) + convertedActualQuantity;
      });
    });

    const [
      { usageMap: productionUsageMap, annualUsageMap: annualProductionUsageMap },
      { semiAdjustmentMap, semiGrainsMap, semiFinesMap, semiGreenMap, semiClinkerMap, semiRawConsumptionMap, latestSemiComponentsMap },
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
      semiGreenMap,
      semiClinkerMap,
      semiRawConsumptionMap,
      latestSemiComponentsMap,
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
      semiGreenMap: {},
      semiClinkerMap: {},
      semiRawConsumptionMap: {},
      crushingGrainsMap: {},
      crushingFinesMap: {},
      crushingLumpsMap: {},
      crushingOutputsMap: {}
    };
  }
};

export const buildLiftDataMaps = (selectedDate = '') =>
  shareInFlight(`lift-data-maps::${selectedDate || ''}`, () => fetchLiftDataMaps(selectedDate)).then(cloneMapBundle);
