import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useInventory';
import { apiService } from '../services/api';
import { supabase } from '../services/supabaseClient';
import Table from '../components/Table';
import Modal from '../components/Modal';
import GlassCard from '../components/GlassCard';
import { useToast } from '../components/Toast';
import { useForm, useWatch } from 'react-hook-form';
import { 
  Edit3, 
  Trash2, 
  ArrowRightLeft, 
  Check, 
  X, 
  AlertTriangle,
  FolderOpen,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';

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

const BranchInventory = () => {
  const { branchName: routeBranchName } = useParams();
  const location = useLocation();
  const { user, canAccessBranch } = useAuth();
  const { 
    loading, 
    inventoryItems, 
    fetchInventory, 
    addInventory, 
    updateInventory, 
    deleteInventory, 
    transferMaterial, 
    approveTransfer, 
    rejectTransfer 
  } = useInventory();
  const { showError } = useToast();

  // Tab control
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'transfers'

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Transfers logs
  const [transferRequests, setTransferRequests] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [rawFactoryEntries, setRawFactoryEntries] = useState([]);

  // Forms
  const { register: regAdd, handleSubmit: handleAddSubmit, reset: resetAdd, control: addControl, setValue: setAddValue, formState: { errors: errorsAdd } } = useForm();
  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, control: editControl, setValue: setEditValue, formState: { errors: errorsEdit } } = useForm();
  const { register: regTrans, handleSubmit: handleTransSubmit, reset: resetTrans, formState: { errors: errorsTrans } } = useForm();

  const branchOptions = ['Purab', 'Pmmpl', 'Rkl'];
  const routeType = location.pathname.startsWith('/finish-good') || location.pathname.startsWith('/finished-good') ? 'finish_good' : 'raw_material';
  const type = routeType;
  const [selectedBranch, setSelectedBranch] = useState(routeBranchName || '');
  const [selectedDate, setSelectedDate] = useState(()=>{
    const d = new Date();
    d.setDate(d.getDate()-1);
    return d.toISOString().split('T')[0];
  });
  const isFinishGood = type === 'finish_good';

  const accessibleBranchOptions = React.useMemo(() => {
    return branchOptions.filter(branch => canAccessBranch(branch, type));
  }, [type, canAccessBranch]);

  const branchFilterOptions = React.useMemo(() => {
    if (accessibleBranchOptions.length > 1) {
      return ['All', ...accessibleBranchOptions];
    }
    return accessibleBranchOptions;
  }, [accessibleBranchOptions]);

  const defaultBranch = branchFilterOptions[0] || routeBranchName || branchOptions[0];
  const activeBranch = selectedBranch || defaultBranch;
  const hasInventoryAccess = accessibleBranchOptions.length > 0;

  const canReadActiveBranch = React.useMemo(() => {
    if (activeBranch === 'All') {
      return hasInventoryAccess;
    }
    return accessibleBranchOptions.includes(activeBranch);
  }, [activeBranch, accessibleBranchOptions, hasInventoryAccess]);

  // User privileges
  const isEditable = activeBranch !== 'All' && canAccessBranch(activeBranch, type) && user?.role !== 'Viewer';

  useEffect(() => {
    if (routeBranchName) setSelectedBranch(routeBranchName);
  }, [routeBranchName, routeType]);

  useEffect(() => {
    if (!hasInventoryAccess) return;
    if (!branchFilterOptions.includes(activeBranch)) {
      setSelectedBranch(accessibleBranchOptions[0]);
    }
  }, [activeBranch, accessibleBranchOptions, branchFilterOptions, hasInventoryAccess]);

  useEffect(() => {
    if (!activeBranch || !canReadActiveBranch) return;
    fetchInventory(activeBranch, type, type === 'finish_good' ? selectedDate : '');
    fetchTransfers();
  }, [activeBranch, type, canReadActiveBranch, selectedDate]);

  useEffect(() => {
    if (type !== 'raw_material' || !activeBranch || !canReadActiveBranch) return undefined;

    const channel = supabase
      .channel(`inventory-master-${activeBranch}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_master' },
        () => fetchInventory(activeBranch, type)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBranch, type, canReadActiveBranch, fetchInventory]);

  useEffect(() => {
    if (type !== 'raw_material') return;
    fetchRawFactoryEntries();
  }, [type]);

  const addOptimumStock = useWatch({ control: addControl, name: 'optimum_stock' });
  const addActualLevel = useWatch({ control: addControl, name: 'actual_level' });
  const addProductRate = useWatch({ control: addControl, name: 'product_rate' });
  const editOptimumStock = useWatch({ control: editControl, name: 'optimum_stock' });
  const editActualLevel = useWatch({ control: editControl, name: 'actual_level' });
  const editProductRate = useWatch({ control: editControl, name: 'product_rate' });

  useEffect(() => {
    setAddValue('optimum_stock_total', calculateOptimumStockTotal(addOptimumStock, addProductRate));
    setAddValue('stock_total', calculateStockTotal(addActualLevel, addProductRate));
  }, [addOptimumStock, addActualLevel, addProductRate, setAddValue]);

  useEffect(() => {
    setEditValue('optimum_stock_total', calculateOptimumStockTotal(editOptimumStock, editProductRate));
    setEditValue('stock_total', calculateStockTotal(editActualLevel, editProductRate));
  }, [editOptimumStock, editActualLevel, editProductRate, setEditValue]);

  const fetchTransfers = async () => {
    setTransfersLoading(true);
    try {
      const data = await apiService.getTransfers();
      // Filter transfers relative to this branch / accessible branches
      const relativeTransfers = data.filter(t => {
        if (activeBranch === 'All') {
          return accessibleBranchOptions.some(b => 
            t.fromBranch.toLowerCase() === b.toLowerCase() || 
            t.toBranch.toLowerCase() === b.toLowerCase()
          );
        }
        return (
          t.fromBranch.toLowerCase() === activeBranch.toLowerCase() || 
          t.toBranch.toLowerCase() === activeBranch.toLowerCase()
        );
      });
      setTransferRequests(relativeTransfers);
    } catch (e) {
      console.error('Failed to load transfers:', e);
    } finally {
      setTransfersLoading(false);
    }
  };

  const fetchRawFactoryEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_adjustment')
        .select('firm_name, item_name, qty, status, material_type');

      if (error) throw error;
      setRawFactoryEntries(data || []);
    } catch (e) {
      showError(e.message || 'Failed to load raw material factory entries.');
    }
  };

  // Add Item Submit
  const onAddSubmit = async (data) => {
    const success = await addInventory(activeBranch, {
      s_no: data.s_no,
      item_name: data.item_name,
      annu_con: data.annu_con,
      d_con: data.d_con,
      sf: data.sf,
      lead_time: data.lead_time,
      max_stock: data.max_stock,
      optimum_stock: data.optimum_stock,
      actual_level: data.actual_level,
      product_rate: data.product_rate,
      optimum_stock_total: data.optimum_stock_total,
      stock_total: data.stock_total,
      unit: data.unit,
      colour: data.colour
    });
    if (success) {
      setAddModalOpen(false);
      resetAdd();
    }
  };

  // Edit Item Trigger
  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditValue('s_no', item.s_no);
    setEditValue('item_name', item.item_name);
    setEditValue('annu_con', item.annu_con);
    setEditValue('d_con', item.d_con);
    setEditValue('sf', item.sf);
    setEditValue('lead_time', item.lead_time);
    setEditValue('max_stock', item.max_stock);
    setEditValue('optimum_stock', item.optimum_stock);
    setEditValue('actual_level', item.actual_level);
    setEditValue('product_rate', item.product_rate);
    setEditValue('optimum_stock_total', item.optimum_stock_total);
    setEditValue('stock_total', item.stock_total);
    setEditValue('unit', item.unit);
    setEditValue('colour', item.colour);
    setEditModalOpen(true);
  };

  // Edit Item Submit
  const onEditSubmit = async (data) => {
    if (!selectedItem) return;
    const success = await updateInventory(activeBranch, selectedItem.id || selectedItem.itemId, {
      s_no: data.s_no,
      item_name: data.item_name,
      annu_con: data.annu_con,
      d_con: data.d_con,
      sf: data.sf,
      lead_time: data.lead_time,
      max_stock: data.max_stock,
      optimum_stock: data.optimum_stock,
      actual_level: data.actual_level,
      product_rate: data.product_rate,
      optimum_stock_total: data.optimum_stock_total,
      stock_total: data.stock_total,
      unit: data.unit,
      colour: data.colour
    });
    if (success) {
      setEditModalOpen(false);
      setSelectedItem(null);
      resetEdit();
    }
  };

  // Delete Action
  const handleDelete = async (itemId, itemName) => {
    if (window.confirm(`Are you sure you want to permanently delete "${itemName}" from ${activeBranch} stock registry?`)) {
      await deleteInventory(activeBranch, itemId);
    }
  };

  // Transfer Submit
  const onTransferSubmit = async (data) => {
    if (!selectedItem) return;
    const success = await transferMaterial({
      fromBranch: activeBranch,
      toBranch: data.toBranch,
      itemName: selectedItem.item_name || selectedItem.itemName,
      qty: Number(data.qty),
      unit: selectedItem.unit
    });
    if (success) {
      setTransferModalOpen(false);
      setSelectedItem(null);
      resetTrans();
      fetchTransfers();
    }
  };

  const handleApproveTransfer = async (tId) => {
    const success = await approveTransfer(tId);
    if (success) {
      fetchTransfers();
      fetchInventory(activeBranch, type);
    }
  };

  const handleRejectTransfer = async (tId) => {
    const success = await rejectTransfer(tId);
    if (success) {
      fetchTransfers();
    }
  };

  // ── Finish Good Columns (per-branch) ─────────────────────────────────────
  const renderFinishGoodNumber = (value) => value !== null && value !== undefined && value !== '' ? Number(value).toLocaleString() : '-';

  const finishGoodColumns = [
    { header: 'S.N.', accessor: '_sn', render: (row, rowIndex) => rowIndex + 1 },
    { header: 'Firm Name', accessor: 'firm_name' },
    { header: 'Product Name', accessor: 'product_name' },
    { header: 'Op. Stock', accessor: 'op_stock', render: (row) => renderFinishGoodNumber(row.op_stock) },
    { header: 'Stock Adjustment', accessor: 'stock_adjustment', render: (row) => renderFinishGoodNumber(row.stock_adjustment) },
    { header: 'Sales Order Pending', accessor: 'sales_order_pending', render: (row) => renderFinishGoodNumber(row.sales_order_pending) },
    { header: 'Purchase Material Received', accessor: 'purchase_material_received', render: (row) => renderFinishGoodNumber(row.purchase_material_received) },
    { header: 'Production', accessor: 'production', render: (row) => renderFinishGoodNumber(row.production) },
    { header: 'Sales', accessor: 'sales', render: (row) => renderFinishGoodNumber(row.sales) },
    { header: 'Sales Return', accessor: 'sales_return', render: (row) => renderFinishGoodNumber(row.sales_return) },
    { header: 'Consumption', accessor: 'consumption', render: (row) => renderFinishGoodNumber(row.consumption) },
    { header: 'Current Level', accessor: 'current_level', render: (row) => renderFinishGoodNumber(row.current_level) },
  ];

  const renderRawNumber = (value) => value !== null && value !== undefined && value !== '' ? Number(value).toLocaleString() : '';
  const renderRawCurrency = (value) => value !== null && value !== undefined && value !== '' ? `₹${Number(value).toLocaleString()}` : '';

  // Raw Material Columns
  const rawMaterialColumns = [
    { header: 'S. No.', accessor: 's_no', render: (row) => row.s_no ?? '' },
    { header: 'Firm Name', accessor: 'firm_name' },
    { header: 'Item Name', accessor: 'item_name' },
    { header: 'Unit', accessor: 'unit' },
    { header: 'Annu. Con', accessor: 'annu_con', render: (row) => renderRawNumber(row.annu_con) },
    { header: 'D. Con', accessor: 'd_con', render: (row) => renderRawNumber(row.d_con) },
    { header: 'S.F', accessor: 'sf', render: (row) => renderRawNumber(row.sf) },
    { header: 'Lead Time', accessor: 'lead_time', render: (row) => row.lead_time !== null && row.lead_time !== undefined && row.lead_time !== '' ? `${Number(row.lead_time).toLocaleString()} days` : '' },
    { header: 'Max Stock', accessor: 'max_stock', render: (row) => renderRawNumber(row.max_stock) },
    { header: 'Optimum Stock', accessor: 'optimum_stock', render: (row) => renderRawNumber(row.optimum_stock) },
    { header: 'Actual Level', accessor: 'actual_level', render: (row) => renderRawNumber(row.actual_level) },
    { header: 'Product Rate', accessor: 'product_rate', render: (row) => renderRawCurrency(row.product_rate) },
    { header: 'Optimum Stock Total', accessor: 'optimum_stock_total', render: (row) => renderRawCurrency(row.optimum_stock_total) },
    { header: 'Stock Total', accessor: 'stock_total', render: (row) => renderRawCurrency(row.stock_total) },
    { 
      header: 'Colour', 
      accessor: 'colour',
      render: (row) => {
        if (row.colour === 'Low') {
          return (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white uppercase tracking-wider">
              Low
            </span>
          );
        } else if (row.colour === 'Optimum') {
          return (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
              Optimum
            </span>
          );
        } else if (row.colour === 'Extra') {
          return (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950 uppercase tracking-wider">
              Extra
            </span>
          );
        } else {
          return row.colour ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
              {row.colour}
            </span>
          ) : (
            <span className="text-slate-500">-</span>
          );
        }
      }
    },
  ];

  // Process data to compute status for each row
  const processedInventoryItems = React.useMemo(() => {
    if (type !== 'raw_material') return inventoryItems;
    const rawAdjustments = rawFactoryEntries.filter(entry => !entry.material_type || entry.material_type === 'raw_material');
    const adjustmentByItem = rawAdjustments.reduce((acc, entry) => {
      const firmKey = entry.firm_name?.trim().toLowerCase() || '*';
      const itemKey = entry.item_name?.trim().toLowerCase();
      if (!itemKey) return acc;

      const qty = Number(entry.qty || 0);
      const key = `${firmKey}::${itemKey}`;
      acc[key] = (acc[key] || 0) + (entry.status === 'Factory -' ? -qty : qty);
      return acc;
    }, {});

    return inventoryItems.map(item => {
      const firmKey = item.firm_name?.trim().toLowerCase();
      const itemKey = item.item_name?.trim().toLowerCase();
      const firmAdjustment = adjustmentByItem[`${firmKey}::${itemKey}`] || 0;
      const legacyAdjustment = adjustmentByItem[`*::${itemKey}`] || 0;
      const adjustedActualLevel = item.actual_level != null
        ? Number(item.actual_level) + firmAdjustment + legacyAdjustment
        : item.actual_level;
      const actual = adjustedActualLevel != null ? Number(adjustedActualLevel) : null;
      const optimum = item.optimum_stock != null ? Number(item.optimum_stock) : null;
      const max = item.max_stock != null ? Number(item.max_stock) : null;

      let status = '';
      if (actual !== null && optimum !== null && max !== null && optimum !== 0 && max !== 0) {
        if (actual < optimum) {
          status = 'Low';
        } else if (actual >= optimum && actual <= max) {
          status = 'Optimum';
        } else {
          status = 'Extra';
        }
      } else {
        status = item.colour || '';
      }

      return {
        ...item,
        actual_level: adjustedActualLevel,
        colour: status
      };
    });
  }, [inventoryItems, rawFactoryEntries, type]);

  const displayedInventoryItems = React.useMemo(() => {
    const filtered = (processedInventoryItems || []).filter(item => {
      const firmName = item.firm_name || '';
      const normFirm = firmName.toLowerCase().trim() === 'madhya' ? 'pmmpl' : firmName.toLowerCase().trim();
      return accessibleBranchOptions.some(b => {
        const normB = b.toLowerCase().trim() === 'madhya' ? 'pmmpl' : b.toLowerCase().trim();
        return normFirm === normB;
      });
    });

    if (isFinishGood) {
      // Rows with any meaningful data come first, empty rows at the bottom
      const hasData = (item) => {
        const fields = ['op_stock', 'production', 'sales', 'sales_return', 'consumption', 'current_level', 'purchase_material_received', 'stock_adjustment', 'sales_order_pending'];
        return fields.some(f => item[f] !== null && item[f] !== undefined && Number(item[f]) !== 0);
      };
      return [...filtered].sort((a, b) => {
        const aHas = hasData(a) ? 0 : 1;
        const bHas = hasData(b) ? 0 : 1;
        return aHas - bHas;
      });
    }

    return filtered;
  }, [processedInventoryItems, accessibleBranchOptions, isFinishGood]);

  // Pick correct column set
  const inventoryColumns = isFinishGood ? finishGoodColumns : rawMaterialColumns;

  // Transfer Requests Table Columns
  const transferColumns = [
    { header: 'Request ID', accessor: 'transferId' },
    { header: 'Material', accessor: 'itemName' },
    { 
      header: 'Quantity', 
      accessor: 'qty',
      render: (row) => <span className="font-semibold text-slate-200">{row.qty} {row.unit}</span>
    },
    { 
      header: 'Direction', 
      accessor: 'fromBranch',
      render: (row) => {
        const isOutbound = row.fromBranch.toLowerCase() === activeBranch.toLowerCase();
        return (
          <div className="flex items-center gap-1.5 text-[11px]">
            {isOutbound ? (
              <span className="text-rose-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Outbound to {row.toBranch}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" /> Inbound from {row.fromBranch}
              </span>
            )}
          </div>
        );
      }
    },
    { 
      header: 'Status', 
      accessor: 'status',
      render: (row) => {
        const styleMap = {
          Pending: 'bg-amber-950 text-amber-400 border-amber-500/20',
          Approved: 'bg-emerald-950 text-emerald-400 border-emerald-500/20',
          Rejected: 'bg-rose-950 text-rose-400 border-rose-500/20',
          Failed: 'bg-slate-800 text-slate-500 border-slate-700'
        };
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styleMap[row.status] || ''}`}>
            {row.status}
          </span>
        );
      }
    },
    {
      header: 'Authorizer',
      accessor: 'approvedBy',
      render: (row) => row.approvedBy ? <span className="font-mono text-slate-400">{row.approvedBy}</span> : <span className="text-slate-600">-</span>
    },
    {
      header: 'Approvals',
      sortable: false,
      render: (row) => {
        const isInbound = row.toBranch.toLowerCase() === activeBranch.toLowerCase();
        const canApprove = (user?.role === 'Admin' || (user?.role === 'Branch Manager' && isInbound)) && row.status === 'Pending';

        return (
          <div className="flex items-center gap-1.5">
            {canApprove ? (
              <>
                <button
                  onClick={() => handleApproveTransfer(row.transferId)}
                  className="px-2 py-1 rounded bg-emerald-900/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-800 flex items-center gap-0.5 cursor-pointer text-[10px]"
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => handleRejectTransfer(row.transferId)}
                  className="px-2 py-1 rounded bg-rose-900/40 border border-rose-500/20 text-rose-400 hover:bg-rose-800 flex items-center gap-0.5 cursor-pointer text-[10px]"
                >
                  <X className="w-3 h-3" /> Reject
                </button>
              </>
            ) : (
              <span className="text-[10px] text-slate-500 italic">
                {row.status === 'Pending' ? 'Awaiting verification' : 'Complete'}
              </span>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Title block with Firm actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>{activeBranch === 'All' ? 'All Firms' : `${activeBranch} Firm`} {isFinishGood ? 'Finish Good' : 'Raw Material'}</span>
            {!isEditable && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-500 font-medium tracking-normal select-none">
                Read-only
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Realtime database entries synced for the {activeBranch === 'All' ? 'all firms' : activeBranch} {isFinishGood ? 'finish goods' : 'raw materials'} stocks.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-start sm:items-center">
          {isFinishGood && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium shrink-0">Opening Stock Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg glass-input bg-slate-900 text-slate-100 outline-none border border-slate-700/50 focus:border-indigo-500"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="px-2.5 py-2 text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/20 rounded-lg cursor-pointer"
                  title="Clear Date Filter"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <select
            value={activeBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            disabled={!hasInventoryAccess}
            className="min-w-[170px] px-3 py-2 text-xs rounded-lg glass-input bg-slate-900 disabled:opacity-60"
          >
            {branchFilterOptions.map(branch => (
              <option key={branch} value={branch}>{branch === 'All' ? 'All Firms' : `${branch} Firm`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Tab Renderings */}
      <GlassCard className="p-2 sm:p-6">
        {hasInventoryAccess ? (
          <Table
            columns={inventoryColumns}
            data={displayedInventoryItems}
            searchPlaceholder="Search materials by name or colour..."
            filterKey="colour"
            filterOptions={['Low', 'Optimum', 'Extra']}
            filterPlaceholder="Filter Status"
            exportFileName={`${activeBranch}_${type}_inventory`}
          />
        ) : (
          <div className="py-12 text-center text-sm text-slate-400">
            You do not have access to any firm for this inventory type.
          </div>
        )}
      </GlassCard>

      {/* MODAL: ADD MATERIAL */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={`Register New Material to ${activeBranch}`}
      >
        <form onSubmit={handleAddSubmit(onAddSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">S. No.</label>
              <input
                type="number"
                placeholder="e.g. 1"
                {...regAdd('s_no')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Item Name</label>
              <input
                type="text"
                placeholder="e.g. CBXT 89 (0-1)"
                {...regAdd('item_name', { required: 'Item Name is required' })}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
              {errorsAdd.item_name && <span className="text-[10px] text-rose-400 font-medium">{errorsAdd.item_name.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Unit</label>
              <input
                type="text"
                placeholder="e.g. MT, Ton"
                {...regAdd('unit', { required: 'Unit is required' })}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
              {errorsAdd.unit && <span className="text-[10px] text-rose-400 font-medium">{errorsAdd.unit.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Annual Con</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('annu_con')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Daily Con</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('d_con')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Safety Factor (S.F)</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('sf')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Lead Time (days)</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('lead_time')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Max Stock</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('max_stock')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Optimum Stock</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('optimum_stock')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Actual Level</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('actual_level')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Product Rate</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regAdd('product_rate')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Optimum Stock Total</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                readOnly
                {...regAdd('optimum_stock_total')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input cursor-not-allowed opacity-80"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Stock Total</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                readOnly
                {...regAdd('stock_total')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input cursor-not-allowed opacity-80"
              />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Colour (Status)</label>
              <input
                type="text"
                placeholder="e.g. Excess Stock"
                {...regAdd('colour')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
            >
              Save Material
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: EDIT STOCK METRICS */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedItem(null);
        }}
        title={`Adjust Metrics: ${selectedItem?.item_name || selectedItem?.itemName}`}
      >
        <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">S. No.</label>
              <input
                type="number"
                placeholder="e.g. 1"
                {...regEdit('s_no')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Item Name</label>
              <input
                type="text"
                placeholder="e.g. CBXT 89 (0-1)"
                {...regEdit('item_name', { required: 'Item Name is required' })}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
              {errorsEdit.item_name && <span className="text-[10px] text-rose-400 font-medium">{errorsEdit.item_name.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Unit</label>
              <input
                type="text"
                placeholder="e.g. MT, Ton"
                {...regEdit('unit', { required: 'Unit is required' })}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
              {errorsEdit.unit && <span className="text-[10px] text-rose-400 font-medium">{errorsEdit.unit.message}</span>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Annual Con</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('annu_con')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Daily Con</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('d_con')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Safety Factor (S.F)</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('sf')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Lead Time (days)</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('lead_time')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Max Stock</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('max_stock')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Optimum Stock</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('optimum_stock')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Actual Level</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('actual_level')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Product Rate</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                {...regEdit('product_rate')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Optimum Stock Total</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                readOnly
                {...regEdit('optimum_stock_total')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input cursor-not-allowed opacity-80"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Stock Total</label>
              <input
                type="number"
                step="any"
                placeholder="0"
                readOnly
                {...regEdit('stock_total')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input cursor-not-allowed opacity-80"
              />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Colour (Status)</label>
              <input
                type="text"
                placeholder="e.g. Excess Stock"
                {...regEdit('colour')}
                className="w-full px-3 py-2 text-xs rounded-lg glass-input"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
            >
              Apply Updates
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: SUBMIT TRANSFER REQUEST */}
      <Modal
        isOpen={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setSelectedItem(null);
        }}
        title={`Transfer: ${selectedItem?.item_name || selectedItem?.itemName}`}
      >
        <form onSubmit={handleTransSubmit(onTransferSubmit)} className="space-y-4">
          <div className="p-3 bg-indigo-950/20 border border-indigo-500/10 rounded-lg text-xs space-y-1.5 text-indigo-300">
            <p>From Firm: <strong className="text-white">{activeBranch}</strong></p>
            <p>Available Material: <strong className="text-white">{selectedItem?.actual_level || selectedItem?.currentStock} {selectedItem?.unit}</strong></p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Destination Firm</label>
            <select
              {...regTrans('toBranch', { required: 'Please select destination firm' })}
              className="w-full px-3 py-2.5 text-xs rounded-lg glass-input appearance-none bg-slate-900"
            >
              <option value="">Choose Firm...</option>
              {['Pmmpl', 'Rkl', 'Purab']
                .filter(b => b.toLowerCase() !== activeBranch.toLowerCase())
                .map(b => (
                  <option key={b} value={b}>{b} Firm</option>
                ))
              }
            </select>
            {errorsTrans.toBranch && <span className="text-[10px] text-rose-400 font-medium">{errorsTrans.toBranch.message}</span>}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Quantity to Dispatch</label>
            <div className="relative">
              <input
                type="number"
                placeholder="0"
                {...regTrans('qty', { 
                  required: 'Quantity is required', 
                  min: { value: 1, message: 'Transfer quantity must exceed 0' },
                  validate: (v) => Number(v) <= Number(selectedItem?.actual_level || selectedItem?.currentStock) || 'Quantity exceeds active branch stock level'
                })}
                className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-500">
                {selectedItem?.unit}
              </span>
            </div>
            {errorsTrans.qty && <span className="text-[10px] text-rose-400 font-medium">{errorsTrans.qty.message}</span>}
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => setTransferModalOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer"
            >
              Request Transfer
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default BranchInventory;
