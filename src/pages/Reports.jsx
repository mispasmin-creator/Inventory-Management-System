import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import { FileBarChart, Filter, Calendar, Printer, Download, Eye } from 'lucide-react';

const Reports = () => {
  const { user } = useAuth();
  const { showError, showInfo } = useToast();
  
  // States
  const [reportType, setReportType] = useState('inventory'); // 'inventory' | 'purchase' | 'dispatch' | 'ledger'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(user.branch === 'All' ? 'Main' : (Array.isArray(user.branch) ? user.branch[0] : user.branch));
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Loaded raw reports databases
  const [rawInventory, setRawInventory] = useState([]);
  const [rawPurchases, setRawPurchases] = useState([]);
  const [rawDispatches, setRawDispatches] = useState([]);
  const [rawTransfers, setRawTransfers] = useState([]);
  const [rawCrushing, setRawCrushing] = useState([]);
  const [generating, setGenerating] = useState(false);

  // Generated results
  const [reportData, setReportData] = useState([]);

  useEffect(() => {
    loadDatabase();
  }, []);

  const loadDatabase = async () => {
    try {
      const reports = await apiService.getReports();
      setRawPurchases(reports.purchases);
      setRawDispatches(reports.dispatches);
      setRawTransfers(reports.transfers);
      setRawCrushing(reports.crushing);

      // Load inventory for selected branch
      const items = await apiService.getInventory('All');
      setRawInventory(items);
    } catch (e) {
      showError('Failed to load reports registries');
    }
  };

  const handleGenerate = () => {
    setGenerating(true);
    let result = [];

    const branchFilter = (row) => {
      if (!selectedBranch) return true;
      const bName = row.branch || row.fromBranch || row.toBranch || 'Main';
      return bName.toLowerCase() === selectedBranch.toLowerCase();
    };

    const dateFilter = (row) => {
      if (!row.date) return true;
      const rowDate = new Date(row.date);
      if (startDate && rowDate < new Date(startDate)) return false;
      if (endDate && rowDate > new Date(endDate)) return false;
      return true;
    };

    const catFilter = (row) => {
      if (!selectedCategory) return true;
      return row.category?.toLowerCase() === selectedCategory.toLowerCase();
    };

    try {
      if (reportType === 'inventory') {
        result = rawInventory.filter(branchFilter).filter(catFilter);
      } 
      else if (reportType === 'purchase') {
        result = rawPurchases.filter(branchFilter).filter(dateFilter);
      } 
      else if (reportType === 'dispatch') {
        result = rawDispatches.filter(branchFilter).filter(dateFilter);
      } 
      else if (reportType === 'ledger') {
        // Stock ledger combines purchases (Inflow), dispatches (Outflow), and transfers
        const ledger = [];
        
        rawPurchases.filter(branchFilter).filter(dateFilter).forEach(p => {
          ledger.push({
            date: p.date,
            id: p.purchaseId,
            description: `Purchase Inward: ${p.vendorName}`,
            itemName: p.itemName,
            qtyIn: p.qty,
            qtyOut: 0,
            unit: p.unit,
            totalVal: p.totalAmount
          });
        });

        rawDispatches.filter(branchFilter).filter(dateFilter).forEach(d => {
          ledger.push({
            date: d.date,
            id: d.dispatchId,
            description: `Dispatch Sale: ${d.customerName}`,
            itemName: d.itemName,
            qtyIn: 0,
            qtyOut: d.qty,
            unit: d.unit,
            totalVal: d.totalAmount
          });
        });

        rawTransfers.filter(dateFilter).forEach(t => {
          const isFrom = t.fromBranch.toLowerCase() === selectedBranch.toLowerCase();
          const isTo = t.toBranch.toLowerCase() === selectedBranch.toLowerCase();
          
          if (isFrom) {
            ledger.push({
              date: t.date,
              id: t.transferId,
              description: `Transfer OUT to ${t.toBranch} (${t.status})`,
              itemName: t.itemName,
              qtyIn: 0,
              qtyOut: t.qty,
              unit: t.unit,
              totalVal: 0
            });
          }
          if (isTo && t.status === 'Approved') {
            ledger.push({
              date: t.date,
              id: t.transferId,
              description: `Transfer IN from ${t.fromBranch}`,
              itemName: t.itemName,
              qtyIn: t.qty,
              qtyOut: 0,
              unit: t.unit,
              totalVal: 0
            });
          }
        });

        // Sort ledger by date ascending
        result = ledger.sort((a, b) => new Date(a.date) - new Date(b.date));
      }

      setReportData(result);
      showInfo(`Generated ${result.length} records matching search filters.`);
    } catch (e) {
      showError('Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Columns definition based on type
  const getColumns = () => {
    if (reportType === 'inventory') {
      return [
        { header: 'Item ID', accessor: 'itemId' },
        { header: 'Branch', accessor: 'branch' },
        { header: 'Material Name', accessor: 'itemName' },
        { header: 'Category', accessor: 'category' },
        { header: 'Current Stock', accessor: 'currentStock', render: (row) => `${row.currentStock} ${row.unit}` },
        { header: 'Alert Threshold', accessor: 'minThreshold', render: (row) => `${row.minThreshold} ${row.unit}` }
      ];
    }
    if (reportType === 'purchase') {
      return [
        { header: 'Purchase ID', accessor: 'purchaseId' },
        { header: 'Date', accessor: 'date' },
        { header: 'Invoice No', accessor: 'invoiceNo' },
        { header: 'Vendor Name', accessor: 'vendorName' },
        { header: 'Item', accessor: 'itemName' },
        { header: 'Quantity', accessor: 'qty', render: (row) => `${row.qty} ${row.unit}` },
        { header: 'Taxable (₹)', accessor: 'taxableValue', render: (row) => `₹${row.taxableValue.toLocaleString('en-IN')}` },
        { header: 'GST Total (₹)', accessor: 'gstAmount', render: (row) => `₹${row.gstAmount.toLocaleString('en-IN')}` },
        { header: 'Grand Total (₹)', accessor: 'totalAmount', render: (row) => `₹${row.totalAmount.toLocaleString('en-IN')}` }
      ];
    }
    if (reportType === 'dispatch') {
      return [
        { header: 'Dispatch ID', accessor: 'dispatchId' },
        { header: 'Date', accessor: 'date' },
        { header: 'Invoice No', accessor: 'invoiceNo' },
        { header: 'Customer Name', accessor: 'customerName' },
        { header: 'Item', accessor: 'itemName' },
        { header: 'Quantity Shipped', accessor: 'qty', render: (row) => `${row.qty} ${row.unit}` },
        { header: 'Rate (₹)', accessor: 'rate', render: (row) => `₹${row.rate}` },
        { header: 'Sales Sum (₹)', accessor: 'totalAmount', render: (row) => `₹${row.totalAmount.toLocaleString('en-IN')}` }
      ];
    }
    // Ledger
    return [
      { header: 'Date', accessor: 'date' },
      { header: 'Reference ID', accessor: 'id' },
      { header: 'Description', accessor: 'description' },
      { header: 'Item Name', accessor: 'itemName' },
      { header: 'Inward (+)', accessor: 'qtyIn', render: (row) => row.qtyIn > 0 ? `${row.qtyIn} ${row.unit}` : '-' },
      { header: 'Outward (-)', accessor: 'qtyOut', render: (row) => row.qtyOut > 0 ? `${row.qtyOut} ${row.unit}` : '-' },
      { header: 'Amount (₹)', accessor: 'totalVal', render: (row) => row.totalVal > 0 ? `₹${row.totalVal.toLocaleString('en-IN')}` : '-' }
    ];
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Print styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #reports-print-area, #reports-print-area * { visibility: visible; }
          #reports-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none;
            background-color: white !important;
            color: black !important;
          }
          .noprint { display: none !important; }
        }
      `}} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 noprint">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-indigo-400" />
            <span>PMMPL Operations Reports Builder</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Filter, compile and output transactional summaries across branches for audited print templates.
          </p>
        </div>
      </div>

      {/* Config Filters Panel */}
      <GlassCard className="p-2.5 sm:p-5 noprint border border-slate-850">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end text-xs">
          
          {/* Report Type */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value);
                setReportData([]); // clear grid
              }}
              className="w-full px-2.5 py-2 text-xs rounded-lg glass-input bg-slate-900 appearance-none font-medium cursor-pointer"
            >
              <option value="inventory">Inventory Summary</option>
              <option value="purchase">Purchase Inward Ledger</option>
              <option value="dispatch">Sales Dispatch Ledger</option>
              <option value="ledger">Regional Stock Ledger</option>
            </select>
          </div>

          {/* Branch scope selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Select Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-lg glass-input bg-slate-900 appearance-none font-medium cursor-pointer"
            >
              {user.branch === 'All' ? (
                ['Main', 'Madhya', 'Rkl', 'Purab'].map(b => (
                  <option key={b} value={b}>{b} Branch</option>
                ))
              ) : Array.isArray(user.branch) ? (
                user.branch.map(b => (
                  <option key={b} value={b}>{b} Branch</option>
                ))
              ) : (
                <option value={user.branch}>{user.branch} Branch</option>
              )}
            </select>
          </div>

          {/* Conditional Material category */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
              {reportType === 'inventory' ? 'Filter Category' : 'Date Range (Start)'}
            </label>
            {reportType === 'inventory' ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg glass-input bg-slate-900 appearance-none font-medium cursor-pointer"
              >
                <option value="">All Categories</option>
                <option value="Boulder">Boulder</option>
                <option value="Aggregates">Aggregates</option>
                <option value="Sand">Sand</option>
                <option value="Fuel">Fuel</option>
                <option value="Cement">Cement</option>
              </select>
            ) : (
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-[11px] rounded-lg glass-input bg-slate-900"
                />
              </div>
            )}
          </div>

          {/* End Date filter (Conditional) */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
              {reportType === 'inventory' ? 'Options' : 'Date Range (End)'}
            </label>
            {reportType === 'inventory' ? (
              <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-500 italic text-center font-medium">
                Category filters applied
              </div>
            ) : (
              <div className="relative">
                <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-[11px] rounded-lg glass-input bg-slate-900"
                />
              </div>
            )}
          </div>

          {/* Actions Compilation Trigger */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-600/10 cursor-pointer flex items-center justify-center gap-1 shrink-0 text-xs"
          >
            <Eye className="w-4 h-4" />
            <span>Generate Preview</span>
          </button>
        </div>

      </GlassCard>

      {/* Compiled Grid Preview Card */}
      {reportData.length > 0 ? (
        <div id="reports-print-area" className="space-y-4">
          
          {/* Print Only Corporate Header Banner */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6 font-sans text-xs">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-sm font-bold uppercase">PMMPL Operations Audit Reports</h1>
                <p className="text-[10px] text-slate-500 mt-1">Branch scope: <strong>{selectedBranch} Branch</strong></p>
                <p className="text-[10px] text-slate-500">Report Compilation: <strong>{reportType.toUpperCase()} SUMMARY</strong></p>
              </div>
              <div className="text-right text-[10px] text-slate-500">
                <p>Printed: {new Date().toLocaleString()}</p>
                <p>Filtered Dates: {startDate || 'Beginning'} to {endDate || 'Present'}</p>
              </div>
            </div>
          </div>

          {/* Printable Report Grid */}
          <GlassCard className="p-2 sm:p-6">
            <Table
              columns={getColumns()}
              data={reportData}
              searchPlaceholder="Filter result lists..."
              exportFileName={`${selectedBranch}_${reportType}_report`}
              actions={
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-slate-800 text-slate-200 border border-slate-700/60 hover:bg-slate-700 hover:text-white font-medium transition-colors cursor-pointer noprint"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>
              }
            />
          </GlassCard>

          {/* Print Signature Footer Block */}
          <div className="hidden print:flex justify-between items-end mt-20 pt-4 border-t border-slate-200 text-[10px] text-slate-500 font-sans">
            <p>PMMPL Mining & Infra Private Limited (Corporate Database Report)</p>
            <div className="text-center w-40 border-t border-slate-400 pt-1">
              Authorized Auditor Signature
            </div>
          </div>

        </div>
      ) : (
        <GlassCard className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2 border border-dashed border-slate-800">
          <FileBarChart className="w-8 h-8 text-slate-600 mb-1" />
          <p className="font-semibold text-slate-400">No Report Generated Yet</p>
          <p className="text-slate-500">Adjust the filters above and click "Generate Preview" to review transactions.</p>
        </GlassCard>
      )}

    </div>
  );
};

export default Reports;
