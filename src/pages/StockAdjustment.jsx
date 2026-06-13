import React, { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Plus, SlidersHorizontal } from 'lucide-react';
import { useForm } from 'react-hook-form';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import Table from '../components/Table';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabaseClient';

const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];

const defaultFormValues = {
  date: new Date().toISOString().split('T')[0],
  firmName: '',
  itemName: '',
  qty: '',
  remark: '',
  status: 'Factory +'
};

const StockAdjustment = () => {
  const { showSuccess, showError } = useToast();
  const [rawEntries, setRawEntries] = useState([]);
  const [rawItemOptions, setRawItemOptions] = useState([]);
  const [finishItemOptions, setFinishItemOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rawEntryFormOpen, setRawEntryFormOpen] = useState(false);
  const [finishEntryFormOpen, setFinishEntryFormOpen] = useState(false);

  const {
    register: registerRaw,
    handleSubmit: handleRawSubmit,
    reset: resetRaw,
    watch: watchRaw,
    formState: { errors: errorsRaw }
  } = useForm({ defaultValues: defaultFormValues });

  const {
    register: registerFinish,
    handleSubmit: handleFinishSubmit,
    reset: resetFinish,
    watch: watchFinish,
    formState: { errors: errorsFinish }
  } = useForm({ defaultValues: defaultFormValues });

  const selectedRawFirm = watchRaw('firmName');
  const selectedFinishFirm = watchFinish('firmName');

  useEffect(() => {
    fetchStockAdjustments();
    fetchRawMaterialItems();
    fetchFinishGoodItems();
  }, []);

  const fetchStockAdjustments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('id, entry_date, firm_name, item_name, qty, remark, status, material_type, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRawEntries(data || []);
    } catch (e) {
      showError(e.message || 'Failed to load stock adjustment entries.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRawMaterialItems = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_master')
        .select('firm_name, item_name')
        .order('firm_name', { ascending: true })
        .order('item_name', { ascending: true });

      if (error) throw error;
      setRawItemOptions((data || []).filter(item => item.firm_name && item.item_name));
    } catch (e) {
      showError(e.message || 'Failed to load raw material item names.');
    }
  };

  const fetchFinishGoodItems = async () => {
    try {
      const { data, error } = await supabase
        .from('finished_goods_inventory_master')
        .select('firm_name, product_name')
        .order('firm_name', { ascending: true })
        .order('product_name', { ascending: true });

      if (error) throw error;
      setFinishItemOptions((data || []).filter(item => item.firm_name && item.product_name));
    } catch (e) {
      showError(e.message || 'Failed to load finish good product names.');
    }
  };

  const filteredRawItemOptions = useMemo(
    () => rawItemOptions
      .filter(item => !selectedRawFirm || item.firm_name === selectedRawFirm)
      .map(item => item.item_name)
      .filter((itemName, index, items) => items.indexOf(itemName) === index)
      .sort((a, b) => a.localeCompare(b)),
    [rawItemOptions, selectedRawFirm]
  );

  const filteredFinishItemOptions = useMemo(
    () => finishItemOptions
      .filter(item => !selectedFinishFirm || item.firm_name === selectedFinishFirm)
      .map(item => item.product_name)
      .filter((productName, index, products) => products.indexOf(productName) === index)
      .sort((a, b) => a.localeCompare(b)),
    [finishItemOptions, selectedFinishFirm]
  );

  const onRawEntrySubmit = async (data) => {
    try {
      const { error } = await supabase
        .from('stock_adjustment')
        .insert([{
          entry_date: data.date,
          firm_name: data.firmName,
          item_name: data.itemName,
          material_type: 'raw_material',
          qty: Number(data.qty),
          remark: data.remark || null,
          status: data.status
        }]);

      if (error) throw error;

      showSuccess('Raw material factory entry saved successfully.');
      fetchStockAdjustments();
      resetRaw(defaultFormValues);
      setRawEntryFormOpen(false);
    } catch (e) {
      showError(e.message || 'Failed to save raw material factory entry.');
    }
  };

  const onFinishEntrySubmit = async (data) => {
    try {
      const { error } = await supabase
        .from('stock_adjustment')
        .insert([{
          entry_date: data.date,
          firm_name: data.firmName,
          item_name: data.itemName,
          material_type: 'finish_good',
          qty: Number(data.qty),
          remark: data.remark || null,
          status: data.status
        }]);

      if (error) throw error;

      showSuccess('Finish good factory entry saved successfully.');
      fetchStockAdjustments();
      resetFinish(defaultFormValues);
      setFinishEntryFormOpen(false);
    } catch (e) {
      showError(e.message || 'Failed to save finish good factory entry.');
    }
  };

  const renderStatus = (row) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
      row.status === 'Factory +'
        ? 'bg-emerald-600 text-white'
        : 'bg-rose-600 text-white'
    }`}>
      {row.status}
    </span>
  );

  const baseColumns = [
    { header: 'ID', accessor: 'id' },
    { header: 'Date', accessor: 'entry_date' },
    { header: 'Firm Name', accessor: 'firm_name', render: (row) => row.firm_name || '-' },
    {
      header: 'Type',
      accessor: 'material_type',
      render: (row) => row.material_type === 'finish_good' ? 'Finish Good' : 'Raw Material'
    },
    { header: 'Qty', accessor: 'qty', render: (row) => Number(row.qty).toLocaleString('en-IN') },
    { header: 'Remark', accessor: 'remark', render: (row) => row.remark || '-' },
    { header: 'Status', accessor: 'status', render: renderStatus },
    {
      header: 'Created At',
      accessor: 'created_at',
      render: (row) => row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '-'
    }
  ];

  const rawColumns = [
    ...baseColumns.slice(0, 4),
    {
      header: 'Item / Product Name',
      accessor: 'item_name'
    },
    ...baseColumns.slice(4)
  ];

  const renderAdjustmentForm = ({
    errors,
    filteredOptions,
    handleSubmit,
    onSubmit,
    register,
    setOpen,
    submitLabel,
    itemLabel
  }) => (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Date</label>
          <input
            type="date"
            {...register('date', { required: 'Date is required' })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
          />
          {errors.date && <span className="text-[10px] text-rose-400 font-medium">{errors.date.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Firm Name</label>
          <select
            {...register('firmName', { required: 'Firm name is required' })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
          >
            <option value="">Select firm...</option>
            {branchOptions.map(firmName => (
              <option key={firmName} value={firmName}>{firmName}</option>
            ))}
          </select>
          {errors.firmName && <span className="text-[10px] text-rose-400 font-medium">{errors.firmName.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">{itemLabel}</label>
          <select
            {...register('itemName', { required: `${itemLabel} is required` })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
          >
            <option value="">Select item...</option>
            {filteredOptions.map(itemName => (
              <option key={itemName} value={itemName}>{itemName}</option>
            ))}
          </select>
          {errors.itemName && <span className="text-[10px] text-rose-400 font-medium">{errors.itemName.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Qty</label>
          <input
            type="number"
            step="any"
            placeholder="0"
            {...register('qty', {
              required: 'Qty is required',
              min: { value: 0.01, message: 'Qty must be greater than 0' }
            })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
          />
          {errors.qty && <span className="text-[10px] text-rose-400 font-medium">{errors.qty.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Status</label>
          <select
            {...register('status', { required: true })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
          >
            <option value="Factory +">Factory +</option>
            <option value="Factory -">Factory -</option>
          </select>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Remark</label>
          <textarea
            rows={3}
            placeholder="Add remark"
            {...register('remark')}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input resize-none"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            <span>Stock Adjustment</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Factory adjustment entries for raw materials and finish goods.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => setRawEntryFormOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Raw Material Form</span>
          </button>
          <button
            onClick={() => setFinishEntryFormOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <PackagePlus className="w-4.5 h-4.5" />
            <span>Finish Good Form</span>
          </button>
        </div>
      </div>

      <GlassCard className="p-6">
        <h3 className="text-sm font-bold text-slate-100 mb-4">Stock Adjustment Entries</h3>
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Loading stock adjustment entries...
          </div>
        ) : (
          <Table
            columns={rawColumns}
            data={rawEntries}
            searchPlaceholder="Search stock adjustment entries..."
            filterKey="material_type"
            filterOptions={['raw_material', 'finish_good']}
            filterPlaceholder="Filter Type"
            exportFileName="stock_adjustment_entries"
          />
        )}
      </GlassCard>

      <Modal
        isOpen={rawEntryFormOpen}
        onClose={() => setRawEntryFormOpen(false)}
        title="Raw Material Factory Entry"
      >
        {renderAdjustmentForm({
          errors: errorsRaw,
          filteredOptions: filteredRawItemOptions,
          handleSubmit: handleRawSubmit,
          onSubmit: onRawEntrySubmit,
          register: registerRaw,
          setOpen: setRawEntryFormOpen,
          submitLabel: 'Add Entry',
          itemLabel: 'Item Name'
        })}
      </Modal>

      <Modal
        isOpen={finishEntryFormOpen}
        onClose={() => setFinishEntryFormOpen(false)}
        title="Finish Good Factory Entry"
      >
        {renderAdjustmentForm({
          errors: errorsFinish,
          filteredOptions: filteredFinishItemOptions,
          handleSubmit: handleFinishSubmit,
          onSubmit: onFinishEntrySubmit,
          register: registerFinish,
          setOpen: setFinishEntryFormOpen,
          submitLabel: 'Add Entry',
          itemLabel: 'Product Name'
        })}
      </Modal>
    </div>
  );
};

export default StockAdjustment;
