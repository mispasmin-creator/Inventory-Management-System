import { useEffect, useMemo, useState } from 'react';
import { Edit3, PackagePlus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import Table from '../components/Table';
import { TableSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabaseClient';

const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];
const normalizeFirmName = (value) => value === 'Madhya' ? 'Pmmpl' : value;

const defaultFormValues = {
  date: new Date().toISOString().split('T')[0],
  firmName: '',
  itemName: '',
  qty: '',
  remark: '',
  status: 'Factory +'
};

const rawProductDefaultValues = {
  firmName: '',
  productName: '',
  unit: 'MT',
  maxQty: 0,
  optimumQty: 0,
  safetyFactor: 1
};

const StockAdjustment = () => {
  const { showSuccess, showError } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('adjustments');
  const [rawEntries, setRawEntries] = useState([]);
  const [rawItemOptions, setRawItemOptions] = useState([]);
  const [finishItemOptions, setFinishItemOptions] = useState([]);
  const [rawMaterialOpStockRows, setRawMaterialOpStockRows] = useState([]);
  const [finishGoodOpStockRows, setFinishGoodOpStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rawEntryFormOpen, setRawEntryFormOpen] = useState(false);
  const [finishEntryFormOpen, setFinishEntryFormOpen] = useState(false);
  const [opStockFormOpen, setOpStockFormOpen] = useState(false);
  const [rawProductFormOpen, setRawProductFormOpen] = useState(false);
  const [finishProductFormOpen, setFinishProductFormOpen] = useState(false);
  const [editingOpStockRow, setEditingOpStockRow] = useState(null);
  const [opStockMaterialType, setOpStockMaterialType] = useState('finish_good');

  const accessibleFirms = useMemo(() => {
    if (user?.role === 'Admin') return branchOptions;
    const assignedFirms = user?.branch === 'All'
      ? branchOptions
      : (Array.isArray(user?.branch) ? user.branch : [user?.branch]);
    const firmsFromLogin = branchOptions.filter(firmName => assignedFirms
      .map(normalizeFirmName)
      .includes(firmName));
    const pageAccess = user?.page_access || [];
    const granularStockAccess = pageAccess
      .filter(key => key.startsWith('StockAdjustment_'))
      .map(key => normalizeFirmName(key.replace('StockAdjustment_', '')));

    if (granularStockAccess.length === 0) return firmsFromLogin;
    return firmsFromLogin.filter(firmName => granularStockAccess.includes(firmName));
  }, [user]);

  const defaultFirmName = accessibleFirms.length === 1 ? accessibleFirms[0] : '';
  const getDefaultFormValues = () => ({ ...defaultFormValues, firmName: defaultFirmName });

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

  const {
    register: registerOpStock,
    handleSubmit: handleOpStockSubmit,
    reset: resetOpStock,
    watch: watchOpStock,
    formState: { errors: errorsOpStock }
  } = useForm({ defaultValues: defaultFormValues });

  const {
    register: registerRawProduct,
    handleSubmit: handleRawProductSubmit,
    reset: resetRawProduct,
    formState: { errors: errorsRawProduct }
  } = useForm({ defaultValues: rawProductDefaultValues });

  const {
    register: registerFinishProduct,
    handleSubmit: handleFinishProductSubmit,
    reset: resetFinishProduct,
    formState: { errors: errorsFinishProduct }
  } = useForm({ defaultValues: { firmName: '', productName: '' } });

  const selectedRawFirm = watchRaw('firmName');
  const selectedFinishFirm = watchFinish('firmName');
  const selectedOpStockFirm = watchOpStock('firmName');

  useEffect(() => {
    if (!user) return;
    fetchStockAdjustments();
    fetchRawMaterialItems();
    fetchFinishGoodItems();
  }, [user]);

  const restrictQueryToAccessibleFirms = (query) => {
    const databaseFirms = accessibleFirms.flatMap(firmName =>
      firmName === 'Pmmpl' ? ['Pmmpl', 'Madhya'] : [firmName]
    );
    return databaseFirms.length ? query.in('firm_name', databaseFirms) : query.in('firm_name', ['']);
  };

  const fetchStockAdjustments = async () => {
    setLoading(true);
    try {
      const query = supabase
        .from('stock_adjustment')
        .select('id, entry_date, firm_name, item_name, qty, remark, status, material_type, created_at')
        .order('created_at', { ascending: false });
      const { data, error } = await restrictQueryToAccessibleFirms(query);

      if (error) throw error;
      setRawEntries((data || []).map(row => ({
        ...row,
        firm_name: normalizeFirmName(row.firm_name)
      })));
    } catch (e) {
      showError(e.message || 'Failed to load stock adjustment entries.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRawMaterialItems = async () => {
    try {
      const query = supabase
        .from('inventory_master')
        .select('id, firm_name, item_name, op_stock, op_stock_date')
        .order('firm_name', { ascending: true })
        .order('item_name', { ascending: true });
      const { data, error } = await restrictQueryToAccessibleFirms(query);

      if (error) throw error;
      const rawMaterialRows = (data || [])
        .map(item => ({ ...item, firm_name: normalizeFirmName(item.firm_name) }))
        .filter(item => item.firm_name && item.item_name);
      setRawItemOptions(rawMaterialRows);
      setRawMaterialOpStockRows(rawMaterialRows);
    } catch (e) {
      showError(e.message || 'Failed to load raw material item names.');
    }
  };

  const fetchFinishGoodItems = async () => {
    try {
      const query = supabase
        .from('finished_goods_inventory_master')
        .select('id, firm_name, product_name, op_stock, op_stock_date')
        .order('firm_name', { ascending: true })
        .order('product_name', { ascending: true });
      const { data, error } = await restrictQueryToAccessibleFirms(query);

      if (error) throw error;
      const finishGoodRows = (data || [])
        .map(item => ({ ...item, firm_name: normalizeFirmName(item.firm_name) }))
        .filter(item => item.firm_name && item.product_name);
      setFinishItemOptions(finishGoodRows);
      setFinishGoodOpStockRows(finishGoodRows);
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

  const filteredOpStockItemOptions = useMemo(
    () => (opStockMaterialType === 'raw_material' ? rawItemOptions : finishItemOptions)
      .filter(item => !selectedOpStockFirm || item.firm_name === selectedOpStockFirm)
      .map(item => opStockMaterialType === 'raw_material' ? item.item_name : item.product_name)
      .filter((itemName, index, items) => items.indexOf(itemName) === index)
      .sort((a, b) => a.localeCompare(b)),
    [finishItemOptions, opStockMaterialType, rawItemOptions, selectedOpStockFirm]
  );

  const savedOpStockRows = useMemo(() => [
    ...rawMaterialOpStockRows
      .filter(row => row.op_stock_date)
      .map(row => ({
        ...row,
        material_type: 'raw_material',
        material_label: 'Raw Material',
        display_name: row.item_name
      })),
    ...finishGoodOpStockRows
      .filter(row => row.op_stock_date)
      .map(row => ({
        ...row,
        material_type: 'finish_good',
        material_label: 'Finished Good',
        display_name: row.product_name
      }))
  ], [finishGoodOpStockRows, rawMaterialOpStockRows]);

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

  const onOpStockSubmit = async (data) => {
    try {
      const isRawMaterial = opStockMaterialType === 'raw_material';
      const sourceRows = isRawMaterial ? rawMaterialOpStockRows : finishGoodOpStockRows;
      const targetRow = editingOpStockRow || sourceRows.find(row =>
        row.firm_name === data.firmName
        && (isRawMaterial ? row.item_name : row.product_name) === data.itemName
      );

      if (!targetRow) {
        throw new Error(`Selected ${isRawMaterial ? 'raw material' : 'finished good'} was not found.`);
      }

      const { error } = await supabase
        .from(isRawMaterial ? 'inventory_master' : 'finished_goods_inventory_master')
        .update({
          op_stock: Number(data.qty),
          op_stock_date: data.date
        })
        .eq('id', targetRow.id);

      if (error) throw error;

      showSuccess(`${isRawMaterial ? 'Raw material' : 'Finished good'} OP Stock ${editingOpStockRow ? 'updated' : 'saved'} successfully.`);
      if (isRawMaterial) {
        await fetchRawMaterialItems();
      } else {
        await fetchFinishGoodItems();
      }
      resetOpStock(defaultFormValues);
      setEditingOpStockRow(null);
      setOpStockFormOpen(false);
    } catch (e) {
      showError(e.message || 'Failed to save OP Stock.');
    }
  };

  const onRawProductSubmit = async (data) => {
    try {
      const { error } = await supabase
        .from('inventory_master')
        .insert([{
          firm_name: data.firmName,
          item_name: data.productName.trim(),
          unit: data.unit?.trim() || 'MT',
          max_qty: Number(data.maxQty),
          optimum_qty: Number(data.optimumQty),
          safety_factor: Number(data.safetyFactor)
        }]);

      if (error) throw error;

      showSuccess('Raw material added successfully.');
      await fetchRawMaterialItems();
      resetRawProduct({ ...rawProductDefaultValues, firmName: defaultFirmName });
      setRawProductFormOpen(false);
    } catch (e) {
      showError(e.code === '23505'
        ? 'This raw material already exists for the selected firm.'
        : e.message || 'Failed to add raw material.');
    }
  };

  const onFinishProductSubmit = async (data) => {
    try {
      const { error } = await supabase
        .from('finished_goods_inventory_master')
        .insert([{
          firm_name: data.firmName,
          product_name: data.productName.trim()
        }]);

      if (error) throw error;

      showSuccess('Finished good added successfully.');
      await fetchFinishGoodItems();
      resetFinishProduct({ firmName: defaultFirmName, productName: '' });
      setFinishProductFormOpen(false);
    } catch (e) {
      showError(e.code === '23505'
        ? 'This finished good already exists for the selected firm.'
        : e.message || 'Failed to add finished good.');
    }
  };

  const openRawProductForm = () => {
    resetRawProduct({ ...rawProductDefaultValues, firmName: defaultFirmName });
    setRawProductFormOpen(true);
  };

  const openFinishProductForm = () => {
    resetFinishProduct({ firmName: defaultFirmName, productName: '' });
    setFinishProductFormOpen(true);
  };

  const openNewOpStockForm = (materialType) => {
    setOpStockMaterialType(materialType);
    setEditingOpStockRow(null);
    resetOpStock(getDefaultFormValues());
    setOpStockFormOpen(true);
  };

  const openEditOpStockForm = (row) => {
    setOpStockMaterialType(row.material_type);
    setEditingOpStockRow(row);
    resetOpStock({
      ...defaultFormValues,
      date: row.op_stock_date || defaultFormValues.date,
      firmName: row.firm_name,
      itemName: row.display_name,
      qty: row.op_stock ?? ''
    });
    setOpStockFormOpen(true);
  };

  const closeOpStockForm = () => {
    setOpStockFormOpen(false);
    setEditingOpStockRow(null);
    resetOpStock(defaultFormValues);
  };

  const handleDeleteOpStock = async (row) => {
    const materialLabel = row.material_type === 'raw_material' ? 'raw material' : 'finished good';
    if (!window.confirm(`Remove OP. Stock for ${row.display_name}? The ${materialLabel} master item will remain unchanged.`)) {
      return;
    }

    try {
      const tableName = row.material_type === 'raw_material'
        ? 'inventory_master'
        : 'finished_goods_inventory_master';
      const { error } = await supabase
        .from(tableName)
        .update({
          op_stock: 0,
          op_stock_date: null
        })
        .eq('id', row.id);

      if (error) throw error;

      showSuccess('OP Stock removed successfully.');
      if (row.material_type === 'raw_material') {
        await fetchRawMaterialItems();
      } else {
        await fetchFinishGoodItems();
      }
    } catch (e) {
      showError(e.message || 'Failed to remove OP Stock.');
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
      render: (row) => {
        return row.material_type === 'finish_good' ? 'Finish Good' : 'Raw Material';
      }
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

  const productRows = useMemo(() => [
    ...rawItemOptions.map(row => ({
      id: `raw-${row.id}`,
      material_label: 'Raw Material',
      firm_name: row.firm_name,
      display_name: row.item_name
    })),
    ...finishItemOptions.map(row => ({
      id: `finish-${row.id}`,
      material_label: 'Finished Good',
      firm_name: row.firm_name,
      display_name: row.product_name
    }))
  ], [finishItemOptions, rawItemOptions]);

  const productColumns = [
    { header: 'Type', accessor: 'material_label' },
    { header: 'Firm Name', accessor: 'firm_name' },
    { header: 'Item / Product Name', accessor: 'display_name' }
  ];

  const opStockColumns = [
    { header: 'ID', accessor: 'id' },
    { header: 'Type', accessor: 'material_label' },
    { header: 'Firm Name', accessor: 'firm_name', render: (row) => row.firm_name || '-' },
    { header: 'Item / Product Name', accessor: 'display_name' },
    { header: 'OP. Stock', accessor: 'op_stock', render: (row) => Number(row.op_stock || 0).toLocaleString('en-IN') },
    { header: 'OP. Stock Date', accessor: 'op_stock_date', render: (row) => row.op_stock_date || '-' },
    {
      header: 'Action',
      accessor: '',
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEditOpStockForm(row)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDeleteOpStock(row)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-600/20 text-red-600 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )
    }
  ];

  const renderAdjustmentForm = ({
    errors,
    filteredOptions,
    handleSubmit,
    onSubmit,
    register,
    setOpen,
    submitLabel,
    itemLabel,
    quantityLabel = 'Qty',
    showStatus = true,
    showRemark = true,
    lockItemSelection = false,
    minimumQuantity = 0.01
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
            disabled={lockItemSelection}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
          >
            <option value="">Select firm...</option>
            {accessibleFirms.map(firmName => (
              <option key={firmName} value={firmName}>{firmName}</option>
            ))}
          </select>
          {errors.firmName && <span className="text-[10px] text-rose-400 font-medium">{errors.firmName.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">{itemLabel}</label>
          <select
            {...register('itemName', { required: `${itemLabel} is required` })}
            disabled={lockItemSelection}
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
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">{quantityLabel}</label>
          <input
            type="number"
            step="any"
            placeholder="0"
            {...register('qty', {
              required: 'Qty is required',
              min: {
                value: minimumQuantity,
                message: minimumQuantity === 0 ? 'Qty cannot be negative' : 'Qty must be greater than 0'
              }
            })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
          />
          {errors.qty && <span className="text-[10px] text-rose-400 font-medium">{errors.qty.message}</span>}
        </div>

        {showStatus && (
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
        )}

        {showRemark && (
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Remark</label>
            <textarea
              rows={3}
              placeholder="Add remark"
              {...register('remark')}
              className="w-full px-3 py-2.5 text-xs rounded-lg glass-input resize-none"
            />
          </div>
        )}
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

  const renderProductForm = ({
    errors,
    handleSubmit,
    includeUnit = false,
    onSubmit,
    register,
    setOpen,
    submitLabel
  }) => (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Firm Name</label>
          <select
            {...register('firmName', { required: 'Firm name is required' })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
          >
            <option value="">Select firm...</option>
            {accessibleFirms.map(firmName => (
              <option key={firmName} value={firmName}>{firmName}</option>
            ))}
          </select>
          {errors.firmName && <span className="text-[10px] text-rose-400 font-medium">{errors.firmName.message}</span>}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
            {includeUnit ? 'Raw Material Name' : 'Finished Good Name'}
          </label>
          <input
            type="text"
            placeholder={includeUnit ? 'Enter raw material name' : 'Enter finished good name'}
            {...register('productName', {
              required: 'Name is required',
              validate: value => value.trim().length > 0 || 'Name is required'
            })}
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
          />
          {errors.productName && <span className="text-[10px] text-rose-400 font-medium">{errors.productName.message}</span>}
        </div>

        {includeUnit && (
          <>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Unit</label>
              <input
                type="text"
                placeholder="e.g. MT, KG"
                {...register('unit', { required: 'Unit is required' })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              {errors.unit && <span className="text-[10px] text-rose-400 font-medium">{errors.unit.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Max Quantity</label>
              <input
                type="number"
                step="any"
                {...register('maxQty', {
                  required: 'Max quantity is required',
                  min: { value: 0, message: 'Max quantity cannot be negative' }
                })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              {errors.maxQty && <span className="text-[10px] text-rose-400 font-medium">{errors.maxQty.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Optimum Quantity</label>
              <input
                type="number"
                step="any"
                {...register('optimumQty', {
                  required: 'Optimum quantity is required',
                  min: { value: 0, message: 'Optimum quantity cannot be negative' }
                })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              {errors.optimumQty && <span className="text-[10px] text-rose-400 font-medium">{errors.optimumQty.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Safety Factor</label>
              <input
                type="number"
                step="any"
                {...register('safetyFactor', {
                  required: 'Safety factor is required',
                  min: { value: 0, message: 'Safety factor cannot be negative' }
                })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              {errors.safetyFactor && <span className="text-[10px] text-rose-400 font-medium">{errors.safetyFactor.message}</span>}
            </div>

          </>
        )}
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
        {activeTab === 'adjustments' ? (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                resetRaw(getDefaultFormValues());
                setRawEntryFormOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Raw Material Form</span>
            </button>
            <button
              onClick={() => {
                resetFinish(getDefaultFormValues());
                setFinishEntryFormOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <PackagePlus className="w-4.5 h-4.5" />
              <span>Finish Good Form</span>
            </button>
          </div>
        ) : activeTab === 'op_stock' ? (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={() => openNewOpStockForm('raw_material')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Add Raw Material OP. Stock</span>
            </button>
            <button
              onClick={() => openNewOpStockForm('finish_good')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <PackagePlus className="w-4.5 h-4.5" />
              <span>Add Finished Good OP. Stock</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={openRawProductForm}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Add Raw Material</span>
            </button>
            <button
              onClick={openFinishProductForm}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
            >
              <PackagePlus className="w-4.5 h-4.5" />
              <span>Add Finished Good</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('adjustments')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'adjustments'
              ? 'border-indigo-500 text-indigo-300'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Stock Adjustments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('op_stock')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'op_stock'
              ? 'border-black text-black'
              : 'border-transparent text-black hover:text-slate-700'
          }`}
        >
          OP. Stock
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'products'
              ? 'border-emerald-500 text-emerald-300'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Products
        </button>
      </div>

      <GlassCard className="p-2 sm:p-6">
        <h3 className="text-sm font-bold text-slate-100 mb-4">
          {activeTab === 'adjustments'
            ? 'Stock Adjustment Entries'
            : activeTab === 'op_stock'
              ? 'Manual OP. Stock Entries'
              : 'Raw Material & Finished Good Products'}
        </h3>
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : activeTab === 'op_stock' ? (
          <Table
            columns={opStockColumns}
            data={savedOpStockRows}
            searchPlaceholder="Search OP. Stock entries..."
            filterKey="material_type"
            filterOptions={['raw_material', 'finish_good']}
            filterPlaceholder="Filter Type"
            exportFileName="manual_op_stock_entries"
          />
        ) : activeTab === 'products' ? (
          <Table
            columns={productColumns}
            data={productRows}
            searchPlaceholder="Search products..."
            filterKey="material_label"
            filterOptions={['Raw Material', 'Finished Good']}
            filterPlaceholder="Filter Type"
            exportFileName="product_master"
          />
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
        isOpen={rawProductFormOpen}
        onClose={() => setRawProductFormOpen(false)}
        title="Add Raw Material"
      >
        {renderProductForm({
          errors: errorsRawProduct,
          handleSubmit: handleRawProductSubmit,
          includeUnit: true,
          onSubmit: onRawProductSubmit,
          register: registerRawProduct,
          setOpen: setRawProductFormOpen,
          submitLabel: 'Add Raw Material'
        })}
      </Modal>

      <Modal
        isOpen={finishProductFormOpen}
        onClose={() => setFinishProductFormOpen(false)}
        title="Add Finished Good"
      >
        {renderProductForm({
          errors: errorsFinishProduct,
          handleSubmit: handleFinishProductSubmit,
          onSubmit: onFinishProductSubmit,
          register: registerFinishProduct,
          setOpen: setFinishProductFormOpen,
          submitLabel: 'Add Finished Good'
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

      <Modal
        isOpen={opStockFormOpen}
        onClose={closeOpStockForm}
        title={`${editingOpStockRow ? 'Edit' : 'Add'} ${opStockMaterialType === 'raw_material' ? 'Raw Material' : 'Finished Good'} OP. Stock`}
      >
        {renderAdjustmentForm({
          errors: errorsOpStock,
          filteredOptions: filteredOpStockItemOptions,
          handleSubmit: handleOpStockSubmit,
          onSubmit: onOpStockSubmit,
          register: registerOpStock,
          setOpen: closeOpStockForm,
          submitLabel: editingOpStockRow ? 'Update OP. Stock' : 'Save OP. Stock',
          itemLabel: opStockMaterialType === 'raw_material' ? 'Item Name' : 'Product Name',
          quantityLabel: 'OP. Stock',
          showStatus: false,
          showRemark: false,
          lockItemSelection: Boolean(editingOpStockRow),
          minimumQuantity: 0
        })}
      </Modal>
    </div>
  );
};

export default StockAdjustment;
