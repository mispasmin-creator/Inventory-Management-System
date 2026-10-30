// Inventory Service Layer
import {
  orderSupabase,
  productionSupabase,
  purchaseSupabase,
  salesRawSupabase,
  supabase
} from './supabaseClient';
import {
  RATE_DIVIDE_BY_1000_ITEM_KEYS,
  calculateOptimumStockTotal,
  calculateStockTotal,
  getLocalDateString,
  isLabTestRecorded,
  hasActualLevel,
  isNoRateItem,
  mergeDuplicateInventoryRows,
  normalizeFirmKey,
  normalizeItemKey,
  normalizeOrderFirmName,
  normalizeProductionFirmName,
  numberOrZero,
  roundTo
} from './helpers';
import {
  buildFinishedGoodAdjustmentMap,
  buildFinishedGoodConsumptionMap,
  buildFinishedGoodDispatchMap,
  buildFinishedGoodPendingOrderMap,
  buildFinishedGoodProductionMap,
  buildFinishedGoodPurchaseMap,
  buildFinishedGoodPurchaseReturnMap,
  buildFinishedGoodReturnMap,
  buildLiftDataMaps,
  buildProductTabRateMap,
  buildProductionTallyRateMap,
  fetchApprovedSaleForm3Map,
  fetchSemiProductionFirmCandidates,
  resolveSemiActualFirm
} from './externalSyncService';

export const inventoryService = {
  // Raw Material Inventory
  getInventory: async (branch, selectedDate = '', page = 1, pageSize = 100, searchQuery = '', firmFilter = '') => {
    try {
      const normalizedBranch = branch?.toLowerCase().trim();
      let query = supabase
        .from('inventory_master')
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

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
          semiGreenMap,
          semiClinkerMap,
          semiRawConsumptionMap,
          latestSemiComponentsMap,
          crushingGrainsMap,
          crushingFinesMap,
          crushingLumpsMap,
          crushingOutputsMap
        },
        productTabRateMap,
        productionTallyRateMap,
        salesRawOrdersResult,
        purchaseReturnMap
      ] = await Promise.all([
        query,
        buildLiftDataMaps(selectedDate),
        buildProductTabRateMap(),
        buildProductionTallyRateMap(),
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
          }),
        buildFinishedGoodPurchaseReturnMap(selectedDate)
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

      // Compute derived product rates for semi-finished items (e.g. P-14 Green, P14 Clinker, etc.)
      const derivedSemiRatesMap = {};
      const semiRatesWithProcessing = new Set();
      if (latestSemiComponentsMap && Object.keys(latestSemiComponentsMap).length > 0) {
        for (let pass = 0; pass < 3; pass++) {
          let changed = false;
          Object.entries(latestSemiComponentsMap).forEach(([key, data]) => {
            const components = data?.components || (Array.isArray(data) ? data : []);
            const processingCost = data?.processingCost || 0;
            if (components.length === 0 && processingCost === 0) return;
            const firmKey = key.split('::')[0];

            let totalCost = 0;
            let solidQty = 0;
            let totalQty = 0;
            let hasValidComponentRate = false;
            let usedTallyRate = false;

            components.forEach((comp) => {
              const rmKey = comp.rmKey;
              const rmFullKey = `${firmKey}::${rmKey}`;

              let rmRate = ratesMap[rmFullKey] !== undefined
                ? ratesMap[rmFullKey]
                : (poRatesMap[rmFullKey] !== undefined
                  ? poRatesMap[rmFullKey]
                  : (productTabRateMap[rmFullKey] !== undefined
                    ? productTabRateMap[rmFullKey]
                    : (derivedSemiRatesMap[rmFullKey] !== undefined ? derivedSemiRatesMap[rmFullKey] : 0)));

              // RKL only: component made in the production system (e.g. LC - 60 AR) with no purchase
              // rate uses its latest Tally costing, which is a per-MT rate (Costing Amount / Quantity Of FG).
              if (firmKey === 'rkl' && !(Number(rmRate) > 0) && productionTallyRateMap[rmFullKey] > 0) {
                // Processing cost is added to the material price first, then multiplied by qty used.
                rmRate = productionTallyRateMap[rmFullKey] + processingCost;
                usedTallyRate = true;
              }

              // If component is a semi-finished product, include its processing cost in its rate for cost multiplication
              if (derivedSemiRatesMap[rmFullKey] !== undefined && !semiRatesWithProcessing.has(rmFullKey)) {
                const compProcCost = latestSemiComponentsMap[rmFullKey]?.processingCost || 0;
                rmRate = Number(rmRate || 0) + compProcCost;
              }

              const numericRate = Number(rmRate || 0);
              if (numericRate > 0) {
                hasValidComponentRate = true;
              }
              totalCost += comp.qty * numericRate;

              const isFuel = rmKey.includes('diesel') || rmKey.includes('fuel') || rmKey.includes('oil');
              if (!isFuel) {
                solidQty += comp.qty;
              }
              totalQty += comp.qty;
            });

            // Tally-priced components (RKL): rate = ((Tally rate per MT + processing cost) x MT used)
            // / qty actually made in the latest semi finished entry. The processing cost is already
            // inside this rate, so the Product Rate column must not add it again.
            const qtyMade = Number(data?.qtyMade) || 0;
            const useTallyFormula = usedTallyRate && qtyMade > 0;
            const divisorQty = useTallyFormula ? qtyMade : (solidQty > 0 ? solidQty : totalQty);
            if (hasValidComponentRate && divisorQty > 0) {
              const calcRate = roundTo(totalCost / divisorQty, 2);
              if (useTallyFormula) semiRatesWithProcessing.add(key);
              if (derivedSemiRatesMap[key] !== calcRate) {
                derivedSemiRatesMap[key] = calcRate;
                changed = true;
              }
            }
          });
          if (!changed) break;
        }
      }

      const inventoryRows = mergeDuplicateInventoryRows((data || [])
        .map((item, index) => {
          const key = `${normalizeFirmKey(item.firm_name)}::${normalizeItemKey(item.item_name)}`;
          const derivedSemiRate = derivedSemiRatesMap[key];
          const isFinesItem = normalizeItemKey(item.item_name).endsWith('fines');

          // "<Base> Fines" items are normally produced (from grains, or lumps directly), not
          // purchased — so prefer the production-derived rate (computed above from the item's
          // actual latest production run) over any purchase rate.
          const useProductionRateFirst = isFinesItem && derivedSemiRate !== undefined;

          // True only when the rate genuinely comes from a purchase/manual source (LIFT-ACCOUNTS
          // PO or the Product Rate tab), not from the production-component derivation below.
          const isPurchaseSourcedRate = useProductionRateFirst || isNoRateItem(item.item_name)
            ? false
            : (poRatesMap[key] !== undefined || productTabRateMap[key] !== undefined);

          // In-house items (e.g. Insulation Pad Green) never show a price.
          const noRate = isNoRateItem(item.item_name);
          const baseRate = noRate
            ? ''
            : useProductionRateFirst
            ? derivedSemiRate
            : (poRatesMap[key] !== undefined
              ? poRatesMap[key]
              : (productTabRateMap[key] !== undefined
                ? productTabRateMap[key]
                : (derivedSemiRate !== undefined
                  ? derivedSemiRate
                  : (item.product_rate ?? ''))));
          const transRate = noRate ? 0 : (transportingRatesMap[key] || 0);
          let rate = baseRate;
          if (rate !== '') {
            rate = Number(rate) + transRate;
          } else if (transRate > 0) {
            rate = transRate;
          }
          const opStock = numberOrZero(item.op_stock);

          // Purchase Return is summed across ALL records matching this firm + item
          const purchaseReturnQuantity = purchaseReturnMap[key]?.total || 0;
          // Purchase Return converted to Ltr (x1000) for MT-purchased items (RATE_DIVIDE_BY_1000_ITEM_KEYS)
          const purchaseReturnDisplayQuantity = RATE_DIVIDE_BY_1000_ITEM_KEYS.has(normalizeItemKey(item.item_name))
            ? purchaseReturnQuantity * 1000
            : purchaseReturnQuantity;

          let actualLevel = actualQuantityMap[key] ?? item.actual_level ?? '';
          const salesRawQty = salesRawQtyMap[key] || 0;
          if (actualLevel !== '' || salesRawQty !== 0 || opStock !== 0 || purchaseReturnDisplayQuantity !== 0) {
            actualLevel = opStock + Number(actualLevel || 0) - salesRawQty - purchaseReturnDisplayQuantity;
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
            purchase_return: purchaseReturnDisplayQuantity,
            production_consumption: -(productionUsageMap[key] || 0) - (semiRawConsumptionMap[key] || 0) + (semiGrainsMap[key] || 0) + (semiFinesMap[key] || 0) + (semiGreenMap[key] || 0) + (semiClinkerMap[key] || 0) + (crushingGrainsMap[key] || 0) + (crushingLumpsMap[key] || 0) + (crushingOutputsMap[key] || 0),
            semi_grains: semiGrainsMap[key] || 0,
            semi_fines: semiFinesMap[key] || 0,
            semi_green: semiGreenMap[key] || 0,
            semi_clinker: semiClinkerMap[key] || 0,
            crushing_grains: crushingGrainsMap[key] || 0,
            crushing_fines: crushingFinesMap[key] || 0,
            crushing_lumps: crushingLumpsMap[key] || 0,
            crushing_outputs: crushingOutputsMap[key] || 0,
            raw_material_sales: -salesRawQty,
            actual_level: actualLevel,
            product_rate: rate,
            semi_cost_included: semiRatesWithProcessing.has(key) && derivedSemiRate !== undefined && baseRate === derivedSemiRate,
            material_rate: baseRate,
            is_purchase_rate: isPurchaseSourcedRate,
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

  // Finish Good Inventory
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
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

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

  // Source records behind a Finished Good row's "Production" figure
  getFinishedGoodProductionBreakdown: async (firmName, productName, selectedDate = '') => {
    const pageSize = 1000;
    const firmKey = normalizeFirmKey(firmName);
    const productKey = normalizeItemKey(productName);
    const entries = [];
    const isCounted = (rowDate) => !selectedDate || (rowDate && rowDate >= selectedDate);

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select('id, "FIRM Name", "Product Name", "Quantity Of FG", "Timestamp", "Date Of Production", "Job Card No."')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        if (normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name'])) !== firmKey) return;
        if (normalizeItemKey(row['Product Name']) !== productKey) return;
        const rawQuantity = row['Quantity Of FG'];
        const quantity = Number(rawQuantity);
        if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
        if (!isCounted(rowDate)) return;
        entries.push({
          source: 'Actual Production',
          reference: row['Job Card No.'] || `#${row.id}`,
          date: rowDate,
          quantity
        });
      });

      if (!data || data.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('crushing_actual')
        .select('id, "Timestamp", "Date Of Production", "Firm Name", "Finished Goods Name 1", "Qty 1", "Finished Goods Name 2", "Qty 2", "Finished Goods Name 3", "Qty 3", "Finished Goods Name 4", "Qty 4"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        if (normalizeFirmKey(normalizeProductionFirmName(row['Firm Name'])) !== firmKey) return;
        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
        if (!isCounted(rowDate)) return;

        for (let i = 1; i <= 4; i++) {
          const fgQtyRaw = row[`Qty ${i}`];
          const fgQty = Number(fgQtyRaw);
          if (normalizeItemKey(row[`Finished Goods Name ${i}`]) !== productKey) continue;
          if (fgQtyRaw === null || fgQtyRaw === '' || !Number.isFinite(fgQty)) continue;
          entries.push({ source: 'Crushing', reference: `#${row.id}`, date: rowDate, quantity: fgQty });
        }
      });

      if (!data || data.length < pageSize) break;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { entries, total: entries.reduce((sum, entry) => sum + entry.quantity, 0) };
  },

  // Source records behind a Finished Good row's "Consumption" figure
  // (Actual Production raw materials + Semi Finished entry raw materials)
  getFinishedGoodConsumptionBreakdown: async (firmName, productName, selectedDate = '') => {
    const pageSize = 1000;
    const firmKey = normalizeFirmKey(firmName);
    const productKey = normalizeItemKey(productName);
    const entries = [];
    const isCounted = (rowDate) => !selectedDate || (rowDate && rowDate >= selectedDate);

    const rawMaterialColumns = Array.from({ length: 20 }, (_, index) => `"Raw Material Name ${index + 1}", "Quantity Of Raw Material ${index + 1}"`).join(', ');

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await productionSupabase
        .from('actual_production')
        .select(`id, "Timestamp", "Date Of Production", "FIRM Name", "Job Card No.", ${rawMaterialColumns}`)
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        if (normalizeFirmKey(normalizeProductionFirmName(row['FIRM Name'])) !== firmKey) return;
        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp);
        if (!isCounted(rowDate)) return;

        for (let i = 1; i <= 20; i++) {
          if (normalizeItemKey(row[`Raw Material Name ${i}`]) !== productKey) continue;
          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) continue;
          entries.push({
            source: 'Actual Production',
            reference: row['Job Card No.'] || `#${row.id}`,
            date: rowDate,
            quantity
          });
        }
      });

      if (!data || data.length < pageSize) break;
    }

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
        if (normalizeFirmKey(normalizeProductionFirmName(resolveSemiActualFirm(row, productionFirmCandidates))) !== firmKey) return;

        const rowDate = getLocalDateString(row['Date Of Production'] || row.Timestamp || row.created_at || row.date);
        if (!isCounted(rowDate)) return;

        for (let i = 1; i <= 5; i++) {
          if (normalizeItemKey(row[`Raw Material Name ${i}`]) !== productKey) continue;
          const rawQuantity = row[`Quantity Of Raw Material ${i}`];
          const quantity = Number(rawQuantity);
          if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity) || quantity <= 0) continue;
          entries.push({
            source: 'Semi Finished',
            reference: [row['S No.'], row['Product Name']].filter(Boolean).join(' · ') || `#${row.id}`,
            date: rowDate,
            quantity
          });
        }
      });

      if (!data || data.length < pageSize) break;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { entries, total: entries.reduce((sum, entry) => sum + entry.quantity, 0) };
  },

  // Source records behind a Finished Good row's "Sales" figure
  getFinishedGoodSalesBreakdown: async (firmName, productName, selectedDate = '') => {
    const pageSize = 1000;
    const firmKey = normalizeFirmKey(firmName);
    const productKey = normalizeItemKey(productName);
    const orderMap = new Map();
    const entries = [];
    const normalizeJoinId = (value) => String(value ?? '').trim();
    const approvedSaleForm3 = await fetchApprovedSaleForm3Map();

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('id, "Firm Name", "Product Name", "DO-Delivery Order No.", "Party Names"')
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
        if (normalizeFirmKey(normalizeOrderFirmName(po['Firm Name'])) !== firmKey) return;
        const dispatchProductName = String(row['Product Name'] || '').trim();
        if (normalizeItemKey(dispatchProductName || po['Product Name']) !== productKey) return;

        const actualTruckQty = Number(row['Actual Truck Qty']);
        const plannedDispatchQty = Number(row['Qty To Be Dispatched']);
        const validActualTruckQty = Number.isFinite(actualTruckQty) && actualTruckQty > 0 ? actualTruckQty : 0;
        const validPlannedDispatchQty = Number.isFinite(plannedDispatchQty) && plannedDispatchQty > 0 ? plannedDispatchQty : 0;
        const truckQty = validActualTruckQty && validPlannedDispatchQty
          ? Math.min(validActualTruckQty, validPlannedDispatchQty)
          : validActualTruckQty || validPlannedDispatchQty;

        const rowDate = getLocalDateString(invoiceActualizedAt);
        if (selectedDate && !(rowDate && rowDate >= selectedDate)) return;

        const doNumber = po['DO-Delivery Order No.'];
        const party = po['Party Names'];
        entries.push({
          source: 'Dispatch',
          reference: [doNumber, party].filter(Boolean).join(' · ') || `#${row.id}`,
          date: rowDate,
          quantity: truckQty
        });
      });

      if (!data || data.length < pageSize) break;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { entries, total: entries.reduce((sum, entry) => sum + entry.quantity, 0) };
  },

  // Source records behind a Finished Good row's "Purchase Material Received" figure
  getFinishedGoodPurchaseBreakdown: async (firmName, productName, selectedDate = '') => {
    const pageSize = 1000;
    const firmKey = normalizeFirmKey(firmName);
    const productKey = normalizeItemKey(productName);
    const entries = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('id, "Lift No", "Firm Name", "Raw Material Name", "Actual Quantity", "Date Of Receiving", "Date Of Test", "Timestamp", "Actual 2", "Area lifting"')
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        if (!isLabTestRecorded(row)) return;
        if (normalizeFirmKey(row['Firm Name']) !== firmKey) return;
        if (normalizeItemKey(row['Raw Material Name']) !== productKey) return;
        const rawQuantity = row['Actual Quantity'];
        const quantity = Number(rawQuantity);
        if (rawQuantity === null || rawQuantity === '' || !Number.isFinite(quantity)) return;

        const rowDate = getLocalDateString(row['Date Of Test'] || row['Actual 2'] || row['Date Of Receiving'] || row['Timestamp']);
        if (selectedDate && !(rowDate && rowDate >= selectedDate)) return;
        entries.push({
          source: 'Purchase Receipt',
          reference: row['Lift No'] || `#${row.id}`,
          date: rowDate,
          quantity
        });
      });

      if (!data || data.length < pageSize) break;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { entries, total: entries.reduce((sum, entry) => sum + entry.quantity, 0) };
  },

  addInventory: async (branch, item) => {
    try {
      const getFirmName = (bName) => {
        const b = bName ? bName.toLowerCase().trim() : '';
        if (b === 'purab') return 'Purab';
        if (b === 'rkl') return 'Rkl';
        if (b === 'pmmpl' || b === 'madhya') return 'Pmmpl';
        return bName || 'Purab';
      };

      const firmName = getFirmName(branch);
      const itemName = item.item_name || item.itemName;
      const { data, error } = await supabase
        .from('inventory_master')
        .insert([{
          firm_name: firmName,
          item_name: itemName,
          unit: item.unit || 'MT',
          annu_con: item.annu_con !== undefined && item.annu_con !== '' ? Number(item.annu_con) : 0,
          safety_factor: item.sf !== undefined && item.sf !== '' ? Number(item.sf) : 1,
          lead_time_days: item.lead_time !== undefined && item.lead_time !== '' ? Number(item.lead_time) : 0,
          max_qty: item.max_stock !== undefined && item.max_stock !== '' ? Number(item.max_stock) : (item.max_qty !== undefined ? Number(item.max_qty) : 0),
          optimum_qty: item.optimum_stock !== undefined && item.optimum_stock !== '' ? Number(item.optimum_stock) : (item.optimum_qty !== undefined ? Number(item.optimum_qty) : 0),
          op_stock: item.op_stock !== undefined && item.op_stock !== '' ? Number(item.op_stock) : (item.actual_level !== undefined && item.actual_level !== '' ? Number(item.actual_level) : 0),
          op_stock_date: item.op_stock_date || null
        }])
        .select();

      if (error) throw error;
      return { success: true, item: data[0] };
    } catch (e) {
      console.warn(`Supabase addInventory for ${branch} failed:`, e.message);
      throw e;
    }
  },

  updateInventory: async (branch, itemId, updatedFields) => {
    try {
      const payload = {};
      if (updatedFields.item_name || updatedFields.itemName) {
        payload.item_name = updatedFields.item_name || updatedFields.itemName;
      }
      if (updatedFields.unit !== undefined) payload.unit = updatedFields.unit;
      if (updatedFields.annu_con !== undefined && updatedFields.annu_con !== '') {
        payload.annu_con = Number(updatedFields.annu_con);
      }
      if (updatedFields.sf !== undefined && updatedFields.sf !== '') {
        payload.safety_factor = Number(updatedFields.sf);
      }
      if (updatedFields.lead_time !== undefined && updatedFields.lead_time !== '') {
        payload.lead_time_days = Number(updatedFields.lead_time);
      }
      if (updatedFields.max_stock !== undefined && updatedFields.max_stock !== '') {
        payload.max_qty = Number(updatedFields.max_stock);
      } else if (updatedFields.max_qty !== undefined && updatedFields.max_qty !== '') {
        payload.max_qty = Number(updatedFields.max_qty);
      }
      if (updatedFields.optimum_stock !== undefined && updatedFields.optimum_stock !== '') {
        payload.optimum_qty = Number(updatedFields.optimum_stock);
      } else if (updatedFields.optimum_qty !== undefined && updatedFields.optimum_qty !== '') {
        payload.optimum_qty = Number(updatedFields.optimum_qty);
      }
      if (updatedFields.op_stock !== undefined && updatedFields.op_stock !== '') {
        payload.op_stock = Number(updatedFields.op_stock);
      }

      const { data, error } = await supabase
        .from('inventory_master')
        .update(payload)
        .eq('id', itemId)
        .select();

      if (error) throw error;
      return { success: true, item: data[0] };
    } catch (e) {
      console.warn(`Supabase updateInventory for ${branch} failed:`, e.message);
      throw e;
    }
  },

  deleteInventory: async (branch, itemId) => {
    try {
      const { error } = await supabase
        .from('inventory_master')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', itemId);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.warn(`Supabase deleteInventory for ${branch} failed:`, e.message);
      throw e;
    }
  }
};
