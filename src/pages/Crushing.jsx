import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Table from '../components/Table';
import { TableSkeleton } from '../components/Skeleton';
import { Layers, Plus, Trash2, ShieldAlert, Cpu, BarChart2 } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';

const Crushing = () => {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const [crushingHistory, setCrushingHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rawStock, setRawStock] = useState(0);

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputItem, setInputItem] = useState('Boulder (Raw)');
  const [inputQty, setInputQty] = useState('');
  const [outputs, setOutputs] = useState([
    { itemName: '10mm Aggregate', qty: '' },
    { itemName: '20mm Aggregate', qty: '' }
  ]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchLogs();
    fetchRawStock();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await apiService.getCrushingLogs();
      setCrushingHistory(data);
    } catch (e) {
      showError('Failed to fetch crushing runs logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchRawStock = async () => {
    try {
      const items = await apiService.getInventory('Main');
      const raw = items.find(i => i.itemName.toLowerCase() === 'boulder (raw)');
      setRawStock(raw ? raw.currentStock : 0);
    } catch (e) {
      console.error(e);
    }
  };

  const addOutputRow = () => {
    setOutputs([...outputs, { itemName: 'Crushed Sand / Dust', qty: '' }]);
  };

  const removeOutputRow = (index) => {
    setOutputs(outputs.filter((_, i) => i !== index));
  };

  const handleOutputChange = (index, field, value) => {
    const updated = [...outputs];
    updated[index][field] = value;
    setOutputs(updated);
  };

  // Calculations
  const totalOutputs = outputs.reduce((sum, out) => sum + Number(out.qty || 0), 0);
  const recoveryRate = inputQty > 0 ? ((totalOutputs / Number(inputQty)) * 100).toFixed(2) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputQty || inputQty <= 0) {
      showWarning('Please enter a valid input quantity.');
      return;
    }

    if (outputs.some(out => !out.qty || out.qty <= 0)) {
      showWarning('Please provide valid quantities for all output items.');
      return;
    }

    // Check raw boulder stock
    if (rawStock < Number(inputQty)) {
      showWarning(`Insufficient stock of ${inputItem} in Main Branch. (Available: ${rawStock} Tons)`);
      return;
    }

    setLoading(true);
    try {
      const res = await apiService.addCrushingLog({
        date,
        inputItem,
        inputQty: Number(inputQty),
        outputs: outputs.map(o => ({ itemName: o.itemName, qty: Number(o.qty) })),
        notes
      });

      if (res.success) {
        showSuccess('Crushing log submitted. Stocks updated successfully.');
        setDate(new Date().toISOString().split('T')[0]);
        setInputQty('');
        setOutputs([
          { itemName: '10mm Aggregate', qty: '' },
          { itemName: '20mm Aggregate', qty: '' }
        ]);
        setNotes('');
        setShowForm(false);
        fetchLogs();
        fetchRawStock();
      }
    } catch (err) {
      showError(err.message || 'Failed to submit crushing log');
    } finally {
      setLoading(false);
    }
  };

  // Chart data formatting (last 5 runs)
  const chartData = crushingHistory.slice(-5).map((log, i) => ({
    name: `Run ${log.logId}`,
    Input: log.inputQty,
    Output: log.outputs.reduce((s, o) => s + o.qty, 0),
    Recovery: log.recoveryRate
  }));

  const columns = [
    { header: 'Run ID', accessor: 'logId' },
    { header: 'Date', accessor: 'date' },
    { header: 'Input Material', accessor: 'inputItem' },
    { 
      header: 'Input Weight', 
      accessor: 'inputQty',
      render: (row) => `${row.inputQty.toLocaleString()} Tons`
    },
    {
      header: 'Yield Outputs',
      accessor: 'outputs',
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          {row.outputs.map((out, idx) => (
            <span key={idx} className="text-slate-400">
              {out.itemName}: <strong className="text-slate-200">{out.qty.toLocaleString()} Tons</strong>
            </span>
          ))}
        </div>
      )
    },
    { 
      header: 'Recovery Rate', 
      accessor: 'recoveryRate',
      render: (row) => (
        <span className={`font-bold ${row.recoveryRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
          {row.recoveryRate}%
        </span>
      )
    },
    { header: 'Notes', accessor: 'notes' }
  ];

  return (
    <div className="space-y-6 w-full p-1.5 animate-slide-up">
      
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Crushing Operations (Material Conversion)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Log heavy jaw/cone crusher conversions. Deducts Boulder blocks input, and increases crushed aggregate outputs.
          </p>
        </div>

        {user.role !== 'Viewer' && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md transition-colors cursor-pointer"
          >
            <Plus className={`w-4.5 h-4.5 transition-transform duration-300 ${showForm ? 'rotate-45' : ''}`} />
            <span>{showForm ? 'Close Process Form' : 'Log Crushing Run'}</span>
          </button>
        )}
      </div>

      {/* Entry Form (Conditional) */}
      {showForm && (
        <GlassCard className="border border-indigo-500/10" glow>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Crushing Run Entry</h3>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Input Specifications */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Operation Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Input Raw Stock Check</label>
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-slate-200">Boulder blocks (Main)</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Conversion Input</p>
                  </div>
                  <strong className="text-sm font-extrabold">{rawStock.toLocaleString()} Tons</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Input Material</label>
                  <select
                    value={inputItem}
                    onChange={(e) => setInputItem(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input bg-slate-900"
                  >
                    <option value="Boulder (Raw)">Boulder (Raw)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Input Weight (Tons)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={inputQty}
                    onChange={(e) => setInputQty(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Output Specifications */}
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-1 border-b border-slate-800">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Crushed Outputs Yield</span>
                <button
                  type="button"
                  onClick={addOutputRow}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>

              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {outputs.map((out, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={out.itemName}
                      onChange={(e) => handleOutputChange(idx, 'itemName', e.target.value)}
                      className="flex-1 px-2.5 py-2 text-[11px] rounded-lg glass-input bg-slate-900"
                    >
                      <option value="10mm Aggregate">10mm Aggregate</option>
                      <option value="20mm Aggregate">20mm Aggregate</option>
                      <option value="40mm Aggregate">40mm Aggregate</option>
                      <option value="WMM (Wet Mix Macadam)">WMM (Wet Mix)</option>
                      <option value="Crushed Sand / Dust">Crushed Sand / Dust</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Tons"
                      value={out.qty}
                      onChange={(e) => handleOutputChange(idx, 'qty', e.target.value)}
                      className="w-20 px-2 py-2 text-[11px] rounded-lg glass-input"
                      required
                    />
                    {outputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOutputRow(idx)}
                        className="p-1.5 text-rose-400 hover:bg-rose-950/20 rounded cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations & Notes */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col justify-between">
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Outputs Yield:</span>
                  <span className="font-semibold text-slate-300">{totalOutputs} Tons</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recovery Rate:</span>
                  <span className={`font-bold ${recoveryRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {recoveryRate}%
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pl-0.5">Process Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Crusher adjustments, moisture levels..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-[11px] rounded-lg glass-input resize-none"
                  />
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
                  Commit Process
                </button>
              </div>

            </div>

          </form>
        </GlassCard>
      )}

      {/* Analytics chart and logs table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* History Table */}
        <div className="lg:col-span-2">
          <GlassCard className="p-2 sm:p-6">
            {loading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : (
              <Table
                columns={columns}
                data={crushingHistory}
                searchPlaceholder="Search crushing dates, notes..."
                exportFileName="Crushing_run_logs"
              />
            )}
          </GlassCard>
        </div>

        {/* Analytics Chart */}
        <div className="space-y-6">
          <GlassCard className="h-[340px] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Crushing Yield Metrics</h3>
                <p className="text-[10px] text-slate-400">Total conversion weights of recent runs</p>
              </div>
              <BarChart2 className="w-4 h-4 text-indigo-400" />
            </div>

            {crushingHistory.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Log runs to preview yield analytics.
              </div>
            ) : (
              <div className="flex-1 min-h-[220px] text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={9} />
                    <Tooltip formatter={(value) => [`${value} Tons`]} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '9px' }} />
                    <Bar dataKey="Input" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Output" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>

      </div>

    </div>
  );
};

export default Crushing;
