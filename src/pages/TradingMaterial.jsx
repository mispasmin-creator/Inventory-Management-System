import { useEffect, useMemo, useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { useForm } from 'react-hook-form';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import Table from '../components/Table';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { supabase, purchaseSupabase, orderSupabase } from '../services/supabaseClient';

const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];

const defaultFormValues = {
  firmName: '',
  productName: '',
  opStock: '',
  stockAdjustment: '',
  purchaseReturn: '',
};

const numberOrZero = (value) => (value === '' || value === null || value === undefined ? 0 : Number(value) || 0);

// Opening Stock Date for Trading Material — mirrors BranchInventory's INVENTORY_START_DATE so
// live-fetched figures (Purchase Received, Purchase Return, Sales, Sales Return) only count
// transactions on/after the date the opening stock was struck, not the full history.
const INVENTORY_START_DATE = '2026-06-23';

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

// --- key normalization, mirrored from src/services/api.js so this page matches Trading
// Material product/firm names against Purchase (LIFT-ACCOUNTS) and Order (DISPATCH /
// Material Return) records the exact same way Raw Material and Finished Good already do. ---
const normalizeFirmKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/pmmpl|madhya/g, 'pmmpl')
    .replace(/[^a-z0-9]/g, '');

const normalizeItemKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const orderFirmNameMap = { puraborder: 'Purab', rklorder: 'Rkl', pmmplorder: 'Pmmpl' };
const normalizeOrderFirmName = (value) => orderFirmNameMap[normalizeItemKey(value)] || value;

// Purchase Received: same source/logic as the Raw Material screen's purchase quantity —
// LIFT-ACCOUNTS "Actual Quantity" for receipts whose quality-check ("Actual 1") is complete.
const fetchPurchaseReceivedMap = async () => {
  const pageSize = 1000;
  const map = {};
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('LIFT-ACCOUNTS')
        .select('"Firm Name", "Raw Material Name", "Actual Quantity", "Actual 1", "Date Of Receiving"')
        .not('Actual 1', 'is', null)
        .not('Actual Quantity', 'is', null)
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        const rowDate = getLocalDateString(row['Date Of Receiving'] || row['Actual 1']);
        if (rowDate && rowDate < INVENTORY_START_DATE) return;

        const firmKey = normalizeFirmKey(row['Firm Name']);
        const itemKey = normalizeItemKey(row['Raw Material Name']);
        const qty = Number(row['Actual Quantity']);
        if (!firmKey || !itemKey || !Number.isFinite(qty)) return;
        const key = `${firmKey}::${itemKey}`;
        map[key] = (map[key] || 0) + qty;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (e) {
    console.warn('Trading Material: failed to fetch purchase received data:', e.message);
  }
  return map;
};

// Purchase Return: same source/logic as the Raw Material & Finished Good screens —
// the shared "Purchase Returns" table, matched by Firm Name + Product Name.
const fetchPurchaseReturnMap = async () => {
  const pageSize = 1000;
  const map = {};
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await purchaseSupabase
        .from('Purchase Returns')
        .select('"ID", "Firm Name", "Product Name", "Return This Time", "Time Stamp"')
        .order('ID', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        const rowDate = getLocalDateString(row['Time Stamp']);
        if (rowDate && rowDate < INVENTORY_START_DATE) return;

        const firmKey = normalizeFirmKey(row['Firm Name']);
        const productKey = normalizeItemKey(row['Product Name']);
        const qty = Number(row['Return This Time']);
        if (!firmKey || !productKey || !Number.isFinite(qty)) return;
        const key = `${firmKey}::${productKey}`;
        map[key] = (map[key] || 0) + qty;
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (e) {
    console.warn('Trading Material: failed to fetch purchase return data:', e.message);
  }
  return map;
};

// Sales / Sales Return: same source/logic as the Finished Good screen — DISPATCH rows with
// a completed invoice for Sales, Material Return rows with a completed debit note for Sales
// Return, both joined back to ORDER RECEIPT for the firm name.
const fetchSalesMaps = async () => {
  const pageSize = 1000;
  const salesMap = {};
  const salesReturnMap = {};
  try {
    const orderMap = new Map();
    const ordersByDoNumber = {};
    for (let from = 0; ; from += pageSize) {
      const { data: orderRows, error: orderError } = await orderSupabase
        .from('ORDER RECEIPT')
        .select('id, "Firm Name", "Product Name", "DO-Delivery Order No.", "Party Names"')
        .range(from, from + pageSize - 1);
      if (orderError) throw orderError;

      (orderRows || []).forEach((row) => {
        const orderId = String(row.id ?? '').trim();
        if (orderId) orderMap.set(orderId, row);
        const doNumber = row['DO-Delivery Order No.'];
        if (doNumber) {
          if (!ordersByDoNumber[doNumber]) ordersByDoNumber[doNumber] = [];
          ordersByDoNumber[doNumber].push({
            firm: row['Firm Name'],
            productKey: normalizeItemKey(row['Product Name']),
            partyKey: normalizeItemKey(row['Party Names'])
          });
        }
      });

      if (!orderRows || orderRows.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data: dispatchRows, error: dispatchError } = await orderSupabase
        .from('DISPATCH')
        .select('id, po_id, "Product Name", "Qty To Be Dispatched", "Actual Truck Qty", "Planned4", "Actual4", "Bill Date"')
        .not('Planned4', 'is', null)
        .not('Actual4', 'is', null)
        .range(from, from + pageSize - 1);
      if (dispatchError) throw dispatchError;

      (dispatchRows || []).forEach((row) => {
        const invoiceActualizedAt = String(row['Bill Date'] || row['Actual4'] || '').trim();
        if (!invoiceActualizedAt) return;
        const rowDate = getLocalDateString(invoiceActualizedAt);
        if (rowDate && rowDate < INVENTORY_START_DATE) return;

        const po = orderMap.get(String(row.po_id ?? '').trim()) || {};
        const firmKey = normalizeFirmKey(normalizeOrderFirmName(po['Firm Name']));
        const productKey = normalizeItemKey(row['Product Name'] || po['Product Name']);
        if (!firmKey || !productKey) return;

        const actualTruckQty = Number(row['Actual Truck Qty']);
        const plannedDispatchQty = Number(row['Qty To Be Dispatched']);
        const validActual = Number.isFinite(actualTruckQty) && actualTruckQty > 0 ? actualTruckQty : 0;
        const validPlanned = Number.isFinite(plannedDispatchQty) && plannedDispatchQty > 0 ? plannedDispatchQty : 0;
        const truckQty = validActual && validPlanned ? Math.min(validActual, validPlanned) : (validActual || validPlanned);

        const key = `${firmKey}::${productKey}`;
        salesMap[key] = (salesMap[key] || 0) + truckQty;
      });

      if (!dispatchRows || dispatchRows.length < pageSize) break;
    }

    for (let from = 0; ; from += pageSize) {
      const { data: returnRows, error: returnError } = await orderSupabase
        .from('Material Return')
        .select('id, "D.O Number", "Party Name", "Product Name", "Qty Of Return Material", "Qty", "Return Dispatched At", "Actual5", "Debit Note Issued At"')
        .not('Actual5', 'is', null)
        .not('Debit Note Issued At', 'is', null)
        .range(from, from + pageSize - 1);
      if (returnError) throw returnError;

      (returnRows || []).forEach((row) => {
        const returnDispatchedAt = row['Return Dispatched At'] || '';
        if (!returnDispatchedAt || String(returnDispatchedAt).trim() === '') return;
        const rowDate = getLocalDateString(returnDispatchedAt);
        if (rowDate && rowDate < INVENTORY_START_DATE) return;

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

        const qty = Number(row['Qty Of Return Material']) || Number(row['Qty']) || 0;
        const key = `${firmKey}::${productKey}`;
        salesReturnMap[key] = (salesReturnMap[key] || 0) + qty;
      });

      if (!returnRows || returnRows.length < pageSize) break;
    }
  } catch (e) {
    console.warn('Trading Material: failed to fetch sales/sales return data:', e.message);
  }
  return { salesMap, salesReturnMap };
};

const fetchStockAdjustmentMap = async () => {
  const pageSize = 1000;
  const map = {};
  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, qty, status')
        .eq('material_type', 'trading_material')
        .is('deleted_at', null)
        .range(from, from + pageSize - 1);
      if (error) throw error;

      (data || []).forEach((row) => {
        const firmKey = normalizeFirmKey(row.firm_name);
        const itemKey = normalizeItemKey(row.item_name);
        const qty = Number(row.qty);
        if (!firmKey || !itemKey || !Number.isFinite(qty)) return;
        const key = `${firmKey}::${itemKey}`;
        map[key] = (map[key] || 0) + (row.status === 'Factory -' ? -qty : qty);
      });

      if (!data || data.length < pageSize) break;
    }
  } catch (e) {
    console.warn('Trading Material: failed to fetch stock adjustments:', e.message);
  }
  return map;
};

const TradingMaterial = () => {
  const { showSuccess, showError } = useToast();
  const { user, canAccessBranch } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [purchaseReceivedMap, setPurchaseReceivedMap] = useState({});
  const [purchaseReturnMap, setPurchaseReturnMap] = useState({});
  const [salesMap, setSalesMap] = useState({});
  const [salesReturnMap, setSalesReturnMap] = useState({});
  const [stockAdjustmentMap, setStockAdjustmentMap] = useState({});

  const accessibleBranchOptions = useMemo(() => {
    return branchOptions.filter(branch => canAccessBranch(branch, 'trading_material'));
  }, [canAccessBranch]);

  const hasAccess = user?.role === 'Admin' || accessibleBranchOptions.length > 0;
  const isEditable = accessibleBranchOptions.length > 0 && user?.role !== 'Viewer';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ defaultValues: defaultFormValues });

  const fetchRows = async () => {
    setLoading(true);
    try {
      const [{ data, error }, purchaseMap, purchaseReturnMapResult, salesMaps, adjustmentsMap] = await Promise.all([
        supabase
          .from('trading_material_master')
          .select('*')
          .is('deleted_at', null)
          .order('firm_name', { ascending: true })
          .order('product_name', { ascending: true }),
        fetchPurchaseReceivedMap(),
        fetchPurchaseReturnMap(),
        fetchSalesMaps(),
        fetchStockAdjustmentMap(),
      ]);

      if (error) throw error;

      setPurchaseReceivedMap(purchaseMap);
      setPurchaseReturnMap(purchaseReturnMapResult);
      setSalesMap(salesMaps.salesMap);
      setSalesReturnMap(salesMaps.salesReturnMap);
      setStockAdjustmentMap(adjustmentsMap);
      setRows(data || []);
    } catch (e) {
      showError(e.message || 'Failed to load trading material.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddForm = () => {
    reset(defaultFormValues);
    setFormOpen(true);
  };

  const onSubmit = async (data) => {
    try {
      const key = `${normalizeFirmKey(data.firmName)}::${normalizeItemKey(data.productName)}`;
      const opStock = numberOrZero(data.opStock);
      const stockAdjustment = numberOrZero(data.stockAdjustment);
      const purchaseReturn = numberOrZero(data.purchaseReturn);
      const purchaseReceived = purchaseReceivedMap[key] || 0;
      const sales = salesMap[key] || 0;
      const salesReturn = salesReturnMap[key] || 0;

      const payload = {
        firm_name: data.firmName,
        product_name: data.productName,
        op_stock: opStock,
        op_stock_date: new Date().toISOString().split('T')[0],
        stock_adjustment: stockAdjustment,
      };

      const { error } = await supabase.from('trading_material_master').insert([payload]);
      if (error) throw error;
      showSuccess('Trading material added successfully.');

      setFormOpen(false);
      reset(defaultFormValues);
      await fetchRows();
    } catch (e) {
      showError(e.message || 'Failed to save trading material.');
    }
  };

  const visibleRows = useMemo(() => {
    if (user?.role === 'Admin') return rows;
    return rows.filter(row => canAccessBranch(row.firm_name, 'trading_material'));
  }, [rows, user, canAccessBranch]);

  const tableRows = visibleRows.map((row, index) => {
    const key = `${normalizeFirmKey(row.firm_name)}::${normalizeItemKey(row.product_name)}`;
    const opStock = Number(row.op_stock || 0);
    const dbStockAdjustment = Number(row.stock_adjustment || 0);
    const dynamicStockAdjustment = stockAdjustmentMap[key] || 0;
    const stockAdjustment = dbStockAdjustment + dynamicStockAdjustment;
    // Purchase Return is fetched live from the same shared "Purchase Returns" table Raw
    // Material and Finished Good use; fall back to the manually-entered DB value for
    // firm/product combinations that table has no matching rows for yet.
    const purchaseReturn = purchaseReturnMap[key] !== undefined ? purchaseReturnMap[key] : Number(row.purchase_return || 0);
    const purchaseReceived = purchaseReceivedMap[key] || 0;
    const sales = salesMap[key] || 0;
    const salesReturn = salesReturnMap[key] || 0;

    return {
      ...row,
      s_no: index + 1,
      stock_adjustment: stockAdjustment,
      purchase_material_received: purchaseReceived,
      purchase_return: purchaseReturn,
      sales,
      sales_return: salesReturn,
      current_level: opStock + stockAdjustment + purchaseReceived - purchaseReturn - sales + salesReturn,
    };
  });

  const columns = [
    { header: 'S.No.', accessor: 's_no', sortable: false },
    { header: 'Firm Name', accessor: 'firm_name' },
    { header: 'Product Name', accessor: 'product_name' },
    { header: 'Op. Stock', accessor: 'op_stock', render: (row) => Number(row.op_stock || 0).toLocaleString() },
    { header: 'Stock Adjustment', accessor: 'stock_adjustment', render: (row) => Number(row.stock_adjustment || 0).toLocaleString() },
    { header: 'Purchase Received', accessor: 'purchase_material_received', render: (row) => Number(row.purchase_material_received || 0).toLocaleString() },
    { header: 'Purchase Return', accessor: 'purchase_return', render: (row) => Number(row.purchase_return || 0).toLocaleString() },
    { header: 'Sales', accessor: 'sales', render: (row) => Number(row.sales || 0).toLocaleString() },
    { header: 'Sales Return', accessor: 'sales_return', render: (row) => Number(row.sales_return || 0).toLocaleString() },
    {
      header: 'Current Level',
      accessor: 'current_level',
      cellClassName: () => 'font-bold text-(--brand-green-dark)',
      render: (row) => Number(row.current_level || 0).toLocaleString(),
    },
  ];

  if (!loading && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
          <Repeat className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-(--ink)">Access Restricted</h3>
        <p className="text-xs text-(--ink-muted) max-w-md">
          You do not have access to view Trading Material for any branch. Please contact your system administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Repeat className="w-5 h-5 text-(--brand-green)" />
          <div>
            <h2 className="text-base font-bold text-(--ink)">Trading Material</h2>
            <p className="text-[11px] text-black font-medium">
              Bought-and-sold trading materials — Purchase Received, Sales and Sales Return are fetched live from Purchase/Order systems.
            </p>
          </div>
        </div>
        {isEditable && (
          <button
            type="button"
            onClick={openAddForm}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Add Trading Material</span>
          </button>
        )}
      </div>

      <GlassCard className="p-2 sm:p-6">
        <h3 className="text-sm font-bold text-(--ink) mb-4">Trading Material Stock</h3>
        <Table
          isLoading={loading}
          columns={columns}
          data={tableRows}
          searchPlaceholder="Search trading materials..."
          filterKey="firm_name"
          filterOptions={accessibleBranchOptions}
          filterPlaceholder="Filter Firm"
          exportFileName="trading_material"
        />
      </GlassCard>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Add Trading Material">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Firm Name <span className="text-red-500">*</span></label>
              <select
                {...register('firmName', { required: 'Firm name is required' })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
              >
                <option value="">Select firm...</option>
                {accessibleBranchOptions.map((firmName) => (
                  <option key={firmName} value={firmName}>{firmName}</option>
                ))}
              </select>
              {errors.firmName && <span className="text-[10px] text-rose-400 font-medium">{errors.firmName.message}</span>}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Product Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Enter product name"
                {...register('productName', { required: 'Product name is required' })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              {errors.productName && <span className="text-[10px] text-rose-400 font-medium">{errors.productName.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Op. Stock</label>
              <input type="number" step="any" placeholder="0" {...register('opStock')} className="w-full px-3 py-2.5 text-xs rounded-lg glass-input" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Stock Adjustment</label>
              <input type="number" step="any" placeholder="0" {...register('stockAdjustment')} className="w-full px-3 py-2.5 text-xs rounded-lg glass-input" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Purchase Return</label>
              <input type="number" step="any" placeholder="0" {...register('purchaseReturn')} className="w-full px-3 py-2.5 text-xs rounded-lg glass-input" />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
            >
              Add Trading Material
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TradingMaterial;
