import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/api';
import GlassCard from '../components/GlassCard';
import { 
  Boxes, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Truck, 
  Layers,
  ArrowRightLeft,
  Calendar
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from 'recharts';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalStockTons: 0,
    lowStockCount: 0,
    purchaseTotal: 0,
    dispatchTotal: 0
  });
  const [branchData, setBranchData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch inventories for each branch
      const branchesToFetch = user.branch === 'All' ? ['Main', 'Madhya', 'Rkl', 'Purab'] : (Array.isArray(user.branch) ? user.branch : [user.branch]);
      let aggregatedStock = 0;
      let lowStockItemsFound = [];
      const branchSummaries = [];

      for (const bName of branchesToFetch) {
        const items = await apiService.getInventory(bName);
        let branchWeight = 0;
        
        items.forEach(item => {
          // Count tons and items
          if (item.unit === 'Ton') {
            aggregatedStock += item.currentStock;
            branchWeight += item.currentStock;
          }
          if (item.currentStock <= item.minThreshold) {
            lowStockItemsFound.push({ ...item, branchName: bName });
          }
        });

        branchSummaries.push({
          name: bName,
          value: Math.round(branchWeight),
          itemCount: items.length
        });
      }

      // 2. Fetch purchases & dispatches
      const reports = await apiService.getReports();
      
      // Calculate financial stats
      const totalPurchases = reports.purchases
        .filter(p => user.branch === 'All' || (Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === p.branch.toLowerCase()) : p.branch.toLowerCase() === user.branch.toLowerCase()))
        .reduce((sum, p) => sum + p.totalAmount, 0);

      const totalDispatches = reports.dispatches
        .filter(d => user.branch === 'All' || (Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === d.branch.toLowerCase()) : d.branch.toLowerCase() === user.branch.toLowerCase()))
        .reduce((sum, d) => sum + d.totalAmount, 0);

      // Create trends data (group by date)
      const dateMap = {};
      reports.purchases.forEach(p => {
        if (user.branch !== 'All' && !(Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === p.branch.toLowerCase()) : p.branch.toLowerCase() === user.branch.toLowerCase())) return;
        const d = p.date;
        if (!dateMap[d]) dateMap[d] = { date: d, Purchase: 0, Dispatch: 0 };
        dateMap[d].Purchase += p.totalAmount;
      });
      reports.dispatches.forEach(d => {
        if (user.branch !== 'All' && !(Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === d.branch.toLowerCase()) : d.branch.toLowerCase() === user.branch.toLowerCase())) return;
        const dt = d.date;
        if (!dateMap[dt]) dateMap[dt] = { date: dt, Purchase: 0, Dispatch: 0 };
        dateMap[dt].Dispatch += d.totalAmount;
      });

      // Sort dates
      const sortedTrends = Object.values(dateMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-7); // Last 7 transaction days

      // Combine logs for recent activity feed
      const allActivities = [
        ...reports.purchases.map(p => ({
          id: p.purchaseId,
          type: 'Purchase',
          date: p.date,
          title: `Inward: ${p.qty} ${p.unit} of ${p.itemName}`,
          subtitle: `From ${p.vendorName} to ${p.branch}`,
          value: `₹${p.totalAmount.toLocaleString('en-IN')}`,
          color: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/10'
        })),
        ...reports.dispatches.map(d => ({
          id: d.dispatchId,
          type: 'Dispatch',
          date: d.date,
          title: `Outward: ${d.qty} ${d.unit} of ${d.itemName}`,
          subtitle: `To ${d.customerName} from ${d.branch}`,
          value: `₹${d.totalAmount.toLocaleString('en-IN')}`,
          color: 'text-rose-400 bg-rose-950/40 border-rose-500/10'
        })),
        ...reports.transfers.map(t => ({
          id: t.transferId,
          type: 'Transfer',
          date: t.date,
          title: `Transfer: ${t.qty} ${t.unit} of ${t.itemName}`,
          subtitle: `${t.fromBranch} → ${t.toBranch} (${t.status})`,
          value: t.status,
          color: 'text-sky-400 bg-sky-950/40 border-sky-500/10'
        })),
        ...reports.crushing.map(c => ({
          id: c.logId,
          type: 'Crushing',
          date: c.date,
          title: `Crushing: Boulder ${c.inputQty} Tons`,
          subtitle: `Yielded ${c.outputs.length} outputs (Recovery: ${c.recoveryRate}%)`,
          value: 'Processed',
          color: 'text-violet-400 bg-violet-950/40 border-violet-500/10'
        }))
      ];

      // Sort activities descending
      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      setStats({
        totalStockTons: Math.round(aggregatedStock),
        lowStockCount: lowStockItemsFound.length,
        purchaseTotal: totalPurchases,
        dispatchTotal: totalDispatches
      });
      setBranchData(branchSummaries);
      setTrendData(sortedTrends);
      setRecentLogs(sortedActivities);
      setLowStockItems(lowStockItemsFound);
    } catch (e) {
      console.error('Error fetching dashboard statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  // Color cycles for graphs
  const COLORS = ['#6366f1', '#a855f7', '#06b6d4', '#10b981', '#f59e0b'];

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Loading live data, metrics and logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Upper Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI: Total Stock */}
        <GlassCard className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Aggregates</p>
            <h3 className="text-xl font-bold mt-1 text-slate-100">
              {stats.totalStockTons.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
            </h3>
          </div>
        </GlassCard>

        {/* KPI: Low Stock Alerts */}
        <GlassCard className="flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
            stats.lowStockCount > 0 
              ? 'bg-amber-950/20 border-amber-500/30 text-amber-400' 
              : 'bg-slate-800/40 border-slate-700/30 text-slate-400'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Stock Alerts</p>
            <h3 className="text-xl font-bold mt-1 text-slate-100">
              {stats.lowStockCount} <span className="text-xs font-semibold text-slate-400">Items Low</span>
            </h3>
          </div>
        </GlassCard>

        {/* KPI: Purchase value */}
        <GlassCard className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Inward Purchases</p>
            <h3 className="text-xl font-bold mt-1 text-emerald-400">
              ₹{stats.purchaseTotal.toLocaleString('en-IN')}
            </h3>
          </div>
        </GlassCard>

        {/* KPI: Sales value */}
        <GlassCard className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Dispatch Sales</p>
            <h3 className="text-xl font-bold mt-1 text-rose-400">
              ₹{stats.dispatchTotal.toLocaleString('en-IN')}
            </h3>
          </div>
        </GlassCard>

      </div>

      {/* Main Content Layout: Charts & Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Area Chart */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="h-[360px] flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Financial Inward/Outward Flow</h3>
                <p className="text-[11px] text-slate-400">Transaction volumes of purchases and dispatches (Last 7 working days)</p>
              </div>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>
            
            <div className="flex-1 min-h-[260px] w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDispatch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="Purchase" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPurchase)" />
                  <Area type="monotone" dataKey="Dispatch" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorDispatch)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Low Stock Watch Grid */}
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Critical Stock Warnings</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 font-semibold border border-amber-500/20">
                {lowStockItems.length} Warnings
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
              {lowStockItems.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 col-span-2 text-center">
                  All items are healthy and exceed threshold minimums.
                </p>
              ) : (
                lowStockItems.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-lg bg-amber-950/15 border border-amber-500/20 flex justify-between items-center"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{item.itemName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Branch: <span className="font-semibold text-slate-300">{item.branchName}</span></p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-amber-400">{item.currentStock}</span>
                      <span className="text-[10px] text-slate-500 ml-1">{item.unit}</span>
                      <p className="text-[9px] text-slate-500 mt-0.5">Threshold: {item.minThreshold}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right Columns: Branch Share & Activity Feed */}
        <div className="space-y-6">
          
          {/* Branch Stocks Share Pie Chart */}
          <GlassCard className="h-[360px] flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Branch Distribution (Tons)</h3>
              <p className="text-[11px] text-slate-400">Total stock weight held in each regional branch</p>
            </div>

            <div className="flex-1 min-h-[220px] relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={branchData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {branchData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                  <Legend iconSize={8} layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Recent Operations Activity logs */}
          <GlassCard className="flex-1 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Recent Transactions</h3>
            
            <div className="space-y-3.5">
              {recentLogs.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">No transaction logs recorded yet.</p>
              ) : (
                recentLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${log.color}`}>
                        {log.type.slice(0, 4)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-200 leading-normal line-clamp-1">{log.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{log.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-300">{log.value}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{log.date}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

        </div>

      </div>

    </div>
  );
};

export default Dashboard;
