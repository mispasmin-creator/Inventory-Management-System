import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import { IndianRupee, Edit3, Clock, LineChart as LineIcon, Calendar, TrendingUp } from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

const PmmplRate = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  
  // Edit Form State
  const [newRate, setNewRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    setLoading(true);
    try {
      const data = await apiService.getRates();
      setRates(data);
    } catch (e) {
      showError('Failed to fetch PMMPL rates');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRate = (rateItem) => {
    setSelectedRate(rateItem);
    setNewRate(rateItem.rate);
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setEditModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRate || !newRate || Number(newRate) <= 0) return;

    setLoading(true);
    try {
      const res = await apiService.updateRate(selectedRate.rateId, Number(newRate), effectiveDate);
      if (res.success) {
        showSuccess(`Rate updated for ${selectedRate.itemName}.`);
        setEditModalOpen(false);
        fetchRates();
      }
    } catch (err) {
      showError(err.message || 'Failed to update rate');
    } finally {
      setLoading(false);
    }
  };

  // Format line chart data for selected rate in modal
  const trendData = selectedRate ? selectedRate.history.map(h => ({
    date: h.date,
    Price: h.rate
  })) : [];

  const isEditable = user?.role !== 'Viewer';

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-indigo-400" />
          <span>PMMPL Corporate Rate Card</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Define standard pricing rates in INR per ton for dispatch invoices. Stores historical rate shifts.
        </p>
      </div>

      {/* Loading Indicator */}
      {loading && rates.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-indigo-500/25 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        /* Rates Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rates.map((rateItem) => {
            const hasTrend = rateItem.history && rateItem.history.length > 1;
            const previousRate = hasTrend ? rateItem.history[rateItem.history.length - 2].rate : rateItem.rate;
            const diff = rateItem.rate - previousRate;

            return (
              <GlassCard 
                key={rateItem.rateId} 
                className="flex flex-col justify-between relative overflow-hidden border border-slate-800 hover:border-slate-700 transition-all group"
                hover
              >
                {/* Visual Glow */}
                <div className="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-indigo-600/5 blur-xl group-hover:bg-indigo-600/10 transition-colors pointer-events-none" />

                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-indigo-400 font-mono uppercase tracking-wider">{rateItem.rateId}</span>
                      <h3 className="font-semibold text-slate-200 mt-0.5">{rateItem.itemName}</h3>
                    </div>
                    {isEditable && (
                      <button
                        onClick={() => handleEditRate(rateItem)}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Valuation summary */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-slate-100">₹{rateItem.rate}</span>
                    <span className="text-[10px] text-slate-500">per Ton</span>
                    
                    {/* Price Diff Change indicator */}
                    {diff !== 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center font-bold gap-0.5 ${
                        diff > 0 ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                      }`}>
                        <TrendingUp className={`w-3 h-3 ${diff < 0 ? 'rotate-180' : ''}`} />
                        <span>{diff > 0 ? '+' : ''}{diff}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* History Footnotes */}
                <div className="mt-6 pt-3 border-t border-slate-800 flex justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Effective: {rateItem.effectiveDate}
                  </span>
                  <span className="flex items-center gap-1 font-semibold">
                    <Clock className="w-3.5 h-3.5" /> {rateItem.history?.length || 1} Rate Shifts
                  </span>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* EDIT MODAL WITH TREND CHART */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedRate(null);
        }}
        size="lg"
        title={`Adjust Rate Card: ${selectedRate?.itemName}`}
      >
        {selectedRate && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Column: Form and History List */}
            <div className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">New Rate (₹ per Ton)</label>
                  <input
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg glass-input font-bold text-emerald-400 text-sm"
                    required
                    min={1}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">Effective Date</label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg glass-input"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white transition-all shadow shadow-indigo-500/10 cursor-pointer"
                >
                  Apply New Rate Card
                </button>
              </form>

              {/* History Table */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Rate Timeline History
                </h4>
                <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/20 text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-2 sticky top-0 bg-slate-900 z-10">Date</th>
                        <th className="p-2 text-right sticky top-0 bg-slate-900 z-10">Price per Ton</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {[...(selectedRate.history || [])].reverse().map((h, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono">{h.date}</td>
                          <td className="p-2 text-right font-bold text-slate-200">₹{h.rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Historical Line Chart */}
            <div className="flex flex-col justify-between">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2 mb-2">
                <LineIcon className="w-4 h-4 text-indigo-400" />
                <span>Price Trend Chart</span>
              </div>

              {trendData.length <= 1 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center p-4">
                  Add more rate fluctuations to render historical line trends.
                </div>
              ) : (
                <div className="flex-1 min-h-[220px] text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} domain={['auto', 'auto']} />
                      <Tooltip formatter={(value) => [`₹${value}`]} />
                      <Line type="monotone" dataKey="Price" stroke="#6366f1" strokeWidth={2.5} activeDot={{ r: 6 }} dot={{ strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-800 noprint">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

          </div>
        )}
      </Modal>

    </div>
  );
};

export default PmmplRate;
