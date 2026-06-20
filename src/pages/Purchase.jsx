import React, { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import { TableSkeleton } from '../components/Skeleton';
import { ShoppingCart, Calendar, FileText, Plus, Landmark, Calculator } from 'lucide-react';

const Purchase = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { register, handleSubmit, watch, control, reset, formState: { errors } } = useForm({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      invoiceNo: '',
      vendorName: '',
      branch: 'Main',
      itemName: 'Boulder (Raw)',
      qty: 0,
      rate: 0,
      gstRate: 5,
      unit: 'Ton'
    }
  });

  // Watch fields for automatic calculation
  const watchQty = useWatch({ control, name: 'qty', defaultValue: 0 });
  const watchRate = useWatch({ control, name: 'rate', defaultValue: 0 });
  const watchGst = useWatch({ control, name: 'gstRate', defaultValue: 5 });

  const taxableValue = Number(watchQty || 0) * Number(watchRate || 0);
  const gstAmount = taxableValue * (Number(watchGst || 0) / 100);
  const totalAmount = taxableValue + gstAmount;

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const data = await apiService.getPurchases();
      // Scoped view
      const filtered = user.branch === 'All' 
        ? data 
        : data.filter(p => {
            if (Array.isArray(user.branch)) {
              return user.branch.some(b => b.toLowerCase() === p.branch.toLowerCase());
            }
            return p.branch.toLowerCase() === user.branch?.toLowerCase();
          });
      setPurchaseHistory(filtered);
    } catch (e) {
      showError('Failed to fetch purchase logs');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await apiService.addPurchase({
        ...data,
        qty: Number(data.qty),
        rate: Number(data.rate),
        gstRate: Number(data.gstRate)
      });

      if (res.success) {
        showSuccess(`Inward transaction logged successfully. ${data.qty} ${data.unit} added to ${data.branch}.`);
        reset({
          date: new Date().toISOString().split('T')[0],
          invoiceNo: '',
          vendorName: '',
          branch: data.branch,
          itemName: data.itemName,
          qty: 0,
          rate: 0,
          gstRate: data.gstRate,
          unit: data.unit
        });
        setShowForm(false);
        fetchPurchases();
      }
    } catch (e) {
      showError(e.message || 'Failed to submit purchase log.');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { header: 'Invoice ID', accessor: 'purchaseId' },
    { header: 'Date', accessor: 'date' },
    { header: 'Invoice No', accessor: 'invoiceNo' },
    { header: 'Vendor Name', accessor: 'vendorName' },
    { header: 'Item', accessor: 'itemName' },
    { 
      header: 'Branch', 
      accessor: 'branch',
      render: (row) => (
        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-medium">
          {row.branch}
        </span>
      )
    },
    { 
      header: 'Qty', 
      accessor: 'qty',
      render: (row) => `${row.qty.toLocaleString()} ${row.unit}`
    },
    { 
      header: 'Taxable Value', 
      accessor: 'taxableValue',
      render: (row) => `₹${row.taxableValue.toLocaleString('en-IN')}`
    },
    { 
      header: 'GST Amount', 
      accessor: 'gstAmount',
      render: (row) => (
        <span className="text-slate-400">
          ₹{row.gstAmount.toLocaleString('en-IN')} <span className="text-[9px] font-normal opacity-70">({row.gstRate}%)</span>
        </span>
      )
    },
    { 
      header: 'Total Amount', 
      accessor: 'totalAmount',
      render: (row) => <span className="font-bold text-emerald-400">₹{row.totalAmount.toLocaleString('en-IN')}</span>
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-400" />
            <span>Material Inward Ledger (Purchase)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Log raw aggregates additions, supplier records, tax valuations, and invoice metadata.
          </p>
        </div>

        {user.role !== 'Viewer' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Plus className={`w-4.5 h-4.5 transition-transform duration-300 ${showForm ? 'rotate-45' : ''}`} />
            <span>{showForm ? 'Close Entry Form' : 'Log New Purchase'}</span>
          </button>
        )}
      </div>

      {/* Entry Form (Conditional) */}
      {showForm && (
        <GlassCard className="border border-indigo-500/10" glow>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <Landmark className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Purchase Inward Entry Fields</h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Invoice Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="date"
                    {...register('date', { required: 'Date is required' })}
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-lg glass-input"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Invoice Reference No</label>
                <input
                  type="text"
                  placeholder="e.g. INV-1004"
                  {...register('invoiceNo', { required: 'Invoice no is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
                {errors.invoiceNo && <span className="text-[10px] text-rose-400 font-medium">{errors.invoiceNo.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Supplier / Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Gupta Minerals Ltd"
                  {...register('vendorName', { required: 'Vendor is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
                {errors.vendorName && <span className="text-[10px] text-rose-400 font-medium">{errors.vendorName.message}</span>}
              </div>
            </div>

            {/* Middle Column Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Destination Branch</label>
                  <select
                    {...register('branch', { required: true })}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
                  >
                    {user.branch === 'All' ? (
                      ['Main', 'Madhya', 'Rkl', 'Purab'].map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))
                    ) : Array.isArray(user.branch) ? (
                      user.branch.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))
                    ) : (
                      <option value={user.branch}>{user.branch}</option>
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Item Unit</label>
                  <select
                    {...register('unit', { required: true })}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
                  >
                    <option value="Ton">Ton</option>
                    <option value="Litre">Litre</option>
                    <option value="Bag">Bag</option>
                    <option value="Units">Units</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Item Name</label>
                <select
                  {...register('itemName', { required: true })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
                >
                  <option value="Boulder (Raw)">Boulder (Raw)</option>
                  <option value="10mm Aggregate">10mm Aggregate</option>
                  <option value="20mm Aggregate">20mm Aggregate</option>
                  <option value="40mm Aggregate">40mm Aggregate</option>
                  <option value="WMM (Wet Mix Macadam)">WMM (Wet Mix Macadam)</option>
                  <option value="Crushed Sand / Dust">Crushed Sand / Dust</option>
                  <option value="Diesel">Diesel</option>
                  <option value="OPC Cement 43 Grade">OPC Cement 43 Grade</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Inward Qty</label>
                  <input
                    type="number"
                    placeholder="0"
                    {...register('qty', { required: 'Qty is required', min: 1 })}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Rate per Unit (₹)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    {...register('rate', { required: 'Rate is required', min: 1 })}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Invoice Calculation Review & Upload */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col justify-between">
              
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-400 border-b border-slate-800 pb-2">
                  <Calculator className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Autocalculator Details</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-slate-500">Taxable Value:</span>
                  <span className="font-semibold text-slate-300">₹{taxableValue.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">GST Percentage:</span>
                  <select
                    {...register('gstRate')}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px]"
                  >
                    {[5, 12, 18, 28].map(r => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">GST Amount:</span>
                  <span className="font-semibold text-slate-300">₹{gstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-800 text-sm">
                  <span className="font-bold text-slate-400">Total Valuation:</span>
                  <span className="font-extrabold text-emerald-400">₹{totalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Upload Invoice File Field (Placeholder) */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Upload Receipt/Invoice (Mock)</label>
                <div className="flex items-center justify-center border border-dashed border-slate-700 hover:border-indigo-500/40 rounded-lg p-2 transition-colors cursor-pointer bg-slate-900/30">
                  <FileText className="w-4 h-4 text-slate-500 mr-2" />
                  <span className="text-[10px] text-slate-400 font-medium">invoice_pdf_file.pdf</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3.5 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
                >
                  Submit Log
                </button>
              </div>

            </div>

          </form>
        </GlassCard>
      )}

      {/* History Ledger Table */}
      <GlassCard className="p-2 sm:p-6">
        {loading ? (
          <TableSkeleton rows={10} cols={10} />
        ) : (
          <Table
            columns={columns}
            data={purchaseHistory}
            searchPlaceholder="Search invoices, vendors, items..."
            filterKey="branch"
            filterOptions={['Main', 'Madhya', 'Rkl', 'Purab']}
            filterPlaceholder="Filter Branch"
            exportFileName="Purchase_ledger"
          />
        )}
      </GlassCard>

    </div>
  );
};

export default Purchase;
