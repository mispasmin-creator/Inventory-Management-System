// Mock Database and Helper Functions for Local Persistence
// This mimics the Google Sheets database (Login, Main, Madhya, Rkl, Purab, Pmmpl Rate, Crushing Item)

const MOCK_STORAGE_KEY = 'mis_inventory_system_data';

// Helper to seed initial data
const initialData = {
  users: [
    { username: 'admin', password: '123', name: 'System Administrator', role: 'Admin', branch: 'All' },
    { username: 'manager_main', password: '123', name: 'Main Branch Manager', role: 'Branch Manager', branch: 'Main' },
    { username: 'manager_madhya', password: '123', name: 'Madhya Branch Manager', role: 'Branch Manager', branch: 'Madhya' },
    { username: 'viewer_rkl', password: '123', name: 'Rkl Viewer', role: 'Viewer', branch: 'Rkl' }
  ],
  branches: {
    Main: [
      { itemId: 'I-001', itemName: 'Boulder (Raw)', category: 'Boulder', unit: 'Ton', currentStock: 1450, openingStock: 1500, minThreshold: 500 },
      { itemId: 'I-002', itemName: '10mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 380, openingStock: 200, minThreshold: 150 },
      { itemId: 'I-003', itemName: '20mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 740, openingStock: 400, minThreshold: 200 },
      { itemId: 'I-004', itemName: '40mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 120, openingStock: 150, minThreshold: 100 },
      { itemId: 'I-005', itemName: 'WMM (Wet Mix Macadam)', category: 'Aggregates', unit: 'Ton', currentStock: 490, openingStock: 300, minThreshold: 150 },
      { itemId: 'I-006', itemName: 'Crushed Sand / Dust', category: 'Sand', unit: 'Ton', currentStock: 620, openingStock: 500, minThreshold: 200 },
      { itemId: 'I-007', itemName: 'Diesel', category: 'Fuel', unit: 'Litre', currentStock: 950, openingStock: 2000, minThreshold: 1000 },
      { itemId: 'I-008', itemName: 'OPC Cement 43 Grade', category: 'Cement', unit: 'Bag', currentStock: 400, openingStock: 500, minThreshold: 150 }
    ],
    Madhya: [
      { itemId: 'I-001', itemName: 'Boulder (Raw)', category: 'Boulder', unit: 'Ton', currentStock: 800, openingStock: 1000, minThreshold: 500 },
      { itemId: 'I-002', itemName: '10mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 190, openingStock: 100, minThreshold: 100 },
      { itemId: 'I-003', itemName: '20mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 250, openingStock: 200, minThreshold: 150 },
      { itemId: 'I-006', itemName: 'Crushed Sand / Dust', category: 'Sand', unit: 'Ton', currentStock: 180, openingStock: 300, minThreshold: 150 },
      { itemId: 'I-007', itemName: 'Diesel', category: 'Fuel', unit: 'Litre', currentStock: 2200, openingStock: 1500, minThreshold: 800 }
    ],
    Rkl: [
      { itemId: 'I-001', itemName: 'Boulder (Raw)', category: 'Boulder', unit: 'Ton', currentStock: 1200, openingStock: 1000, minThreshold: 500 },
      { itemId: 'I-002', itemName: '10mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 90, openingStock: 100, minThreshold: 100 },
      { itemId: 'I-003', itemName: '20mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 110, openingStock: 200, minThreshold: 150 },
      { itemId: 'I-006', itemName: 'Crushed Sand / Dust', category: 'Sand', unit: 'Ton', currentStock: 340, openingStock: 300, minThreshold: 150 },
      { itemId: 'I-007', itemName: 'Diesel', category: 'Fuel', unit: 'Litre', currentStock: 600, openingStock: 1000, minThreshold: 800 }
    ],
    Purab: [
      { itemId: 'I-001', itemName: 'Boulder (Raw)', category: 'Boulder', unit: 'Ton', currentStock: 600, openingStock: 500, minThreshold: 300 },
      { itemId: 'I-002', itemName: '10mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 140, openingStock: 100, minThreshold: 80 },
      { itemId: 'I-003', itemName: '20mm Aggregate', category: 'Aggregates', unit: 'Ton', currentStock: 310, openingStock: 150, minThreshold: 100 },
      { itemId: 'I-006', itemName: 'Crushed Sand / Dust', category: 'Sand', unit: 'Ton', currentStock: 150, openingStock: 200, minThreshold: 100 },
      { itemId: 'I-007', itemName: 'Diesel', category: 'Fuel', unit: 'Litre', currentStock: 1500, openingStock: 1200, minThreshold: 500 }
    ]
  },
  pmmplRates: [
    { rateId: 'R-001', itemName: 'Boulder (Raw)', rate: 450, effectiveDate: '2026-04-01', history: [{ date: '2026-01-01', rate: 430 }, { date: '2026-04-01', rate: 450 }] },
    { rateId: 'R-002', itemName: '10mm Aggregate', rate: 680, effectiveDate: '2026-05-01', history: [{ date: '2026-01-01', rate: 650 }, { date: '2026-05-01', rate: 680 }] },
    { rateId: 'R-003', itemName: '20mm Aggregate', rate: 720, effectiveDate: '2026-05-01', history: [{ date: '2026-01-01', rate: 700 }, { date: '2026-05-01', rate: 720 }] },
    { rateId: 'R-004', itemName: '40mm Aggregate', rate: 600, effectiveDate: '2026-03-15', history: [{ date: '2026-03-15', rate: 600 }] },
    { rateId: 'R-005', itemName: 'WMM (Wet Mix Macadam)', rate: 580, effectiveDate: '2026-05-10', history: [{ date: '2026-05-10', rate: 580 }] },
    { rateId: 'R-006', itemName: 'Crushed Sand / Dust', rate: 350, effectiveDate: '2026-04-15', history: [{ date: '2026-04-15', rate: 350 }] }
  ],
  crushingLogs: [
    { logId: 'C-001', date: '2026-05-20', inputItem: 'Boulder (Raw)', inputQty: 250, outputs: [{ itemName: '10mm Aggregate', qty: 70 }, { itemName: '20mm Aggregate', qty: 120 }, { itemName: 'Crushed Sand / Dust', qty: 50 }], recoveryRate: 96, notes: 'Standard efficiency crushing run' },
    { logId: 'C-002', date: '2026-05-22', inputItem: 'Boulder (Raw)', inputQty: 400, outputs: [{ itemName: '10mm Aggregate', qty: 110 }, { itemName: '20mm Aggregate', qty: 200 }, { itemName: 'Crushed Sand / Dust', qty: 75 }], recoveryRate: 96.25, notes: 'New crusher mantle validation' }
  ],
  purchases: [
    { purchaseId: 'P-001', date: '2026-05-10', invoiceNo: 'INV-2026-098', vendorName: 'Sharma Stone Suppliers', branch: 'Main', itemName: 'Boulder (Raw)', qty: 500, rate: 450, unit: 'Ton', taxableValue: 225000, gstRate: 5, gstAmount: 11250, totalAmount: 236250 },
    { purchaseId: 'P-002', date: '2026-05-15', invoiceNo: 'INV-FUEL-401', vendorName: 'Bharat Petroleum Outlet', branch: 'Main', itemName: 'Diesel', qty: 1000, rate: 92, unit: 'Litre', taxableValue: 92000, gstRate: 18, gstAmount: 16560, totalAmount: 108560 },
    { purchaseId: 'P-003', date: '2026-05-18', invoiceNo: 'INV-2026-112', vendorName: 'Gupta Cement Distributors', branch: 'Main', itemName: 'OPC Cement 43 Grade', qty: 200, rate: 380, unit: 'Bag', taxableValue: 76000, gstRate: 28, gstAmount: 21280, totalAmount: 97280 }
  ],
  dispatches: [
    { dispatchId: 'D-001', date: '2026-05-21', invoiceNo: 'DISP-1090', customerName: 'NHAI Highway Project Section 2', destination: 'Main Site Mile 14', branch: 'Main', itemName: '20mm Aggregate', qty: 150, rate: 720, unit: 'Ton', totalAmount: 108000 },
    { dispatchId: 'D-002', date: '2026-05-23', invoiceNo: 'DISP-1091', customerName: 'UltraTech RMC Plant', destination: 'Industrial Area Phase 2', branch: 'Main', itemName: 'Crushed Sand / Dust', qty: 200, rate: 350, unit: 'Ton', totalAmount: 70000 },
    { dispatchId: 'D-003', date: '2026-05-24', invoiceNo: 'DISP-1092', customerName: 'Raj Infrastructure Corp', destination: 'Bypass Flyover Site', branch: 'Madhya', itemName: '10mm Aggregate', qty: 80, rate: 680, unit: 'Ton', totalAmount: 54400 }
  ],
  transfers: [
    { transferId: 'T-001', date: '2026-05-19', fromBranch: 'Main', toBranch: 'Madhya', itemName: '10mm Aggregate', qty: 50, unit: 'Ton', status: 'Approved', approvedBy: 'admin' },
    { transferId: 'T-002', date: '2026-05-24', fromBranch: 'Main', toBranch: 'Rkl', itemName: 'Diesel', qty: 500, unit: 'Litre', status: 'Pending', approvedBy: '' }
  ],
  companySettings: {
    companyName: 'PMMPL Mining & Infra Private Limited',
    gstin: '22AAAAA0000A1Z5',
    address: 'Mining Zone Sector A, Jharsuguda, Odisha, Pin: 768201',
    alertThresholdPercentage: 20
  }
};

// Safe storage access
export const getDatabase = () => {
  const data = localStorage.getItem(MOCK_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
  }
};

export const saveDatabase = (data) => {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
};

// --- MOCK DATABASE OPERATIONS ---

export const mockLogin = (username, password) => {
  const db = getDatabase();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (user) {
    return { success: true, user: { name: user.name, username: user.username, role: user.role, branch: user.branch } };
  }
  return { success: false, message: 'Invalid username or password' };
};

export const mockGetInventory = (branch) => {
  return [
    {
      id: 'mock-uuid-1',
      created_at: new Date().toISOString(),
      firm_name: branch === 'All' ? 'pmmpl' : branch,
      item_name: 'CBXT 89 (0-1)',
      annu_con: 664.25,
      d_con: 2.21,
      sf: 2.00,
      lead_time: 15.00,
      max_stock: null,
      optimum_stock: null,
      actual_level: 15.025,
      product_rate: 55700.00,
      optimum_stock_total: null,
      stock_total: 836892.00,
      unit: 'MT',
      colour: 'Excess Stock'
    }
  ];
};

export const mockAddInventory = (branch, item) => {
  return {
    success: true,
    item: {
      id: 'mock-uuid-' + Date.now(),
      created_at: new Date().toISOString(),
      firm_name: branch,
      item_name: item.item_name || item.itemName,
      annu_con: item.annu_con,
      d_con: item.d_con,
      sf: item.sf,
      lead_time: item.lead_time,
      max_stock: item.max_stock,
      optimum_stock: item.optimum_stock,
      actual_level: item.actual_level,
      product_rate: item.product_rate,
      optimum_stock_total: item.optimum_stock_total,
      stock_total: item.stock_total,
      unit: item.unit,
      colour: item.colour
    }
  };
};

export const mockUpdateInventory = (branch, itemId, updatedFields) => {
  return {
    success: true,
    item: {
      id: itemId,
      firm_name: branch,
      ...updatedFields
    }
  };
};

export const mockDeleteInventory = (branch, itemId) => {
  return { success: true };
};

export const mockGetRates = () => {
  return getDatabase().pmmplRates;
};

export const mockUpdateRate = (rateId, newRate, effectiveDate) => {
  const db = getDatabase();
  const idx = db.pmmplRates.findIndex(r => r.rateId === rateId);
  if (idx !== -1) {
    const rateItem = db.pmmplRates[idx];
    const oldHistory = rateItem.history || [];
    db.pmmplRates[idx] = {
      ...rateItem,
      rate: Number(newRate),
      effectiveDate,
      history: [...oldHistory, { date: effectiveDate, rate: Number(newRate) }]
    };
    saveDatabase(db);
    return { success: true, rate: db.pmmplRates[idx] };
  }
  return { success: false, message: 'Rate definition not found' };
};

export const mockAddPurchase = (purchase) => {
  const db = getDatabase();
  const purchaseId = `P-${String(db.purchases.length + 1).padStart(3, '0')}`;
  
  const taxableValue = Number(purchase.qty) * Number(purchase.rate);
  const gstAmount = taxableValue * (Number(purchase.gstRate) / 100);
  const totalAmount = taxableValue + gstAmount;

  const newPurchase = {
    purchaseId,
    date: purchase.date || new Date().toISOString().split('T')[0],
    invoiceNo: purchase.invoiceNo,
    vendorName: purchase.vendorName,
    branch: purchase.branch,
    itemName: purchase.itemName,
    qty: Number(purchase.qty),
    rate: Number(purchase.rate),
    unit: purchase.unit || 'Ton',
    taxableValue,
    gstRate: Number(purchase.gstRate),
    gstAmount,
    totalAmount
  };

  db.purchases.push(newPurchase);

  // Update Inventory Stock
  if (db.branches[purchase.branch]) {
    const item = db.branches[purchase.branch].find(i => i.itemName.toLowerCase() === purchase.itemName.toLowerCase());
    if (item) {
      item.currentStock += Number(purchase.qty);
    } else {
      // Create new inventory item in branch
      const itemId = `I-${String(db.branches[purchase.branch].length + 1).padStart(3, '0')}`;
      db.branches[purchase.branch].push({
        itemId,
        itemName: purchase.itemName,
        category: 'Aggregates',
        unit: purchase.unit || 'Ton',
        currentStock: Number(purchase.qty),
        openingStock: 0,
        minThreshold: 100
      });
    }
  }

  saveDatabase(db);
  return { success: true, purchase: newPurchase };
};

export const mockAddDispatch = (dispatch) => {
  const db = getDatabase();
  const dispatchId = `D-${String(db.dispatches.length + 1).padStart(3, '0')}`;
  const totalAmount = Number(dispatch.qty) * Number(dispatch.rate);

  // Verify stock availability
  if (db.branches[dispatch.branch]) {
    const item = db.branches[dispatch.branch].find(i => i.itemName.toLowerCase() === dispatch.itemName.toLowerCase());
    if (!item || item.currentStock < Number(dispatch.qty)) {
      return { success: false, message: `Insufficient stock of ${dispatch.itemName} in ${dispatch.branch} branch. (Available: ${item ? item.currentStock : 0})` };
    }
    // Subtract stock
    item.currentStock -= Number(dispatch.qty);
  } else {
    return { success: false, message: `Branch ${dispatch.branch} does not exist.` };
  }

  const newDispatch = {
    dispatchId,
    date: dispatch.date || new Date().toISOString().split('T')[0],
    invoiceNo: dispatch.invoiceNo,
    customerName: dispatch.customerName,
    destination: dispatch.destination,
    branch: dispatch.branch,
    itemName: dispatch.itemName,
    qty: Number(dispatch.qty),
    rate: Number(dispatch.rate),
    unit: dispatch.unit || 'Ton',
    totalAmount
  };

  db.dispatches.push(newDispatch);
  saveDatabase(db);
  return { success: true, dispatch: newDispatch };
};

export const mockAddCrushingLog = (log) => {
  const db = getDatabase();
  const logId = `C-${String(db.crushingLogs.length + 1).padStart(3, '0')}`;

  // Process input subtraction (always from Main branch by default or current branch)
  const sourceBranch = 'Main';
  const rawItem = db.branches[sourceBranch].find(i => i.itemName.toLowerCase() === log.inputItem.toLowerCase());
  
  if (!rawItem || rawItem.currentStock < Number(log.inputQty)) {
    return { success: false, message: `Insufficient raw stock of ${log.inputItem} in ${sourceBranch} branch to execute crushing.` };
  }

  // Deduct input boulder
  rawItem.currentStock -= Number(log.inputQty);

  // Calculate outputs
  let totalOutput = 0;
  const processedOutputs = log.outputs.map(out => {
    const qty = Number(out.qty);
    totalOutput += qty;
    
    // Add output to stock in Main Branch
    const finishedItem = db.branches[sourceBranch].find(i => i.itemName.toLowerCase() === out.itemName.toLowerCase());
    if (finishedItem) {
      finishedItem.currentStock += qty;
    } else {
      const itemId = `I-${String(db.branches[sourceBranch].length + 1).padStart(3, '0')}`;
      db.branches[sourceBranch].push({
        itemId,
        itemName: out.itemName,
        category: 'Aggregates',
        unit: 'Ton',
        currentStock: qty,
        openingStock: 0,
        minThreshold: 100
      });
    }
    return { itemName: out.itemName, qty };
  });

  const recoveryRate = ((totalOutput / Number(log.inputQty)) * 100).toFixed(2);

  const newLog = {
    logId,
    date: log.date || new Date().toISOString().split('T')[0],
    inputItem: log.inputItem,
    inputQty: Number(log.inputQty),
    outputs: processedOutputs,
    recoveryRate: Number(recoveryRate),
    notes: log.notes || ''
  };

  db.crushingLogs.push(newLog);
  saveDatabase(db);
  return { success: true, log: newLog };
};

export const mockTransferMaterial = (transfer) => {
  const db = getDatabase();
  
  // Verify stock in source branch
  const srcItems = db.branches[transfer.fromBranch];
  if (!srcItems) return { success: false, message: 'Source branch not found' };
  
  const srcItem = srcItems.find(i => i.itemName.toLowerCase() === transfer.itemName.toLowerCase());
  if (!srcItem || srcItem.currentStock < Number(transfer.qty)) {
    return { success: false, message: `Insufficient stock in ${transfer.fromBranch} (Available: ${srcItem ? srcItem.currentStock : 0})` };
  }

  const transferId = `T-${String(db.transfers.length + 1).padStart(3, '0')}`;
  const newTransfer = {
    transferId,
    date: new Date().toISOString().split('T')[0],
    fromBranch: transfer.fromBranch,
    toBranch: transfer.toBranch,
    itemName: transfer.itemName,
    qty: Number(transfer.qty),
    unit: transfer.unit || 'Ton',
    status: 'Pending',
    approvedBy: ''
  };

  db.transfers.push(newTransfer);
  saveDatabase(db);
  return { success: true, transfer: newTransfer };
};

export const mockApproveTransfer = (transferId, approvedBy) => {
  const db = getDatabase();
  const idx = db.transfers.findIndex(t => t.transferId === transferId);
  if (idx === -1) return { success: false, message: 'Transfer request not found' };
  
  const transfer = db.transfers[idx];
  if (transfer.status !== 'Pending') {
    return { success: false, message: 'Transfer request is already processed' };
  }

  // Double check stock at source
  const srcItem = db.branches[transfer.fromBranch].find(i => i.itemName.toLowerCase() === transfer.itemName.toLowerCase());
  if (!srcItem || srcItem.currentStock < transfer.qty) {
    transfer.status = 'Failed';
    transfer.approvedBy = approvedBy;
    saveDatabase(db);
    return { success: false, message: 'Source branch no longer has sufficient stock' };
  }

  // Deduct from Source
  srcItem.currentStock -= transfer.qty;

  // Add to Target
  if (!db.branches[transfer.toBranch]) {
    db.branches[transfer.toBranch] = [];
  }
  const tgtItem = db.branches[transfer.toBranch].find(i => i.itemName.toLowerCase() === transfer.itemName.toLowerCase());
  if (tgtItem) {
    tgtItem.currentStock += transfer.qty;
  } else {
    // Add item to target branch
    const itemId = `I-${String(db.branches[transfer.toBranch].length + 1).padStart(3, '0')}`;
    db.branches[transfer.toBranch].push({
      itemId,
      itemName: transfer.itemName,
      category: srcItem.category,
      unit: transfer.unit,
      currentStock: transfer.qty,
      openingStock: 0,
      minThreshold: srcItem.minThreshold
    });
  }

  transfer.status = 'Approved';
  transfer.approvedBy = approvedBy;
  saveDatabase(db);
  return { success: true, transfer };
};

export const mockRejectTransfer = (transferId, approvedBy) => {
  const db = getDatabase();
  const idx = db.transfers.findIndex(t => t.transferId === transferId);
  if (idx === -1) return { success: false, message: 'Transfer request not found' };
  
  db.transfers[idx].status = 'Rejected';
  db.transfers[idx].approvedBy = approvedBy;
  saveDatabase(db);
  return { success: true, transfer: db.transfers[idx] };
};

export const mockGetReports = () => {
  const db = getDatabase();
  return {
    purchases: db.purchases,
    dispatches: db.dispatches,
    transfers: db.transfers,
    crushing: db.crushingLogs
  };
};

export const mockGetSettings = () => {
  return getDatabase().companySettings;
};

export const mockUpdateSettings = (settings) => {
  const db = getDatabase();
  db.companySettings = {
    ...db.companySettings,
    ...settings,
    alertThresholdPercentage: Number(settings.alertThresholdPercentage ?? db.companySettings.alertThresholdPercentage)
  };
  saveDatabase(db);
  return { success: true, settings: db.companySettings };
};
