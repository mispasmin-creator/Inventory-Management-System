import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, History as HistoryIcon, Package, Building2 } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabaseClient';

const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];
const PAGE_SIZE = 1000;

// '2026-07-17' -> '17/07/2026' for the column header.
const toDisplayDate = (isoDate) => {
  if (!isoDate) return '';
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
  const [rawRows, setRawRows] = useState([]);
  const [rawDates, setRawDates] = useState([]);
  const [finishRows, setFinishRows] = useState([]);
  const [finishDates, setFinishDates] = useState([]);
  const [loading, setLoading] = useState(true);

  const isFinishGood = activeTab === 'finish_good';

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const readAll = async (table, columns, orderColumn) => {
        const rows = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from(table)
            .select(columns)
            .order('firm_name', { ascending: true })
            .order(orderColumn, { ascending: true })
            .order('snapshot_date', { ascending: true })
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
          'firm_name, item_name, unit, actual_level, optimum_qty, max_qty, snapshot_date',
          'item_name',
        ),
        readAll(
          'finished_goods_inventory_history',
          'firm_name, product_name, current_level, sales_order_pending, snapshot_date',
          'product_name',
        ),
      ]);

      const processData = (data, nameField, levelField, extraFields) => {
        const map = new Map();
        const dates = new Set();
        data.forEach(row => {
          if (row.snapshot_date) {
            dates.add(row.snapshot_date);
            const key = `${row.firm_name}_${row[nameField]}`;
            if (!map.has(key)) {
               map.set(key, {
                  firm_name: row.firm_name,
                  item_name: row[nameField],
                  ...extraFields.reduce((acc, f) => ({ ...acc, [f]: row[f] }), {}),
               });
            }
            map.get(key)[row.snapshot_date] = row[levelField];
          }
        });
        const datesArray = Array.from(dates).sort();
        return {
          dates: datesArray,
          rows: Array.from(map.values()).map((item, index) => ({ s_no: index + 1, ...item }))
        };
      };

      const rawProcessed = processData(raw, 'item_name', 'actual_level', ['unit', 'optimum_qty', 'max_qty']);
      setRawDates(rawProcessed.dates);
      setRawRows(rawProcessed.rows);

      const finishProcessed = processData(finish, 'product_name', 'current_level', ['sales_order_pending']);
      setFinishDates(finishProcessed.dates);
      setFinishRows(finishProcessed.rows);
    } catch (e) {
      showError(e.message || 'Failed to load history.');
      setRawRows([]);
      setFinishRows([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const activeDates = isFinishGood ? finishDates : rawDates;

  const columns = useMemo(() => {
    const baseColumns = [
      { header: 'S.No.', accessor: 's_no', sortable: false },
      { header: 'Firm Name', accessor: 'firm_name' },
      { header: isFinishGood ? 'Product Name' : 'Item Name', accessor: 'item_name' },
      { header: 'Unit', accessor: 'unit', render: (row) => row.unit || '-' },
    ];

    const dateCols = activeDates.map(date => ({
      header: toDisplayDate(date),
      accessor: date,
      cellClassName: (row) => {
        const value = row[date];
        if (value === null || value === undefined || value === '') return '';
        if (isFinishGood) {
          return Number(value) < Number(row.sales_order_pending || 0)
            ? 'bg-gradient-to-r from-red-500/95 to-rose-600/95 text-white font-bold'
            : 'bg-gradient-to-r from-emerald-500/95 to-teal-600/95 text-white font-bold';
        }
        return RAW_STATUS_CLASS[getRawStatus(value, row.optimum_qty, row.max_qty)] || '';
      },
      render: (row) => formatNumber(row[date]),
    }));

    return [...baseColumns, ...dateCols];
  }, [isFinishGood, activeDates]);

  const activeRows = isFinishGood ? finishRows : rawRows;
  const hasHistory = activeDates.length > 0;

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
        </h3>

        {loading && activeRows.length === 0 ? (
          <TableSkeleton />
        ) : !hasHistory ? (
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
                ? `finished_good_history`
                : `raw_material_history`
            }
          />
        )}
      </GlassCard>
    </div>
  );
};

export default History;
