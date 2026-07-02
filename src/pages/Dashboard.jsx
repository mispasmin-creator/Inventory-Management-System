import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiService } from '../services/api';
import GlassCard from '../components/GlassCard';
import { DashboardSkeleton } from '../components/Skeleton';
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
  ClipboardList,
  Building2,
  Search,
  Sparkles
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

  const getFontSizeClass = (value) => {
    const str = String(value);
    if (str.length > 14) return 'text-lg sm:text-xl';
    if (str.length > 10) return 'text-xl sm:text-2xl';
    return 'text-2xl';
  };
  const [activeTab, setActiveTab] = useState('raw_materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFirm, setSelectedFirm] = useState('All');
  const [top5SubTab, setTop5SubTab] = useState('best');
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
      const rawBranches = user.branch === 'All' 
        ? ['Pmmpl', 'Rkl', 'Purab'] 
        : (Array.isArray(user.branch) ? user.branch : [user.branch]);
      const branchesToFetch = rawBranches
        .map(b => b === 'Madhya' ? 'Pmmpl' : b)
        .filter(b => b && b.toLowerCase() !== 'main');
      
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

      // Fetch all data in parallel at the global level
      const [allRawItems, allFGItems, reports] = await Promise.all([
        apiService.getInventory('All'),
        apiService.getFinishGoodInventory('All'),
        apiService.getReports()
      ]);

      for (const bName of branchesToFetch) {
        const displayBranch = bName === 'Madhya' ? 'Pmmpl' : bName;
        // Filter Raw Materials locally
        const normalizedBranch = displayBranch?.toLowerCase().trim();
        const items = allRawItems.filter(item => {
          if (!normalizedBranch || normalizedBranch === 'all') return true;
          const firmName = String(item.firm_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normalizedBranch === 'pmmpl' || normalizedBranch === 'madhya') {
            return firmName.includes('pmmpl') || firmName.includes('madhya');
          }
          return firmName.includes(normalizedBranch);
        });

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
            branchName: displayBranch,
            actualLevel,
            optimumStock,
            unit: itemUnit,
            rate: itemRate,
            valuation: itemValuation
          });
        });

        branchRawSummaries.push({
          name: displayBranch,
          value: Math.round(branchRawWeight),
          itemCount: items.length
        });

        // Filter Finished Goods locally
        const b = displayBranch ? displayBranch.toLowerCase().trim() : '';
        let fgItems = allFGItems.filter(fgItem => {
          if (!b || b === 'all') return true;
          const firmName = String(fgItem.firm_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (b === 'pmmpl' || b === 'madhya') {
            return firmName.includes('pmmpl') || firmName.includes('madhya');
          }
          return firmName.includes(b);
        });

        if (!fgItems || fgItems.length === 0) {
          fgItems = generateMockFinishedGoods(displayBranch);
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
            branchName: displayBranch,
            currentLevel,
            salesOrderPending: pendingOrder,
            production: productionQty,
            sales: salesQty,
            unit: 'Ton'
          });
        });

        branchFGSummaries.push({
          name: displayBranch,
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
        const fgSum = fgItemsList.filter(item => item.currentLevel !== undefined && item.branchName === bName).reduce((sum, item) => sum + item.currentLevel, 0);
        return {
          name: bName,
          'Raw Material': Math.round(rawSum),
          'Finished Good': Math.round(fgSum)
        };
      });
      
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

  // Premium color palettes matching CSS (declared below)

  // Calculate Finished Goods Deficit Alerts
  const fgDeficitAlerts = fgInventory
    .filter(item => item.currentLevel < item.salesOrderPending)
    .map(item => ({
      ...item,
      deficit: item.salesOrderPending - item.currentLevel
    }));

  const totalOverviewAlerts = stats.rawLowStockCount + fgDeficitAlerts.length;

  // Extract unique branches dynamically
  const uniqueBranches = Array.from(new Set([
    ...rawInventory.map(item => item.branchName === 'Madhya' ? 'Pmmpl' : item.branchName),
    ...fgInventory.map(item => item.branchName === 'Madhya' ? 'Pmmpl' : item.branchName)
  ])).filter(b => Boolean(b) && b.toLowerCase() !== 'main');

  // Dynamic filter lists based on selected branch and search query
  const filteredRaw = rawInventory.filter(item => {
    const targetFirm = selectedFirm.toLowerCase() === 'madhya' ? 'pmmpl' : selectedFirm.toLowerCase();
    const itemFirm = item.branchName.toLowerCase() === 'madhya' ? 'pmmpl' : item.branchName.toLowerCase();
    const matchesFirm = selectedFirm === 'All' || itemFirm === targetFirm;
    const matchesSearch = searchQuery === '' || item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFirm && matchesSearch;
  });

  const filteredFG = fgInventory.filter(item => {
    const targetFirm = selectedFirm.toLowerCase() === 'madhya' ? 'pmmpl' : selectedFirm.toLowerCase();
    const itemFirm = item.branchName.toLowerCase() === 'madhya' ? 'pmmpl' : item.branchName.toLowerCase();
    const matchesFirm = selectedFirm === 'All' || itemFirm === targetFirm;
    const matchesSearch = searchQuery === '' || item.productName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFirm && matchesSearch;
  });

  // 1. Raw Materials Metrics (Filtered)
  const totalRMStock = filteredRaw.reduce((sum, item) => sum + (item.actualLevel || 0), 0);
  const totalRMValuation = filteredRaw.reduce((sum, item) => sum + (item.valuation || 0), 0);
  const rmLowStockCount = filteredRaw.filter(item => item.actualLevel <= item.optimumStock).length;
  const avgRMStock = filteredRaw.length > 0 ? (totalRMStock / filteredRaw.length) : 0;
  const avgRMRate = totalRMStock > 0 ? (totalRMValuation / totalRMStock) : 0;
  const totalRMOptimum = filteredRaw.reduce((sum, item) => sum + (item.optimumStock || 0), 0);

  // 2. Finished Goods Metrics (Filtered)
  const totalFGStock = filteredFG.reduce((sum, item) => sum + (item.currentLevel || 0), 0);
  const totalFGBacklog = filteredFG.reduce((sum, item) => sum + (item.salesOrderPending || 0), 0);
  const totalFGProduction = filteredFG.reduce((sum, item) => sum + (item.production || 0), 0);
  const totalFGSales = filteredFG.reduce((sum, item) => sum + (item.sales || 0), 0);
  const fgShortageCount = filteredFG.filter(item => item.currentLevel < item.salesOrderPending).length;
  const stockCoverageRatio = (totalFGStock + totalFGBacklog) > 0 
    ? (totalFGStock / (totalFGStock + totalFGBacklog)) * 100 
    : 100;
  const avgFGStock = filteredFG.length > 0 ? (totalFGStock / filteredFG.length) : 0;
  const avgFGProd = filteredFG.length > 0 ? (totalFGProduction / filteredFG.length) : 0;
  const avgFGSales = filteredFG.length > 0 ? (totalFGSales / filteredFG.length) : 0;

  // Branch summaries for quick-filter cards
  const branchSummaries = uniqueBranches.map(bName => {
    const targetB = bName.toLowerCase() === 'madhya' ? 'pmmpl' : bName.toLowerCase();
    // RM calculations
    const branchRM = rawInventory.filter(x => (x.branchName.toLowerCase() === 'madhya' ? 'pmmpl' : x.branchName.toLowerCase()) === targetB);
    const rmStock = branchRM.reduce((sum, x) => sum + (x.actualLevel || 0), 0);
    const rmVal = branchRM.reduce((sum, x) => sum + (x.valuation || 0), 0);
    const rmLow = branchRM.filter(x => x.actualLevel <= x.optimumStock).length;

    // FG calculations
    const branchFG = fgInventory.filter(x => (x.branchName.toLowerCase() === 'madhya' ? 'pmmpl' : x.branchName.toLowerCase()) === targetB);
    const fgStock = branchFG.reduce((sum, x) => sum + (x.currentLevel || 0), 0);
    const fgBack = branchFG.reduce((sum, x) => sum + (x.salesOrderPending || 0), 0);
    const fgProd = branchFG.reduce((sum, x) => sum + (x.production || 0), 0);

    return {
      name: bName,
      rmStock,
      rmVal,
      rmLow,
      fgStock,
      fgBack,
      fgProd
    };
  });

  // Calculate dynamic Top 5 based on active tab
  const getTop5Data = () => {
    if (activeTab === 'raw_materials') {
      if (top5SubTab === 'best') {
        // Highest actual stock levels
        return [...filteredRaw]
          .sort((a, b) => b.actualLevel - a.actualLevel)
          .slice(0, 5)
          .map(x => ({ name: x.itemName, branch: x.branchName, value: x.actualLevel, unit: x.unit }));
      } else if (top5SubTab === 'worst') {
        // Deficits where stock is below buffer
        return [...filteredRaw]
          .map(x => ({ 
            name: x.itemName, 
            branch: x.branchName, 
            value: x.optimumStock - x.actualLevel, 
            rawVal: x.actualLevel,
            optimum: x.optimumStock,
            unit: x.unit 
          }))
          .sort((a, b) => b.value - a.value) // Sort by largest shortage
          .slice(0, 5);
      } else {
        // Valuation
        return [...filteredRaw]
          .sort((a, b) => b.valuation - a.valuation)
          .slice(0, 5)
          .map(x => ({ name: x.itemName, branch: x.branchName, value: x.valuation, unit: '₹' }));
      }
    } else {
      if (top5SubTab === 'best') {
        // Highest FG stock levels
        return [...filteredFG]
          .sort((a, b) => b.currentLevel - a.currentLevel)
          .slice(0, 5)
          .map(x => ({ name: x.productName, branch: x.branchName, value: x.currentLevel, unit: x.unit || 'Tons' }));
      } else if (top5SubTab === 'worst') {
        // High sales backlogs
        return [...filteredFG]
          .map(x => ({ 
            name: x.productName, 
            branch: x.branchName, 
            value: x.salesOrderPending - x.currentLevel, 
            rawVal: x.currentLevel,
            optimum: x.salesOrderPending,
            unit: x.unit || 'Tons' 
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
      } else {
        // Dispatches (completed sales)
        return [...filteredFG]
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5)
          .map(x => ({ name: x.productName, branch: x.branchName, value: x.sales, unit: x.unit || 'Tons' }));
      }
    }
  };

  const top5List = getTop5Data();
  const maxTop5Val = Math.max(...top5List.map(x => x.value), 1);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-1.5">
        <DashboardSkeleton />
      </div>
    );
  }

  // Premium color palettes matching CSS
  const COLORS = ['var(--brand-green)', 'var(--chart-blue)', 'var(--chart-purple)', '#06b6d4', 'var(--chart-amber)', 'var(--chart-green)', 'var(--chart-red)'];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up pb-12">
      
      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/60 dark:border-[#2e382d] pb-5">
        <div>
          <h2 className="text-2xl font-black text-(--ink) tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600 dark:text-emerald-500 animate-pulse" />
            <span>Industrial Control Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Real-time material stocks, branch valuations, and fulfillment deficits monitor.
          </p>
        </div>

        {/* Global Search and Reset */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'raw_materials' ? 'materials' : 'finished goods'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-64 text-xs font-semibold rounded-xl glass-input bg-white dark:bg-[#121812] border border-slate-200 dark:border-[#2e382d] text-slate-700 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {selectedFirm !== 'All' && (
            <button
              onClick={() => setSelectedFirm('All')}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-rose-500/25 bg-rose-50/10 text-rose-600 dark:text-rose-400 hover:bg-rose-50/20 transition-all duration-200"
            >
              Clear Filter ({selectedFirm})
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Center Screen Tab Selector */}
      <div className="flex justify-center w-full my-4">
        <div className="inline-flex p-1.5 bg-(--surface-mid) rounded-2xl border border-(--line) shadow-inner">
          <button
            onClick={() => {
              setActiveTab('raw_materials');
              setTop5SubTab('best');
              setSearchQuery('');
            }}
            className={`flex items-center gap-2.5 px-7 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
              activeTab === 'raw_materials'
                ? 'bg-linear-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/10'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Raw Materials
          </button>
          <button
            onClick={() => {
              setActiveTab('finished_goods');
              setTop5SubTab('best');
              setSearchQuery('');
            }}
            className={`flex items-center gap-2.5 px-7 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
              activeTab === 'finished_goods'
                ? 'bg-linear-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/10'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            Finished Goods
          </button>
        </div>
      </div>

      {/* 3. Firm-Wise Interactive Quick Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
            <span>Interactive Branch Stocks Selector</span>
          </h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
            (Click a card to filter all dashboard indicators for that branch)
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card: All Branches */}
          <div
            onClick={() => setSelectedFirm('All')}
            className={`cursor-pointer rounded-2xl p-4.5 border transition-all duration-300 ${
              selectedFirm === 'All'
                ? 'border-(--brand-green) bg-(--brand-green-soft) ring-2 ring-(--brand-green)/10 shadow-sm'
                : 'border-(--line) bg-(--surface) hover:scale-[1.01] hover:border-slate-350 dark:hover:border-[#4b5563]'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-extrabold uppercase tracking-wide text-(--ink)">All Branches</span>
              <div className={`w-2 h-2 rounded-full ${selectedFirm === 'All' ? 'bg-emerald-500 animate-ping' : 'bg-slate-300 dark:bg-slate-700'}`} />
            </div>
            <div className="mt-4 flex flex-col gap-1">
              {activeTab === 'raw_materials' ? (
                <>
                  <span className="text-2xl font-black text-(--ink)">
                    {rawInventory.reduce((sum, x) => sum + (x.actualLevel || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Tons Raw Stock</span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-black text-(--ink)">
                    {fgInventory.reduce((sum, x) => sum + (x.currentLevel || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Tons FG Stock</span>
                </>
              )}
            </div>
          </div>

          {/* Cards for each Branch */}
          {branchSummaries.map((bSummary, idx) => {
            const isSelected = selectedFirm.toLowerCase() === bSummary.name.toLowerCase();
            return (
              <div
                key={idx}
                onClick={() => setSelectedFirm(isSelected ? 'All' : bSummary.name)}
                className={`cursor-pointer rounded-2xl p-4.5 border transition-all duration-300 ${
                  isSelected
                    ? 'border-(--brand-green) bg-(--brand-green-soft) ring-2 ring-(--brand-green)/10 shadow-sm'
                    : 'border-(--line) bg-(--surface) hover:scale-[1.01] hover:border-slate-300 dark:hover:border-[#4b5563]'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-(--ink)">
                    {bSummary.name}
                  </span>
                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-500 animate-ping' : 'bg-slate-300 dark:bg-slate-700'}`} />
                </div>
                
                <div className="mt-4 flex flex-col gap-1">
                  {activeTab === 'raw_materials' ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-(--ink)">
                          {bSummary.rmStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">Tons</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
                        <span>₹{(bSummary.rmVal / 10000000).toFixed(2)} Cr</span>
                        {bSummary.rmLow > 0 && (
                          <span className="text-rose-500 font-extrabold bg-rose-500/10 px-1.5 py-0.5 rounded">
                            {bSummary.rmLow} Alerts
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-(--ink)">
                          {bSummary.fgStock.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">Tons</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-1">
                        <span>Order: {bSummary.fgBack.toLocaleString(undefined, { maximumFractionDigits: 0 })} T</span>
                        {bSummary.fgStock < bSummary.fgBack && (
                          <span className="text-rose-500 font-extrabold bg-rose-500/10 px-1.5 py-0.5 rounded">
                            Shortage
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Active Tab KPI Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeTab === 'raw_materials' ? (
          <>
            {/* KPI 1: RM Total Stock */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-emerald-700 dark:border-l-emerald-500 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Total Raw Stock</p>
                <Boxes className="w-4 h-4 text-emerald-750 dark:text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {totalRMStock.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tons Stocked</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                Across {filteredRaw.length} active material classes
              </div>
            </div>

            {/* KPI 2: RM Valuation */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-emerald-600 dark:border-l-emerald-400 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Stock Assets Value</p>
                <DollarSign className="w-4 h-4 text-emerald-650 dark:text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  ₹{totalRMValuation.toLocaleString('en-IN')}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Valuation</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                Valued based on latest purchase rates
              </div>
            </div>

            {/* KPI 3: RM Low Stock Warnings */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-amber-500 dark:border-l-amber-500 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Critical Buffer Warning</p>
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {rmLowStockCount}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Items Low</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2 flex items-center gap-1">
                {rmLowStockCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold">Needs immediate reorder plan</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">All buffer stock safe</span>
                )}
              </div>
            </div>

            {/* KPI 4: RM Average Stock per item */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-emerald-800 dark:border-l-emerald-600 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Average Item Density</p>
                <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {avgRMStock.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg Tons / Item</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                Avg rate: ₹{avgRMRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} / Ton
              </div>
            </div>
          </>
        ) : (
          <>
            {/* KPI 1: FG Total Stock */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-emerald-700 dark:border-l-emerald-500 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Finished Goods Stock</p>
                <Boxes className="w-4 h-4 text-emerald-750 dark:text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {totalFGStock.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tons Inventory</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                Total production items in stock
              </div>
            </div>

            {/* KPI 2: FG Pending Backlog */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-amber-500 dark:border-l-amber-500 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Sales Backlog</p>
                <ClipboardList className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {totalFGBacklog.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tons Pending</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2 flex justify-between">
                <span>Coverage Ratio:</span>
                <span className="font-extrabold text-emerald-700 dark:text-emerald-400">{stockCoverageRatio.toFixed(1)}%</span>
              </div>
            </div>

            {/* KPI 3: FG Shortages warnings */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-rose-500 dark:border-l-rose-500 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Logistics Shortages</p>
                <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-450" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {fgShortageCount}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Items Shorted</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                {fgShortageCount > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">Requires urgent crushing planning</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Fulfillment queue safe</span>
                )}
              </div>
            </div>

            {/* KPI 4: FG Production vs sales */}
            <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) border-l-4 border-l-emerald-600 dark:border-l-emerald-400 shadow-sm flex flex-col justify-between transition-all duration-300 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider">Completed Sales (Dispatches)</p>
                <Truck className="w-4 h-4 text-emerald-700 dark:text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 mt-4 flex-wrap">
                <span className="font-extrabold tracking-tight text-(--ink) text-2xl">
                  {totalFGSales.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tons Dispatched</span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-2">
                Production output: {totalFGProduction.toLocaleString()} Tons
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Top 5 Performance, Deficits, & Valuation Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Top 5 Analytics list (col-span-2) */}
        <div className="lg:col-span-2">
          <GlassCard className="h-[400px] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#2e382d] pb-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-(--ink) flex items-center gap-1.5 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                  <span>Top 5 Stock performance insights</span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Performance-ranked categories and buffer safety margins.
                </p>
              </div>
              
              {/* Performance sub-tabs selector */}
              <div className="inline-flex p-1 bg-(--surface-mid) rounded-xl border border-(--line) text-[10px] font-bold">
                <button
                  onClick={() => setTop5SubTab('best')}
                  className={`px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    top5SubTab === 'best'
                      ? 'bg-(--surface) text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Best Stocks
                </button>
                <button
                  onClick={() => setTop5SubTab('worst')}
                  className={`px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    top5SubTab === 'worst'
                      ? 'bg-(--surface) text-rose-600 dark:text-rose-400 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Worst / Shortages
                </button>
                <button
                  onClick={() => setTop5SubTab('valuation')}
                  className={`px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    top5SubTab === 'valuation'
                      ? 'bg-(--surface) text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {activeTab === 'raw_materials' ? 'Valuation' : 'Dispatches'}
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs">
              {top5List.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                  No stock records match the selected branch/filter.
                </div>
              ) : (
                top5List.map((item, idx) => {
                  const percentage = Math.min(100, (item.value / maxTop5Val) * 100);
                  
                  // Decide visual indicators based on tab selection
                  let progressColor = 'bg-linear-to-r from-emerald-500 to-teal-500';
                  let iconColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400';
                  if (top5SubTab === 'worst') {
                    progressColor = 'bg-linear-to-r from-rose-500 to-red-500';
                    iconColor = 'bg-rose-100 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400';
                  } else if (top5SubTab === 'valuation') {
                    progressColor = 'bg-linear-to-r from-indigo-500 to-blue-500';
                    iconColor = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400';
                  }

                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold ${iconColor}`}>
                            #{idx + 1}
                          </span>
                          <span className="font-extrabold text-(--ink) text-xs">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#171f17] text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase">
                            {item.branch}
                          </span>
                        </div>
                        <div className="text-right font-bold text-slate-700 dark:text-slate-300">
                          {item.unit === '₹' ? '₹' : ''}
                          {item.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} 
                          {item.unit !== '₹' ? ` ${item.unit}` : ''}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100/80 dark:bg-[#171f17] rounded-full h-2 overflow-hidden border border-slate-200/20">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${progressColor}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        {item.optimum !== undefined && (
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                            (Target: {item.optimum} Tons)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>
        </div>

        {/* Side Panel: Average stats & warnings details */}
        <div>
          <GlassCard className="h-[400px] flex flex-col justify-between">
            <div className="border-b border-slate-100 dark:border-[#2e382d] pb-2 mb-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                <span>Overall averages & security</span>
              </h3>
            </div>

            {/* Averages List */}
            <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
              {activeTab === 'raw_materials' ? (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Average Buffer Capacity</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Average minimum stock safety buffer</p>
                    </div>
                    <div className="text-right font-black text-(--ink) text-base">
                      {(totalRMOptimum / (filteredRaw.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-400 font-bold">Tons</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Safety Buffer Deficit Ratio</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Percentage of items under optimum levels</p>
                    </div>
                    <div className="text-right font-black text-rose-500 text-base">
                      {filteredRaw.length > 0 ? ((rmLowStockCount / filteredRaw.length) * 100).toFixed(0) : 0}%
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Average Unit Cost</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Weighted average value of aggregate stocks</p>
                    </div>
                    <div className="text-right font-black text-(--ink) text-base">
                      ₹{avgRMRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400 font-bold">/ T</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Average Stock / Product</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Average current level of finished goods</p>
                    </div>
                    <div className="text-right font-black text-(--ink) text-base">
                      {avgFGStock.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-400 font-bold">Tons</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Average Production Output</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Avg tons yielded per finished product</p>
                    </div>
                    <div className="text-right font-black text-emerald-600 text-base">
                      {avgFGProd.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-400 font-bold">Tons</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f17] border border-slate-200/50 dark:border-[#2e382d] flex justify-between items-center text-xs">
                    <div>
                      <p className="font-extrabold text-(--ink)">Average Completed Dispatches</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Avg completed logistics dispatches</p>
                    </div>
                    <div className="text-right font-black text-(--ink) text-base">
                      {avgFGSales.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span className="text-[10px] text-slate-400 font-bold">Tons</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Warning Alert pill bottom */}
            <div className="mt-2 pt-2.5 border-t border-slate-100 dark:border-[#2e382d] flex items-center gap-2.5 text-[11px] font-semibold text-slate-500">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-500 animate-spin" style={{ animationDuration: '4s' }} />
              <span>Real-time DB synchronization is active</span>
            </div>
          </GlassCard>
        </div>

      </div>

      {/* 6. Charts Section */}
      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'raw_materials' ? (
          <GlassCard className="h-[360px] flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Raw Materials Optimum vs. Actual Stock Comparison
                </h3>
                <p className="text-[11px] text-slate-500">
                  Actual loaded levels compared directly against threshold buffers (First 10 items)
                </p>
              </div>
              <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>
            
            <div className="flex-1 min-h-[260px] w-full text-xs">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={filteredRaw.slice(0, 10)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="itemName" stroke="#64748b" fontSize={9} />
                  <YAxis stroke="#64748b" fontSize={9} />
                  <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="actualLevel" fill="var(--brand-green)" name="Actual Stock level" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="optimumStock" fill="var(--chart-amber)" name="Optimum Target level" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="h-[360px] flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Finished Goods Production, Sales & Stock Balance
                </h3>
                <p className="text-[11px] text-slate-500">
                  Visual tracking of inventory, pending backlogs, production logs, and completed dispatches (First 10 items)
                </p>
              </div>
              <BarChart3 className="w-4 h-4 text-slate-400" />
            </div>
            
            <div className="flex-1 min-h-[260px] w-full text-xs">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={filteredFG.slice(0, 10)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="productName" stroke="#64748b" fontSize={9} />
                  <YAxis stroke="#64748b" fontSize={9} />
                  <Tooltip formatter={(value) => [`${value.toLocaleString()} Tons`]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="currentLevel" fill="var(--chart-blue)" name="Current Available Stock" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="production" fill="var(--chart-green)" name="Production Output" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales" fill="var(--chart-amber)" name="Completed Sales" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="salesOrderPending" fill="var(--chart-red)" name="Sales Backlog" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        )}
      </div>

      {/* 7. Detailed Stock Master Breakdown Table */}
      <GlassCard className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#2e382d] pb-2">
          <div>
            <h3 className="text-sm font-black text-(--ink) uppercase tracking-wide">
              {activeTab === 'raw_materials' ? 'Raw Materials Inventory Ledger' : 'Finished Goods Inventory Ledger'}
            </h3>
            <p className="text-[10px] text-slate-400">
              Showing {activeTab === 'raw_materials' ? filteredRaw.length : filteredFG.length} tracked items for selected filters.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px]">
          {activeTab === 'raw_materials' ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#171f17] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-2.5 font-bold">Material Name</th>
                  <th className="px-4 py-2.5 font-bold">Branch</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actual Stock</th>
                  <th className="px-4 py-2.5 font-bold text-right">Optimum Buffer</th>
                  <th className="px-4 py-2.5 font-bold text-right">Unit rate</th>
                  <th className="px-4 py-2.5 font-bold text-right">Total Valuation</th>
                  <th className="px-4 py-2.5 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2e382d]">
                {filteredRaw.map((item, idx) => {
                  const actualLevel = item.actualLevel ?? 0;
                  const optimumStock = item.optimumStock ?? 0;
                  const isLow = actualLevel <= optimumStock;
                  const rate = item.rate ?? 0;
                  const valuation = item.valuation ?? 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-brand-green-soft">
                      <td className="px-4 py-2.5 font-semibold text-(--ink)">{item.itemName}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-bold uppercase">{item.branchName}</td>
                      <td className={`px-4 py-2.5 text-right font-black ${isLow ? 'text-rose-600' : 'text-(--ink)'}`}>
                        {actualLevel.toLocaleString(undefined, { maximumFractionDigits: 1 })} {item.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{optimumStock.toLocaleString()} {item.unit}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">₹{rate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-600 dark:text-slate-400">₹{valuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-center">
                        {isLow ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30">
                            Critical Alert
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                            Safe Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#171f17] text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-2.5 font-bold">Product Name</th>
                  <th className="px-4 py-2.5 font-bold">Branch</th>
                  <th className="px-4 py-2.5 font-bold text-right">Available Stock</th>
                  <th className="px-4 py-2.5 font-bold text-right">Production</th>
                  <th className="px-4 py-2.5 font-bold text-right">Sales / Dispatched</th>
                  <th className="px-4 py-2.5 font-bold text-right">Pending Backlog</th>
                  <th className="px-4 py-2.5 font-bold text-center">Fulfillment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2e382d]">
                {filteredFG.map((item, idx) => {
                  const currentLevel = item.currentLevel ?? 0;
                  const pending = item.salesOrderPending ?? 0;
                  const hasShortage = currentLevel < pending;
                  const production = item.production ?? 0;
                  const sales = item.sales ?? 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-brand-green-soft">
                      <td className="px-4 py-2.5 font-semibold text-(--ink)">{item.productName}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-bold uppercase">{item.branchName}</td>
                      <td className={`px-4 py-2.5 text-right font-black ${hasShortage ? 'text-rose-600' : 'text-(--ink)'}`}>
                        {currentLevel.toLocaleString(undefined, { maximumFractionDigits: 1 })} {item.unit || 'Tons'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{production.toLocaleString()} Tons</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{sales.toLocaleString()} Tons</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{pending.toLocaleString()} Tons</td>
                      <td className="px-4 py-2.5 text-center">
                        {hasShortage ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30">
                            Shortage Warning
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                            Fulfillment Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

    </div>
  );
};

export default Dashboard;
