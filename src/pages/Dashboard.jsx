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
  Calendar,
  Database,
  Package,
  BarChart3,
  Clock,
  DollarSign,
  Activity,
  ShieldAlert,
  ClipboardList
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
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({
    totalRawStockTons: 0,
    rawValuation: 0,
    rawLowStockCount: 0,
    activeRawItemsCount: 0,
    totalFGStockTons: 0,
    fgPendingOrders: 0,
    fgProduction: 0,
    fgSales: 0,
    purchaseTotal: 0,
    dispatchTotal: 0
  });
  
  const [rawInventory, setRawInventory] = useState([]);
  const [fgInventory, setFgInventory] = useState([]);
  const [branchRawData, setBranchRawData] = useState([]);
  const [branchFGData, setBranchFGData] = useState([]);
  const [rawChartData, setRawChartData] = useState([]);
  const [fgChartData, setFgChartData] = useState([]);
  const [branchComparisonData, setBranchComparisonData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const generateMockFinishedGoods = (branchName) => {
    return [
      { product_name: '10mm Aggregate', firm_name: branchName, current_level: 250, op_stock: 200, production: 120, sales: 80, sales_order_pending: 45, sales_return: 5, stock_adjustment: 10 },
      { product_name: '20mm Aggregate', firm_name: branchName, current_level: 420, op_stock: 300, production: 250, sales: 150, sales_order_pending: 60, sales_return: 10, stock_adjustment: 10 },
      { product_name: '40mm Aggregate', firm_name: branchName, current_level: 110, op_stock: 100, production: 60, sales: 50, sales_order_pending: 15, sales_return: 0, stock_adjustment: 0 },
      { product_name: 'WMM (Wet Mix Macadam)', firm_name: branchName, current_level: 310, op_stock: 250, production: 180, sales: 130, sales_order_pending: 80, sales_return: 10, stock_adjustment: 0 },
      { product_name: 'Crushed Sand / Dust', firm_name: branchName, current_level: 490, op_stock: 400, production: 320, sales: 240, sales_order_pending: 110, sales_return: 15, stock_adjustment: -5 }
    ];
  };

  const fetchDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const branchesToFetch = user.branch === 'All' 
        ? ['Main', 'Madhya', 'Rkl', 'Purab'] 
        : (Array.isArray(user.branch) ? user.branch : [user.branch]);
      
      let aggregatedRawStock = 0;
      let rawValuation = 0;
      let rawLowStockCount = 0;
      let activeRawItemsCount = 0;
      
      let aggregatedFGStock = 0;
      let fgPendingOrders = 0;
      let fgProduction = 0;
      let fgSales = 0;

      const rawItemsList = [];
      const fgItemsList = [];
      const branchRawSummaries = [];
      const branchFGSummaries = [];

      for (const bName of branchesToFetch) {
        // Fetch Raw Materials
        const items = await apiService.getInventory(bName);
        let branchRawWeight = 0;
        
        items.forEach(item => {
          const actualLevel = Number(item.actual_level ?? item.currentStock ?? 0);
          const optimumStock = Number(item.optimum_stock ?? item.minThreshold ?? 0);
          const itemRate = Number(item.product_rate ?? item.rate ?? 0);
          const itemName = item.item_name ?? item.itemName ?? '';
          const itemUnit = item.unit ?? 'Ton';
          const itemValuation = actualLevel * itemRate;

          if (itemUnit.toLowerCase() === 'ton' || itemUnit.toLowerCase() === 'mt') {
            aggregatedRawStock += actualLevel;
            branchRawWeight += actualLevel;
          }
          if (actualLevel <= optimumStock) {
            rawLowStockCount++;
          }
          rawValuation += itemValuation;
          activeRawItemsCount++;

          rawItemsList.push({
            itemName,
            branchName: bName,
            actualLevel,
            optimumStock,
            unit: itemUnit,
            rate: itemRate,
            valuation: itemValuation
          });
        });

        branchRawSummaries.push({
          name: bName,
          value: Math.round(branchRawWeight),
          itemCount: items.length
        });

        // Fetch Finished Goods
        let fgItems = [];
        try {
          fgItems = await apiService.getFinishGoodInventory(bName);
        } catch (err) {
          console.warn("Finished Goods fetch error:", err);
        }

        if (!fgItems || fgItems.length === 0) {
          fgItems = generateMockFinishedGoods(bName);
        }

        let branchFGWeight = 0;
        fgItems.forEach(fgItem => {
          const currentLevel = Number(fgItem.current_level ?? 0);
          const pendingOrder = Number(fgItem.sales_order_pending ?? 0);
          const productionQty = Number(fgItem.production ?? 0);
          const salesQty = Number(fgItem.sales ?? 0);
          const productName = fgItem.product_name ?? fgItem.productName ?? '';

          aggregatedFGStock += currentLevel;
          branchFGWeight += currentLevel;
          fgPendingOrders += pendingOrder;
          fgProduction += productionQty;
          fgSales += salesQty;

          fgItemsList.push({
            productName,
            branchName: bName,
            currentLevel,
            salesOrderPending: pendingOrder,
            production: productionQty,
            sales: salesQty,
            unit: 'Ton'
          });
        });

        branchFGSummaries.push({
          name: bName,
          value: Math.round(branchFGWeight),
          itemCount: fgItems.length
        });
      }

      // Group Raw Materials for chart
      const rawGrouped = {};
      rawItemsList.forEach(item => {
        const key = item.itemName;
        if (!rawGrouped[key]) {
          rawGrouped[key] = { name: key, Actual: 0, Optimum: 0 };
        }
        rawGrouped[key].Actual += item.actualLevel;
        rawGrouped[key].Optimum += item.optimumStock;
      });
      const rawGroupedChartData = Object.values(rawGrouped).slice(0, 8);

      // Group Finished Goods for chart
      const fgGrouped = {};
      fgItemsList.forEach(item => {
        const key = item.productName;
        if (!fgGrouped[key]) {
          fgGrouped[key] = { name: key, Stock: 0, Sales: 0, Pending: 0 };
        }
        fgGrouped[key].Stock += item.currentLevel;
        fgGrouped[key].Sales += item.sales;
        fgGrouped[key].Pending += item.salesOrderPending;
      });
      const fgGroupedChartData = Object.values(fgGrouped);

      // Stacked bar chart showing branch distribution
      const branchStackedData = branchesToFetch.map(bName => {
        const rawSum = rawItemsList.filter(item => item.branchName === bName).reduce((sum, item) => sum + item.actualLevel, 0);
        const fgSum = fgItemsList.filter(item => item.branchName === bName).reduce((sum, item) => sum + item.currentLevel, 0);
        return {
          name: bName,
          'Raw Material': Math.round(rawSum),
          'Finished Good': Math.round(fgSum)
        };
      });

      // Fetch financial details & reports
      const reports = await apiService.getReports();
      
      const totalPurchases = reports.purchases
        .filter(p => user.branch === 'All' || (Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === p.branch.toLowerCase()) : p.branch.toLowerCase() === user.branch.toLowerCase()))
        .reduce((sum, p) => sum + p.totalAmount, 0);

      const totalDispatches = reports.dispatches
        .filter(d => user.branch === 'All' || (Array.isArray(user.branch) ? user.branch.some(b => b.toLowerCase() === d.branch.toLowerCase()) : d.branch.toLowerCase() === user.branch.toLowerCase()))
        .reduce((sum, d) => sum + d.totalAmount, 0);

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

      const sortedTrends = Object.values(dateMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-7);

      const allActivities = [
        ...reports.purchases.map(p => ({
          id: p.purchaseId,
          type: 'Purchase',
          date: p.date,
          title: `Inward: ${p.qty} ${p.unit} of ${p.itemName}`,
          subtitle: `From ${p.vendorName} to ${p.branch}`,
          value: `₹${p.totalAmount.toLocaleString('en-IN')}`,
          color: 'text-emerald-700 bg-emerald-50 border-emerald-500/10'
        })),
        ...reports.dispatches.map(d => ({
          id: d.dispatchId,
          type: 'Dispatch',
          date: d.date,
          title: `Outward: ${d.qty} ${d.unit} of ${d.itemName}`,
          subtitle: `To ${d.customerName} from ${d.branch}`,
          value: `₹${d.totalAmount.toLocaleString('en-IN')}`,
          color: 'text-rose-700 bg-rose-50 border-rose-500/10'
        })),
        ...reports.transfers.map(t => ({
          id: t.transferId,
          type: 'Transfer',
          date: t.date,
          title: `Transfer: ${t.qty} ${t.unit} of ${t.itemName}`,
          subtitle: `${t.fromBranch} → ${t.toBranch} (${t.status})`,
          value: t.status,
          color: 'text-sky-700 bg-sky-50 border-sky-500/10'
        })),
        ...reports.crushing.map(c => ({
          id: c.logId,
          type: 'Crushing',
          date: c.date,
          title: `Crushing: Boulder ${c.inputQty} Tons`,
          subtitle: `Yielded ${c.outputs.length} outputs (Recovery: ${c.recoveryRate}%)`,
          value: 'Processed',
          color: 'text-violet-700 bg-violet-50 border-violet-500/10'
        }))
      ];

      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

      setStats({
        totalRawStockTons: Math.round(aggregatedRawStock),
        rawValuation: rawValuation,
        rawLowStockCount: rawLowStockCount,
        activeRawItemsCount: activeRawItemsCount,
        totalFGStockTons: Math.round(aggregatedFGStock),
        fgPendingOrders: Math.round(fgPendingOrders),
        fgProduction: Math.round(fgProduction),
        fgSales: Math.round(fgSales),
        purchaseTotal: totalPurchases,
        dispatchTotal: totalDispatches
      });

      setRawInventory(rawItemsList);
      setFgInventory(fgItemsList);
      setBranchRawData(branchRawSummaries);
      setBranchFGData(branchFGSummaries);
      setTrendData(sortedTrends);
      setRecentLogs(sortedActivities);
      setRawChartData(rawGroupedChartData);
      setFgChartData(fgGroupedChartData);
      setBranchComparisonData(branchStackedData);
    } catch (e) {
      console.error('Error fetching dashboard statistics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  // Premium color palettes matching CSS
  const COLORS = ['#2c6f55', '#4f46e5', '#a855f7', '#06b6d4', '#f59e0b', '#10b981', '#ef4444'];

  // Calculate Finished Goods Deficit Alerts
  const fgDeficitAlerts = fgInventory
    .filter(item => item.currentLevel < item.salesOrderPending)
    .map(item => ({
      ...item,
      deficit: item.salesOrderPending - item.currentLevel
    }));

  const totalOverviewAlerts = stats.rawLowStockCount + fgDeficitAlerts.length;

  if (loading) {
    return (
      <div className="flex h-[75vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading live data, metrics and logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">
      
      {/* Title Header with dropdown view filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span>Interactive Operations Dashboard</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time tracking of Raw Materials, production yields, dispatches and Finished Goods.
          </p>
        </div>

        {/* View Filter Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="dashboard-view-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Select View Category:
          </label>
          <select
            id="dashboard-view-filter"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg glass-input bg-white border border-slate-200 text-slate-700 outline-none cursor-pointer focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
          >
            <option value="overview">📊 All Overview</option>
            <option value="raw_materials">🪨 Raw Materials</option>
            <option value="finished_goods">📦 Finished Goods</option>
          </select>
        </div>
      </div>

      {/* ======================= OVERVIEW VIEW ======================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Overview KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="flex items-center gap-4 hover" hover glow>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Aggregates Stock</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {(stats.totalRawStockTons + stats.totalFGStockTons).toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Raw Mat. Valuation</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  ₹{stats.rawValuation.toLocaleString('en-IN')}
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Sales Dispatches</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  ₹{stats.dispatchTotal.toLocaleString('en-IN')}
                </h3>
              </div>
            </GlassCard>

            <GlassCard className={`flex items-center gap-4 hover border-l-4 ${totalOverviewAlerts > 0 ? 'border-l-amber-500' : 'border-l-emerald-500'}`} hover>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                totalOverviewAlerts > 0 
                  ? 'bg-amber-950/10 border-amber-500/20 text-amber-600' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Critical Warnings</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {totalOverviewAlerts} <span className="text-xs font-semibold text-slate-400">Alerts Active</span>
                </h3>
              </div>
            </GlassCard>
          </div>

          {/* Main Charts for Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Financial Trend */}
            <div className="lg:col-span-2">
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Financial Inward/Outward Flow</h3>
                    <p className="text-[11px] text-slate-500">Transaction volumes of purchases and dispatches (Last 7 working days)</p>
                  </div>
                  <Calendar className="w-4 h-4 text-slate-400" />
                </div>
                
                <div className="flex-1 min-h-[260px] w-full text-xs">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPurchase" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDispatch" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                      <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                      <Area type="monotone" dataKey="Purchase" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPurchase)" />
                      <Area type="monotone" dataKey="Dispatch" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorDispatch)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>

            {/* Stacked Branch Share chart */}
            <div>
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Branch Stock Share (Tons)</h3>
                  <p className="text-[11px] text-slate-500">Inventory comparison of raw aggregates vs finished goods</p>
                </div>

                <div className="flex-1 min-h-[260px] w-full text-xs">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={branchComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip formatter={(value) => [`${value} Tons`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="Raw Material" fill="#2c6f55" stackId="a" />
                      <Bar dataKey="Finished Good" fill="#4f46e5" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Activity Logs & Branch Share summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent activities */}
            <div className="lg:col-span-2">
              <GlassCard className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recent Transactions Log</h3>
                  <Clock className="w-4 h-4 text-slate-400" />
                </div>
                
                <div className="space-y-3.5">
                  {recentLogs.length === 0 ? (
                    <p className="text-slate-500 text-xs py-4 text-center">No transaction logs recorded yet.</p>
                  ) : (
                    recentLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 text-xs border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider shrink-0 ${log.color}`}>
                            {log.type}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-700 leading-normal line-clamp-1">{log.title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{log.subtitle}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-800">{log.value}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">{log.date}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Simple branch summaries cards */}
            <div className="space-y-4">
              <GlassCard className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Branch Stock Quick View</h3>
                <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto pr-1">
                  {branchRawData.map((raw, idx) => {
                    const fg = branchFGData.find(f => f.name === raw.name) || { value: 0 };
                    return (
                      <div key={idx} className="py-2.5 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                        <div>
                          <strong className="text-slate-700">{raw.name} Branch</strong>
                          <p className="text-[10px] text-slate-400 mt-0.5">RM: {raw.itemCount} items | FG: {fg.itemCount} items</p>
                        </div>
                        <div className="text-right">
                          <strong className="text-slate-800">{(raw.value + fg.value).toLocaleString()} Tons</strong>
                          <p className="text-[9px] text-slate-400 mt-0.5">RM: {raw.value} T | FG: {fg.value} T</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      )}

      {/* ======================= RAW MATERIALS VIEW ======================= */}
      {activeTab === 'raw_materials' && (
        <div className="space-y-6 animate-fade-in">
          {/* Raw Materials KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="flex items-center gap-4 hover" hover glow>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Raw Materials</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.totalRawStockTons.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Inventory Value</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  ₹{stats.rawValuation.toLocaleString('en-IN')}
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Active Items Count</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.activeRawItemsCount} <span className="text-xs font-semibold text-slate-400">Products</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className={`flex items-center gap-4 hover border-l-4 ${stats.rawLowStockCount > 0 ? 'border-l-amber-500' : 'border-l-emerald-500'}`} hover>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                stats.rawLowStockCount > 0 
                  ? 'bg-amber-950/10 border-amber-500/20 text-amber-600' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Low Stock Warnings</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.rawLowStockCount} <span className="text-xs font-semibold text-slate-400">Items Low</span>
                </h3>
              </div>
            </GlassCard>
          </div>

          {/* Raw Stock Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Optimum vs Actual Stock */}
            <div className="lg:col-span-2">
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Optimum vs. Actual Levels (Tons)</h3>
                    <p className="text-[11px] text-slate-500">Current actual stock versus optimized minimum buffer limits</p>
                  </div>
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                </div>
                
                <div className="flex-1 min-h-[260px] w-full text-xs">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={rawChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="Actual" fill="#2c6f55" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Optimum" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>

            {/* Raw material branch share pie */}
            <div>
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">RM Regional Distribution</h3>
                  <p className="text-[11px] text-slate-500">Total raw materials stock weight distribution</p>
                </div>

                <div className="flex-1 min-h-[220px] relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={branchRawData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {branchRawData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                      <Legend iconSize={8} layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Raw Material Low Stock Warnings & Detailed Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Warning log */}
            <div className="space-y-4">
              <GlassCard className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Critical RM Deficits</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-500/10">
                    {stats.rawLowStockCount} Warnings
                  </span>
                </div>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {rawInventory.filter(item => item.actualLevel <= item.optimumStock).length === 0 ? (
                    <p className="text-slate-500 text-xs py-4 text-center">All materials exceed target limits.</p>
                  ) : (
                    rawInventory
                      .filter(item => item.actualLevel <= item.optimumStock)
                      .map((item, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-semibold text-slate-700">{item.itemName}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Branch: <span className="font-medium">{item.branchName}</span></p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-amber-700">{item.actualLevel.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-500 ml-1">{item.unit}</span>
                            <p className="text-[9px] text-slate-400 mt-0.5">Optimum: {item.optimumStock}</p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Detailed table view */}
            <div className="lg:col-span-2">
              <GlassCard className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Raw Material Stock Breakdown</h3>
                <div className="overflow-x-auto max-h-[350px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <th className="p-2.5 font-bold">Material Name</th>
                        <th className="p-2.5 font-bold">Branch</th>
                        <th className="p-2.5 font-bold text-right">Actual Level</th>
                        <th className="p-2.5 font-bold text-right">Optimum level</th>
                        <th className="p-2.5 font-bold text-right">Valuation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rawInventory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-semibold text-slate-700">{item.itemName}</td>
                          <td className="p-2.5 text-slate-500">{item.branchName}</td>
                          <td className={`p-2.5 text-right font-bold ${item.actualLevel <= item.optimumStock ? 'text-amber-600' : 'text-slate-800'}`}>
                            {item.actualLevel.toLocaleString()} {item.unit}
                          </td>
                          <td className="p-2.5 text-right text-slate-500">{item.optimumStock.toLocaleString()} {item.unit}</td>
                          <td className="p-2.5 text-right font-semibold text-slate-600">₹{item.valuation.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>

          </div>
        </div>
      )}

      {/* ======================= FINISHED GOODS VIEW ======================= */}
      {activeTab === 'finished_goods' && (
        <div className="space-y-6 animate-fade-in">
          {/* Finished Goods KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassCard className="flex items-center gap-4 hover" hover glow>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total FG Stock</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.totalFGStockTons.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Pending Orders</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.fgPendingOrders.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Production Output</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.fgProduction.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>

            <GlassCard className="flex items-center gap-4 hover" hover>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Fulfill Dispatched</p>
                <h3 className="text-xl font-bold mt-0.5 text-slate-800">
                  {stats.fgSales.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Tons</span>
                </h3>
              </div>
            </GlassCard>
          </div>

          {/* Finished Goods Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Production vs Sales bar chart */}
            <div className="lg:col-span-2">
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div className="flex items-center justify-between pb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fulfillment & Output Balance by Product</h3>
                    <p className="text-[11px] text-slate-500">Current available stock versus pending backlogs and total dispatches</p>
                  </div>
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                </div>
                
                <div className="flex-1 min-h-[260px] w-full text-xs">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={fgChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="Stock" fill="#4f46e5" name="Stock Level" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Sales" fill="#10b981" name="Completed Dispatches" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pending" fill="#ef4444" name="Sales Backlog" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>

            {/* Finished Goods branch share pie */}
            <div>
              <GlassCard className="h-[360px] flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">FG Regional Distribution</h3>
                  <p className="text-[11px] text-slate-500">Total finished goods stock weight distribution</p>
                </div>

                <div className="flex-1 min-h-[220px] relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={branchFGData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {branchFGData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                      <Legend iconSize={8} layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Finished Goods Deficits & Detailed Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Deficit Alert panel */}
            <div className="space-y-4">
              <GlassCard className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sales Backlog Warnings</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold border border-rose-500/10">
                    {fgDeficitAlerts.length} Shortages
                  </span>
                </div>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {fgDeficitAlerts.length === 0 ? (
                    <p className="text-slate-500 text-xs py-4 text-center">All pending dispatches have enough available stock.</p>
                  ) : (
                    fgDeficitAlerts.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-slate-700">{item.productName}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Branch: <span className="font-medium">{item.branchName}</span></p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-rose-700">-{item.deficit.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500 ml-1">{item.unit}</span>
                          <p className="text-[9px] text-slate-400 mt-0.5">Available: {item.currentLevel} | Pending: {item.salesOrderPending}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>
            </div>

            {/* Detailed Table */}
            <div className="lg:col-span-2">
              <GlassCard className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Finished Goods Master Breakdown</h3>
                <div className="overflow-x-auto max-h-[350px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <th className="p-2.5 font-bold">Product Name</th>
                        <th className="p-2.5 font-bold">Branch</th>
                        <th className="p-2.5 font-bold text-right">Current Level</th>
                        <th className="p-2.5 font-bold text-right">Production</th>
                        <th className="p-2.5 font-bold text-right">Pending Sales</th>
                        <th className="p-2.5 font-bold text-right">Fulfill Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fgInventory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-semibold text-slate-700">{item.productName}</td>
                          <td className="p-2.5 text-slate-500">{item.branchName}</td>
                          <td className={`p-2.5 text-right font-bold ${item.currentLevel < item.salesOrderPending ? 'text-rose-600' : 'text-slate-800'}`}>
                            {item.currentLevel.toLocaleString()} {item.unit}
                          </td>
                          <td className="p-2.5 text-right text-slate-500">{item.production.toLocaleString()} {item.unit}</td>
                          <td className="p-2.5 text-right text-slate-500">{item.salesOrderPending.toLocaleString()} {item.unit}</td>
                          <td className="p-2.5 text-right">
                            {item.currentLevel >= item.salesOrderPending ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                Safe
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                Shortage
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
