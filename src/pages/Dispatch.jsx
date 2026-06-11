import React, { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { Send, FileText, Plus, ShoppingBag, ShieldAlert, Receipt, Printer } from 'lucide-react';

const Dispatch = () => {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const [dispatchHistory, setDispatchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  
  // Available stock checking state
  const [branchStocks, setBranchStocks] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);

  const { register, handleSubmit, watch, control, reset, formState: { errors } } = useForm({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      invoiceNo: '',
      customerName: '',
      destination: '',
      branch: 'Main',
      itemName: '10mm Aggregate',
      qty: 0,
      rate: 0,
      unit: 'Ton'
    }
  });

  const selectedBranch = watch('branch');
  const selectedItemName = watch('itemName');

  const watchQty = useWatch({ control, name: 'qty', defaultValue: 0 });
  const watchRate = useWatch({ control, name: 'rate', defaultValue: 0 });
  const totalAmount = Number(watchQty || 0) * Number(watchRate || 0);

  // Fetch stocks when selected branch updates
  useEffect(() => {
    fetchBranchInventory(selectedBranch);
  }, [selectedBranch]);

  useEffect(() => {
    fetchDispatches();
  }, []);

  const fetchDispatches = async () => {
    setLoading(true);
    try {
      const data = await apiService.getDispatches();
      const filtered = user.branch === 'All' 
        ? data 
        : data.filter(d => {
            if (Array.isArray(user.branch)) {
              return user.branch.some(b => b.toLowerCase() === d.branch.toLowerCase());
            }
            return d.branch.toLowerCase() === user.branch?.toLowerCase();
          });
      setDispatchHistory(filtered);
    } catch (e) {
      showError('Failed to fetch dispatch records');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchInventory = async (bName) => {
    if (!bName) return;
    setStocksLoading(true);
    try {
      const items = await apiService.getInventory(bName);
      setBranchStocks(items);
    } catch (e) {
      console.error(e);
    } finally {
      setStocksLoading(false);
    }
  };

  // Find currently selected stock level
  const activeStock = branchStocks?.find(i => i?.itemName && selectedItemName && i.itemName.toLowerCase() === selectedItemName.toLowerCase());

  const onSubmit = async (data) => {
    // 1. Verify stock availability locally first
    if (!activeStock || activeStock.currentStock < Number(data.qty)) {
      showWarning(`Insufficient stock of ${data.itemName} in ${data.branch} branch. (Available: ${activeStock ? activeStock.currentStock : 0})`);
      return;
    }

    setLoading(true);
    try {
      const res = await apiService.addDispatch({
        ...data,
        qty: Number(data.qty),
        rate: Number(data.rate)
      });

      if (res.success) {
        showSuccess(`Outward dispatch invoice logged successfully.`);
        reset({
          date: new Date().toISOString().split('T')[0],
          invoiceNo: '',
          customerName: '',
          destination: '',
          branch: data.branch,
          itemName: data.itemName,
          qty: 0,
          rate: 0,
          unit: data.unit
        });
        setShowForm(false);
        fetchDispatches();
        fetchBranchInventory(data.branch); // refresh cache
      }
    } catch (e) {
      showError(e.message || 'Failed to submit dispatch log');
    } finally {
      setLoading(false);
    }
  };

  const openInvoiceModal = (invoice) => {
    setSelectedInvoice(invoice);
    setInvoiceModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const columns = [
    { header: 'Dispatch ID', accessor: 'dispatchId' },
    { header: 'Date', accessor: 'date' },
    { header: 'Invoice No', accessor: 'invoiceNo' },
    { header: 'Customer Name', accessor: 'customerName' },
    { header: 'Item', accessor: 'itemName' },
    { 
      header: 'Branch Source', 
      accessor: 'branch',
      render: (row) => (
        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-medium">
          {row.branch}
        </span>
      )
    },
    { 
      header: 'Qty Outward', 
      accessor: 'qty',
      render: (row) => `${row.qty.toLocaleString()} ${row.unit}`
    },
    { 
      header: 'Sales Valuation', 
      accessor: 'totalAmount',
      render: (row) => <span className="font-bold text-slate-200">₹{row.totalAmount.toLocaleString('en-IN')}</span>
    },
    {
      header: 'Actions',
      sortable: false,
      render: (row) => (
        <button
          onClick={() => openInvoiceModal(row)}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-900/40 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-800 transition-colors text-[10px] font-semibold cursor-pointer"
        >
          <Receipt className="w-3 h-3" />
          <span>View Invoice</span>
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Send className="w-5 h-5 text-indigo-400" />
            <span>Material Outward Ledger (Dispatch)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Track material deliveries, customer billing, and issue official transport receipts.
          </p>
        </div>

        {user.role !== 'Viewer' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Plus className={`w-4.5 h-4.5 transition-transform duration-300 ${showForm ? 'rotate-45' : ''}`} />
            <span>{showForm ? 'Close Entry Form' : 'Log Material Outward'}</span>
          </button>
        )}
      </div>

      {/* Entry Form (Conditional) */}
      {showForm && (
        <GlassCard className="border border-indigo-500/10" glow>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <ShoppingBag className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Outward Dispatch entry</h3>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Dispatch Date</label>
                <input
                  type="date"
                  {...register('date', { required: 'Date is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Bill/Invoice Number</label>
                <input
                  type="text"
                  placeholder="e.g. DISP-1093"
                  {...register('invoiceNo', { required: 'Invoice no is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
                {errors.invoiceNo && <span className="text-[10px] text-rose-400 font-medium">{errors.invoiceNo.message}</span>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. NHAI Contractor Group"
                  {...register('customerName', { required: 'Customer name is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
                {errors.customerName && <span className="text-[10px] text-rose-400 font-medium">{errors.customerName.message}</span>}
              </div>
            </div>

            {/* Middle Column Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Destination Address</label>
                <input
                  type="text"
                  placeholder="e.g. NH-16 Site Junction"
                  {...register('destination', { required: 'Destination is required' })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                />
                {errors.destination && <span className="text-[10px] text-rose-400 font-medium">{errors.destination.message}</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Source Branch</label>
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
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Unit</label>
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
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Material to Dispatch</label>
                <select
                  {...register('itemName', { required: true })}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
                >
                  <option value="10mm Aggregate">10mm Aggregate</option>
                  <option value="20mm Aggregate">20mm Aggregate</option>
                  <option value="40mm Aggregate">40mm Aggregate</option>
                  <option value="WMM (Wet Mix Macadam)">WMM (Wet Mix Macadam)</option>
                  <option value="Crushed Sand / Dust">Crushed Sand / Dust</option>
                  <option value="Boulder (Raw)">Boulder (Raw)</option>
                  <option value="Diesel">Diesel</option>
                  <option value="OPC Cement 43 Grade">OPC Cement 43 Grade</option>
                </select>
              </div>
            </div>

            {/* Right Column: Live Stock Validation & Calculation Review */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col justify-between">
              
              <div className="space-y-4">
                
                {/* Live Stock Check Indicator */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Branch Stock Availability</span>
                  {stocksLoading ? (
                    <div className="h-10 flex items-center justify-center text-xs text-slate-500">Checking stock levels...</div>
                  ) : activeStock ? (
                    <div className={`p-2.5 rounded-lg text-xs flex justify-between items-center ${
                      activeStock.currentStock <= activeStock.minThreshold
                        ? 'bg-amber-950/20 border border-amber-500/20 text-amber-300'
                        : 'bg-emerald-950/20 border border-emerald-500/20 text-emerald-300'
                    }`}>
                      <div>
                        <span className="font-semibold text-slate-300">{selectedItemName}</span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Alert Level: {activeStock.minThreshold} {activeStock.unit}</p>
                      </div>
                      <div className="text-right">
                        <strong className="text-sm font-bold block">{activeStock.currentStock}</strong>
                        <span className="text-[10px] text-slate-500">{activeStock.unit} available</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Item not registered in {selectedBranch} branch!</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Quantity Out</label>
                    <input
                      type="number"
                      placeholder="0"
                      {...register('qty', { required: true, min: 1 })}
                      className="w-full px-3 py-2 text-xs rounded-lg glass-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Billing Rate (₹)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      {...register('rate', { required: true, min: 1 })}
                      className="w-full px-3 py-2 text-xs rounded-lg glass-input"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t border-slate-800 text-xs">
                  <span className="font-semibold text-slate-500">Invoice Total:</span>
                  <span className="font-bold text-slate-200">₹{totalAmount.toLocaleString('en-IN')}</span>
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
                  disabled={loading || stocksLoading}
                  className="px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
                >
                  Confirm Dispatch
                </button>
              </div>

            </div>

          </form>
        </GlassCard>
      )}

      {/* History Grid */}
      <GlassCard className="p-6">
        <Table
          columns={columns}
          data={dispatchHistory}
          searchPlaceholder="Search invoices, customers, items..."
          filterKey="branch"
          filterOptions={['Main', 'Madhya', 'Rkl', 'Purab']}
          filterPlaceholder="Filter Source Branch"
          exportFileName="Dispatch_ledger"
        />
      </GlassCard>

      {/* INVOICE PREVIEW MODAL */}
      <Modal
        isOpen={invoiceModalOpen}
        onClose={() => {
          setInvoiceModalOpen(false);
          setSelectedInvoice(null);
        }}
        size="lg"
        title="Delivery Invoice Preview"
      >
        {selectedInvoice && (
          <div className="space-y-6">
            
            {/* Print Header controls */}
            <div className="flex justify-end gap-2 border-b border-slate-800 pb-3 noprint">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print/Save PDF</span>
              </button>
            </div>

            {/* Printable Frame Area */}
            <div id="invoice-print-area" className="p-8 rounded-xl bg-white text-slate-900 border border-slate-200 text-xs font-sans">
              
              {/* Invoice Layout styling */}
              <style dangerouslySetInnerHTML={{__html: `
                @media print {
                  body * { visibility: hidden; }
                  #invoice-print-area, #invoice-print-area * { visibility: visible; }
                  #invoice-print-area {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    padding: 0;
                    margin: 0;
                    border: none;
                    background-color: white !important;
                    color: black !important;
                  }
                  .noprint { display: none !important; }
                }
              `}} />

              {/* Company Logo and Meta */}
              <div className="flex justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-lg font-bold uppercase tracking-wide">PMMPL Mining & Infra Pvt Ltd</h1>
                  <p className="text-[10px] text-slate-500 mt-0.5">Mining Sector Zone A, Jharsuguda, Odisha</p>
                  <p className="text-[10px] text-slate-500">GSTIN: 22AAAAA0000A1Z5</p>
                </div>
                <div className="text-right">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Transport Invoice</h2>
                  <p className="font-bold text-[11px] text-slate-800 mt-1">NO: {selectedInvoice.invoiceNo}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">Date: {selectedInvoice.date}</p>
                </div>
              </div>

              {/* Client & Destination Info */}
              <div className="grid grid-cols-2 gap-6 my-6">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h3 className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1">Billed To (Customer)</h3>
                  <p className="font-bold text-slate-800">{selectedInvoice.customerName}</p>
                  <p className="text-slate-500 mt-0.5">Recipient Delivery Project Account</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <h3 className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1">Transport Destination</h3>
                  <p className="font-semibold text-slate-700">{selectedInvoice.destination}</p>
                  <p className="text-slate-500 mt-0.5">Shipped from: <strong className="text-slate-700">{selectedInvoice.branch} Branch</strong></p>
                </div>
              </div>

              {/* Invoice Materials Table */}
              <table className="w-full text-left my-6 border-collapse">
                <thead>
                  <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                    <th className="p-2.5">Item ID</th>
                    <th className="p-2.5">Description of Goods</th>
                    <th className="p-2.5 text-right">Quantity</th>
                    <th className="p-2.5 text-right">Unit Rate (₹)</th>
                    <th className="p-2.5 text-right">Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2.5 font-mono">{selectedInvoice.dispatchId}</td>
                    <td className="p-2.5 font-semibold text-slate-800">{selectedInvoice.itemName}</td>
                    <td className="p-2.5 text-right font-medium">{selectedInvoice.qty.toLocaleString()} {selectedInvoice.unit}</td>
                    <td className="p-2.5 text-right font-medium">₹{selectedInvoice.rate.toLocaleString('en-IN')}</td>
                    <td className="p-2.5 text-right font-bold text-slate-800">₹{selectedInvoice.totalAmount.toLocaleString('en-IN')}</td>
                  </tr>
                </tbody>
              </table>

              {/* Sum Summary footer */}
              <div className="flex justify-end mt-10">
                <div className="w-64 space-y-2 border-t border-slate-300 pt-3 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-slate-800">₹{selectedInvoice.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Tax (GST Inclusive):</span>
                    <span className="font-semibold text-slate-800">₹0.00</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-900 pt-2 text-sm">
                    <span className="font-bold text-slate-800">Grand Total:</span>
                    <span className="font-extrabold text-slate-950">₹{selectedInvoice.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Declaration notes */}
              <div className="mt-16 border-t border-slate-200 pt-4 flex justify-between items-end text-[9px] text-slate-400">
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-500">Terms & Declarations</p>
                  <p className="mt-1">1. Goods once sold will not be returned or exchanged.</p>
                  <p>2. Transport is subject to weather conditions and state mining approvals.</p>
                </div>
                <div className="text-center w-40">
                  <div className="h-10 border-b border-slate-300 w-full" />
                  <p className="mt-1 text-slate-500 font-semibold uppercase">Authorized Signatory</p>
                </div>
              </div>

            </div>

          </div>
        )}
      </Modal>

    </div>
  );
};

export default Dispatch;
