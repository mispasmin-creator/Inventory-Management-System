import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, History as HistoryIcon, Package, Building2 } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabaseClient';

const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];
const PAGE_SIZE = 1000;

const toDateString = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// A snapshot can never be newer than today, so nothing beyond it is selectable.
const getMaxDate = () => toDateString(new Date());

// '2026-07-17' -> '17/07/2026' for the column header.
const toDisplayDate = (isoDate) => {
  const [yyyy, mm, dd] = String(isoDate).split('-');
  return `${dd}/${mm}/${yyyy}`;
};

const formatNumber = (value, decimals = 3) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString(undefined, { maximumFractionDigits: decimals });
};

// Same status bands the Raw Material screen uses (BranchInventory.jsx).
const getRawStatus = (actualLevel, optimumQty, maxQty) => {
  const actual = actualLevel === null || actualLevel === undefined || actualLevel === ''
    ? null
    : Number(actualLevel);
  if (actual === null || !Number.isFinite(actual)) return '';

  const max = maxQty !== null && maxQty !== undefined && maxQty !== '' ? Number(maxQty) : null;
  const optimum = optimumQty !== null && optimumQty !== undefined && optimumQty !== '' ? Number(optimumQty) : null;

  if (max !== null && max !== 0) {
    if (actual === 0) return 'No Stock';
    if (actual > max) return 'Excess Stock';
    const ratio = actual / max;
    if (ratio >= 0.66) return 'Normal Stock';
    if (ratio >= 0.33) return 'Medium Stock';
    return 'Low Stock';
  }

  if (optimum !== null && optimum !== 0) {
    const pct = (actual / optimum) * 100;
    if (pct < 33) return 'Low Stock';
    if (pct < 66) return 'Medium Stock';
    if (pct <= 100) return 'Normal Stock';
    return 'Excess Stock';
  }

  return '';
};

const RAW_STATUS_CLASS = {
  'No Stock': 'bg-gradient-to-br from-rose-400 to-rose-600 text-white font-black',
  'Low Stock': 'bg-gradient-to-br from-rose-400 to-rose-600 text-white font-black',
  'Medium Stock': 'bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black',
  'Normal Stock': 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-black',
  'Excess Stock': 'bg-gradient-to-br from-purple-400 to-purple-600 text-white font-black',
};

const RAW_LEGEND = [
  { label: 'No / Low Stock', color: '#f43f5e' },
  { label: 'Medium Stock', color: '#f59e0b' },
  { label: 'Normal Stock', color: '#10b981' },
  { label: 'Excess Stock', color: '#a855f7' },
];

const FINISH_LEGEND = [
  { label: 'Shortage (below pending orders)', color: '#ef4444' },
  { label: 'Stock available', color: '#10b981' },
];

const History = () => {
  const { showError } = useToast();
  const [activeTab, setActiveTab] = useState('raw_material');
  const [selectedDate, setSelectedDate] = useState('');
  const [latestDate, setLatestDate] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [finishRows, setFinishRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const isFinishGood = activeTab === 'finish_good';

  const fetchHistory = useCallback(async (date) => {
    if (!date) return;
    setLoading(true);
    try {
      const readAll = async (table, columns, orderColumn) => {
        const rows = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from(table)
            .select(columns)
            .eq('snapshot_date', date)
            .order('firm_name', { ascending: true })
            .order(orderColumn, { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < PAGE_SIZE) break;
        }
        return rows;
      };

      const [raw, finish] = await Promise.all([
        readAll(
          'inventory_master_history',
          'firm_name, item_name, unit, actual_level, optimum_qty, max_qty',
          'item_name',
        ),
        readAll(
          'finished_goods_inventory_history',
          'firm_name, product_name, current_level, sales_order_pending',
          'product_name',
        ),
      ]);

      setRawRows(raw.map((row, index) => ({
        s_no: index + 1,
        firm_name: row.firm_name,
        item_name: row.item_name,
        unit: row.unit || '',
        value: row.actual_level,
        optimum_qty: row.optimum_qty,
        max_qty: row.max_qty,
      })));

      setFinishRows(finish.map((row, index) => ({
        s_no: index + 1,
        firm_name: row.firm_name,
        item_name: row.product_name,
        unit: '',
        value: row.current_level,
        sales_order_pending: row.sales_order_pending,
      })));
    } catch (e) {
      showError(e.message || 'Failed to load history.');
      setRawRows([]);
      setFinishRows([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Land on the newest snapshot that exists rather than assuming yesterday, so
  // the page still shows data if a night was missed.
  useEffect(() => {
    let cancelled = false;

    const loadLatestDate = async () => {
      try {
        const newestOf = async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select('snapshot_date')
            .order('snapshot_date', { ascending: false })
            .limit(1);
          if (error) throw error;
          return data?.[0]?.snapshot_date || '';
        };

        const dates = (await Promise.all([
          newestOf('inventory_master_history'),
          newestOf('finished_goods_inventory_history'),
        ])).filter(Boolean);

        if (cancelled) return;
        const newest = dates.sort().pop() || '';
        setLatestDate(newest);
        setSelectedDate(newest);
        if (!newest) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        showError(e.message || 'Failed to find the latest history date.');
        setLoading(false);
      }
    };

    loadLatestDate();
    return () => { cancelled = true; };
  }, [showError]);

  useEffect(() => {
    if (selectedDate) fetchHistory(selectedDate);
  }, [selectedDate, fetchHistory]);

  const columns = useMemo(() => [
    { header: 'S.No.', accessor: 's_no', sortable: false },
    { header: 'Firm Name', accessor: 'firm_name' },
    { header: isFinishGood ? 'Product Name' : 'Item Name', accessor: 'item_name' },
    { header: 'Unit', accessor: 'unit', render: (row) => row.unit || '-' },
    {
      header: selectedDate ? toDisplayDate(selectedDate) : 'Stock',
      accessor: 'value',
      cellClassName: (row) => {
        if (row.value === null || row.value === undefined || row.value === '') return '';
        if (isFinishGood) {
          return Number(row.value) < Number(row.sales_order_pending || 0)
            ? 'bg-gradient-to-r from-red-500/95 to-rose-600/95 text-white font-bold'
            : 'bg-gradient-to-r from-emerald-500/95 to-teal-600/95 text-white font-bold';
        }
        return RAW_STATUS_CLASS[getRawStatus(row.value, row.optimum_qty, row.max_qty)] || '';
      },
      render: (row) => formatNumber(row.value),
    },
  ], [isFinishGood, selectedDate]);

  const activeRows = isFinishGood ? finishRows : rawRows;
  const isLatestDate = !latestDate || selectedDate === latestDate;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <HistoryIcon className="w-5 h-5 text-(--brand-green)" />
          <div>
            <h2 className="text-base font-bold text-(--ink)">Stock History</h2>
            <p className="text-[11px] text-(--ink-faint) font-medium">
              {isFinishGood ? 'Current Level' : 'Actual Level'} as captured automatically at 12 AM.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-(--ink-faint) pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              max={getMaxDate()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-8 pr-3 py-2.5 text-xs rounded-xl glass-input font-medium cursor-pointer"
            />
          </div>
          {!isLatestDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(latestDate)}
              className="px-3 py-2.5 text-xs rounded-xl glass-input font-medium cursor-pointer hover:bg-(--surface-mid) transition-colors"
            >
              Latest
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-(--line)">
        <button
          type="button"
          onClick={() => setActiveTab('raw_material')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'raw_material'
              ? 'border-(--brand-green) text-(--brand-green-dark)'
              : 'border-transparent text-(--ink-faint) hover:text-(--ink)'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Raw Material
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('finish_good')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'finish_good'
              ? 'border-(--brand-green) text-(--brand-green-dark)'
              : 'border-transparent text-(--ink-faint) hover:text-(--ink)'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Finished Good
        </button>
      </div>

      <GlassCard className="p-2 sm:p-6">
        <h3 className="text-sm font-bold text-(--ink) mb-4">
          {isFinishGood ? 'Finished Good History' : 'Raw Material History'}
          {selectedDate && (
            <span className="ml-2 text-[11px] font-medium text-(--ink-faint)">
              {toDisplayDate(selectedDate)}{isLatestDate && latestDate ? ' (latest)' : ''}
            </span>
          )}
        </h3>

        {loading && activeRows.length === 0 ? (
          <TableSkeleton />
        ) : !latestDate ? (
          <div className="text-center py-12 text-(--ink-faint) text-sm">
            No history captured yet. The first snapshot runs tonight at 12 AM.
          </div>
        ) : (
          <Table
            isLoading={loading}
            columns={columns}
            data={activeRows}
            legend={isFinishGood ? FINISH_LEGEND : RAW_LEGEND}
            searchPlaceholder={isFinishGood ? 'Search products...' : 'Search items...'}
            filterKey="firm_name"
            filterOptions={branchOptions}
            filterPlaceholder="Filter Firm"
            exportFileName={
              isFinishGood
                ? `finished_good_history_${selectedDate}`
                : `raw_material_history_${selectedDate}`
            }
          />
        )}
      </GlassCard>
    </div>
  );
};

export default History;
