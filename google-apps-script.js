/**
 * PMMPL Inventory Management System (IMS) - Backend Google Apps Script API
 * 
 * Paste this script into your Google Sheet's Extension > Apps Script editor.
 * Deploy as a "Web App" and configure:
 * - Execute as: "Me" (your account)
 * - Who has access: "Anyone"
 * 
 * Set the generated Web App URL in your React app's .env file:
 * VITE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec"
 */

// Helper to return CORS-compliant JSON responses
function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Simple GET request verification
function doGet(e) {
  return response({
    success: true,
    message: "PMMPL IMS Google Apps Script Web App API is active."
  });
}

// Core API Router for POST requests (Handles all JSON payloads from React frontend)
function doPost(e) {
  // CORS Preflight handles
  if (!e.postData || !e.postData.contents) {
    return response({ success: false, message: "No payload received" });
  }

  var lock = LockService.getScriptLock();
  try {
    // Acquire lock for concurrency protection (wait up to 15 seconds)
    lock.waitLock(15000);
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return response({ success: false, message: "Spreadsheet context not found." });
    }

    switch(action) {
      case 'login':
        return loginUser(ss, payload);
      case 'getInventory':
        return getInventory(ss, payload);
      case 'addInventory':
        return addInventory(ss, payload);
      case 'updateInventory':
        return updateInventory(ss, payload);
      case 'deleteInventory':
        return deleteInventory(ss, payload);
      case 'getRates':
        return getRates(ss);
      case 'updateRate':
        return updateRate(ss, payload);
      case 'addPurchase':
        return addPurchase(ss, payload);
      case 'addDispatch':
        return addDispatch(ss, payload);
      case 'addCrushingLog':
        return addCrushingLog(ss, payload);
      case 'branchTransfer':
        return branchTransfer(ss, payload);
      case 'approveTransfer':
        return approveTransfer(ss, payload);
      case 'rejectTransfer':
        return rejectTransfer(ss, payload);
      case 'getReports':
        return getReports(ss);
      case 'getSettings':
        return getSettings(ss);
      case 'updateSettings':
        return updateSettings(ss, payload);
      default:
        return response({ success: false, message: "Action [" + action + "] not implemented." });
    }
  } catch (error) {
    return response({ success: false, message: "Execution error: " + error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// 1. AUTHENTICATION (Login sheet)
// Columns: Username | Password | FullName | Role | Branch
// ----------------------------------------------------
function loginUser(ss, payload) {
  var sheet = ss.getSheetByName("Login");
  if (!sheet) return response({ success: false, message: "Login sheet not found." });
  
  var data = sheet.getDataRange().getValues();
  var username = payload.username.toLowerCase();
  var password = payload.password;

  for (var i = 1; i < data.length; i++) {
    var dbUser = String(data[i][0]).toLowerCase();
    var dbPass = String(data[i][1]);
    
    if (dbUser === username && dbPass === password) {
      return response({
        success: true,
        user: {
          username: data[i][0],
          name: data[i][2],
          role: data[i][3],
          branch: data[i][4]
        }
      });
    }
  }
  return response({ success: false, message: "Invalid username or password credentials." });
}

// ----------------------------------------------------
// 2. INVENTORY READ/WRITE (Main, Madhya, Rkl, Purab sheets)
// Columns: ItemId | ItemName | Category | Unit | CurrentStock | OpeningStock | MinThreshold
// ----------------------------------------------------
function getInventory(ss, payload) {
  var branch = payload.branch;
  if (branch === 'All') {
    var branches = ['Main', 'Madhya', 'Rkl', 'Purab'];
    var combined = [];
    branches.forEach(function(b) {
      var sheet = ss.getSheetByName(b);
      if (sheet) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          combined.push({
            itemId: data[i][0],
            itemName: data[i][1],
            category: data[i][2],
            unit: data[i][3],
            currentStock: Number(data[i][4]),
            openingStock: Number(data[i][5]),
            minThreshold: Number(data[i][6]),
            branch: b
          });
        }
      }
    });
    return response({ success: true, data: combined });
  }

  var sheet = ss.getSheetByName(branch);
  if (!sheet) return response({ success: false, message: "Branch sheet not found." });
  
  var data = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < data.length; i++) {
    items.push({
      itemId: data[i][0],
      itemName: data[i][1],
      category: data[i][2],
      unit: data[i][3],
      currentStock: Number(data[i][4]),
      openingStock: Number(data[i][5]),
      minThreshold: Number(data[i][6])
    });
  }
  return response({ success: true, data: items });
}

function addInventory(ss, payload) {
  var branch = payload.branch;
  var item = payload.item;
  var sheet = ss.getSheetByName(branch);
  if (!sheet) return response({ success: false, message: "Branch sheet not found." });

  var rowsCount = sheet.getLastRow();
  var nextId = "I-" + String(rowsCount).padStart(3, '0');
  
  var newRow = [
    nextId,
    item.itemName,
    item.category,
    item.unit,
    Number(item.currentStock),
    Number(item.currentStock),
    Number(item.minThreshold)
  ];
  sheet.appendRow(newRow);
  return response({ success: true, item: { itemId: nextId } });
}

function updateInventory(ss, payload) {
  var branch = payload.branch;
  var itemId = payload.itemId;
  var fields = payload.updatedFields;

  var sheet = ss.getSheetByName(branch);
  if (!sheet) return response({ success: false, message: "Branch sheet not found" });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === itemId) {
      if (fields.category !== undefined) sheet.getRange(i + 1, 3).setValue(fields.category);
      if (fields.currentStock !== undefined) sheet.getRange(i + 1, 5).setValue(Number(fields.currentStock));
      if (fields.minThreshold !== undefined) sheet.getRange(i + 1, 7).setValue(Number(fields.minThreshold));
      return response({ success: true });
    }
  }
  return response({ success: false, message: "Item not found in inventory list" });
}

function deleteInventory(ss, payload) {
  var branch = payload.branch;
  var itemId = payload.itemId;
  var sheet = ss.getSheetByName(branch);
  if (!sheet) return response({ success: false, message: "Branch sheet not found" });

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === itemId) {
      sheet.deleteRow(i + 1);
      return response({ success: true });
    }
  }
  return response({ success: false, message: "Item not found in inventory list" });
}

// ----------------------------------------------------
// 3. PMMPL RATE CARD MANAGEMENT (Pmmpl Rate sheet)
// Columns: RateId | ItemName | Rate | EffectiveDate | HistoryJson
// ----------------------------------------------------
function getRates(ss) {
  var sheet = ss.getSheetByName("Pmmpl Rate");
  if (!sheet) return response({ success: false, message: "Pmmpl Rate sheet not found." });
  
  var data = sheet.getDataRange().getValues();
  var rates = [];
  for (var i = 1; i < data.length; i++) {
    var history = [];
    try {
      if (data[i][4]) history = JSON.parse(data[i][4]);
    } catch (e) {}
    
    rates.push({
      rateId: data[i][0],
      itemName: data[i][1],
      rate: Number(data[i][2]),
      effectiveDate: data[i][3] ? Utilities.formatDate(new Date(data[i][3]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : '',
      history: history
    });
  }
  return response({ success: true, data: rates });
}

function updateRate(ss, payload) {
  var sheet = ss.getSheetByName("Pmmpl Rate");
  if (!sheet) return response({ success: false, message: "Pmmpl Rate sheet not found." });

  var data = sheet.getDataRange().getValues();
  var rateId = payload.rateId;
  var newRate = Number(payload.newRate);
  var effectiveDate = payload.effectiveDate;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === rateId) {
      var history = [];
      try {
        if (data[i][4]) history = JSON.parse(data[i][4]);
      } catch (e) {}
      
      history.push({ date: effectiveDate, rate: newRate });
      
      sheet.getRange(i + 1, 3).setValue(newRate);
      sheet.getRange(i + 1, 4).setValue(effectiveDate);
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(history));
      return response({ success: true });
    }
  }
  return response({ success: false, message: "Rate item not found" });
}

// ----------------------------------------------------
// 4. TRANSACTION LOGS (Purchases, Dispatches, Crushing, Transfers sheets)
// ----------------------------------------------------
function addPurchase(ss, payload) {
  var purchase = payload.purchase;
  var sheet = ss.getSheetByName("Purchases");
  if (!sheet) return response({ success: false, message: "Purchases registry sheet not found." });

  var lastRow = sheet.getLastRow();
  var pId = "P-" + String(lastRow).padStart(3, '0');
  
  var taxableValue = Number(purchase.qty) * Number(purchase.rate);
  var gstAmount = taxableValue * (Number(purchase.gstRate) / 100);
  var totalAmount = taxableValue + gstAmount;

  // Append log row
  sheet.appendRow([
    pId,
    purchase.date,
    purchase.invoiceNo,
    purchase.vendorName,
    purchase.branch,
    purchase.itemName,
    Number(purchase.qty),
    Number(purchase.rate),
    purchase.unit,
    taxableValue,
    Number(purchase.gstRate),
    gstAmount,
    totalAmount
  ]);

  // Update target inventory
  var branchSheet = ss.getSheetByName(purchase.branch);
  if (branchSheet) {
    var data = branchSheet.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][1].toLowerCase() === purchase.itemName.toLowerCase()) {
        var curStock = Number(data[i][4]) + Number(purchase.qty);
        branchSheet.getRange(i + 1, 5).setValue(curStock);
        found = true;
        break;
      }
    }
    if (!found) {
      // Append new item to branch if not listed
      var nextId = "I-" + String(branchSheet.getLastRow()).padStart(3, '0');
      branchSheet.appendRow([
        nextId,
        purchase.itemName,
        "Aggregates",
        purchase.unit,
        Number(purchase.qty),
        0,
        100
      ]);
    }
  }

  return response({ success: true });
}

function addDispatch(ss, payload) {
  var dispatch = payload.dispatch;
  var sheet = ss.getSheetByName("Dispatches");
  if (!sheet) return response({ success: false, message: "Dispatches sheet not found." });

  // Validate stock level
  var branchSheet = ss.getSheetByName(dispatch.branch);
  if (!branchSheet) return response({ success: false, message: "Source branch sheet not found" });

  var data = branchSheet.getDataRange().getValues();
  var itemRowIndex = -1;
  var currentStock = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase() === dispatch.itemName.toLowerCase()) {
      itemRowIndex = i + 1;
      currentStock = Number(data[i][4]);
      break;
    }
  }

  if (itemRowIndex === -1 || currentStock < Number(dispatch.qty)) {
    return response({ success: false, message: "Insufficient stock levels in branch: " + dispatch.branch });
  }

  // Deduct stock
  branchSheet.getRange(itemRowIndex, 5).setValue(currentStock - Number(dispatch.qty));

  var dId = "D-" + String(sheet.getLastRow()).padStart(3, '0');
  var totalVal = Number(dispatch.qty) * Number(dispatch.rate);

  sheet.appendRow([
    dId,
    dispatch.date,
    dispatch.invoiceNo,
    dispatch.customerName,
    dispatch.destination,
    dispatch.branch,
    dispatch.itemName,
    Number(dispatch.qty),
    Number(dispatch.rate),
    dispatch.unit,
    totalVal
  ]);

  return response({ success: true });
}

function addCrushingLog(ss, payload) {
  var log = payload.log;
  var sheet = ss.getSheetByName("Crushing Logs");
  if (!sheet) return response({ success: false, message: "Crushing Logs sheet not found." });

  // Deduct Boulder from Main
  var mainSheet = ss.getSheetByName("Main");
  if (!mainSheet) return response({ success: false, message: "Main branch sheet not found for crushing." });

  var mainData = mainSheet.getDataRange().getValues();
  var rawRowIdx = -1;
  var rawStock = 0;
  for (var i = 1; i < mainData.length; i++) {
    if (mainData[i][1].toLowerCase() === log.inputItem.toLowerCase()) {
      rawRowIdx = i + 1;
      rawStock = Number(mainData[i][4]);
      break;
    }
  }

  if (rawRowIdx === -1 || rawStock < Number(log.inputQty)) {
    return response({ success: false, message: "Insufficient raw Boulder stock in Main Branch." });
  }

  // Deduct input
  mainSheet.getRange(rawRowIdx, 5).setValue(rawStock - Number(log.inputQty));

  // Add outputs to Main branch
  var totalOutput = 0;
  log.outputs.forEach(function(out) {
    var qty = Number(out.qty);
    totalOutput += qty;

    var found = false;
    for (var j = 1; j < mainData.length; j++) {
      if (mainData[j][1].toLowerCase() === out.itemName.toLowerCase()) {
        var itemStock = Number(mainData[j][4]) + qty;
        mainSheet.getRange(j + 1, 5).setValue(itemStock);
        found = true;
        break;
      }
    }
    if (!found) {
      var nextId = "I-" + String(mainSheet.getLastRow()).padStart(3, '0');
      mainSheet.appendRow([nextId, out.itemName, "Aggregates", "Ton", qty, 0, 100]);
    }
  });

  var recovery = ((totalOutput / Number(log.inputQty)) * 100).toFixed(2);
  var logId = "C-" + String(sheet.getLastRow()).padStart(3, '0');

  sheet.appendRow([
    logId,
    log.date,
    log.inputItem,
    Number(log.inputQty),
    JSON.stringify(log.outputs),
    Number(recovery),
    log.notes || ''
  ]);

  return response({ success: true });
}

function branchTransfer(ss, payload) {
  var transfer = payload.transfer;
  var sheet = ss.getSheetByName("Transfers");
  if (!sheet) return response({ success: false, message: "Transfers sheet not found." });

  // Check source stock
  var srcSheet = ss.getSheetByName(transfer.fromBranch);
  if (!srcSheet) return response({ success: false, message: "Source branch sheet not found." });

  var srcData = srcSheet.getDataRange().getValues();
  var found = false;
  var stock = 0;
  for (var i = 1; i < srcData.length; i++) {
    if (srcData[i][1].toLowerCase() === transfer.itemName.toLowerCase()) {
      stock = Number(srcData[i][4]);
      found = true;
      break;
    }
  }

  if (!found || stock < Number(transfer.qty)) {
    return response({ success: false, message: "Insufficient stock in source branch to request transfer." });
  }

  var tId = "T-" + String(sheet.getLastRow()).padStart(3, '0');
  var dateStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

  sheet.appendRow([
    tId,
    dateStr,
    transfer.fromBranch,
    transfer.toBranch,
    transfer.itemName,
    Number(transfer.qty),
    transfer.unit || 'Ton',
    'Pending',
    ''
  ]);

  return response({ success: true });
}

function approveTransfer(ss, payload) {
  var sheet = ss.getSheetByName("Transfers");
  if (!sheet) return response({ success: false, message: "Transfers sheet not found." });

  var data = sheet.getDataRange().getValues();
  var tId = payload.transferId;
  var approvedBy = payload.approvedBy;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === tId) {
      if (data[i][7] !== 'Pending') {
        return response({ success: false, message: "Transfer is already processed" });
      }

      var fromB = data[i][2];
      var toB = data[i][3];
      var item = data[i][4];
      var qty = Number(data[i][5]);
      var unit = data[i][6];

      // Verify stock in source branch
      var srcSheet = ss.getSheetByName(fromB);
      var srcData = srcSheet.getDataRange().getValues();
      var srcRowIdx = -1;
      var srcStock = 0;
      var category = "Aggregates";
      var minThreshold = 100;

      for (var r = 1; r < srcData.length; r++) {
        if (srcData[r][1].toLowerCase() === item.toLowerCase()) {
          srcRowIdx = r + 1;
          srcStock = Number(srcData[r][4]);
          category = srcData[r][2];
          minThreshold = Number(srcData[r][6]);
          break;
        }
      }

      if (srcRowIdx === -1 || srcStock < qty) {
        sheet.getRange(i + 1, 8).setValue("Failed");
        sheet.getRange(i + 1, 9).setValue(approvedBy);
        return response({ success: false, message: "Source branch stock levels are no longer sufficient." });
      }

      // Deduct from Source
      srcSheet.getRange(srcRowIdx, 5).setValue(srcStock - qty);

      // Add to Target
      var tgtSheet = ss.getSheetByName(toB);
      if (!tgtSheet) return response({ success: false, message: "Target branch sheet not found." });
      var tgtData = tgtSheet.getDataRange().getValues();
      var tgtRowIdx = -1;
      var tgtStock = 0;

      for (var t = 1; t < tgtData.length; t++) {
        if (tgtData[t][1].toLowerCase() === item.toLowerCase()) {
          tgtRowIdx = t + 1;
          tgtStock = Number(tgtData[t][4]);
          break;
        }
      }

      if (tgtRowIdx !== -1) {
        tgtSheet.getRange(tgtRowIdx, 5).setValue(tgtStock + qty);
      } else {
        // Append item to target
        var nextId = "I-" + String(tgtSheet.getLastRow()).padStart(3, '0');
        tgtSheet.appendRow([
          nextId,
          item,
          category,
          unit,
          qty,
          0,
          minThreshold
        ]);
      }

      // Mark Approved
      sheet.getRange(i + 1, 8).setValue("Approved");
      sheet.getRange(i + 1, 9).setValue(approvedBy);
      return response({ success: true });
    }
  }
  return response({ success: false, message: "Transfer request not found." });
}

function rejectTransfer(ss, payload) {
  var sheet = ss.getSheetByName("Transfers");
  if (!sheet) return response({ success: false, message: "Transfers sheet not found." });

  var data = sheet.getDataRange().getValues();
  var tId = payload.transferId;
  var approvedBy = payload.approvedBy;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === tId) {
      sheet.getRange(i + 1, 8).setValue("Rejected");
      sheet.getRange(i + 1, 9).setValue(approvedBy);
      return response({ success: true });
    }
  }
  return response({ success: false, message: "Transfer request not found." });
}

// ----------------------------------------------------
// 5. REGISTRY SUMMARIES (Purchases, Dispatches, Transfers, Crushing)
// ----------------------------------------------------
function getReports(ss) {
  var pSheet = ss.getSheetByName("Purchases");
  var dSheet = ss.getSheetByName("Dispatches");
  var tSheet = ss.getSheetByName("Transfers");
  var cSheet = ss.getSheetByName("Crushing Logs");

  var purchases = [];
  if (pSheet) {
    var pData = pSheet.getDataRange().getValues();
    for (var i = 1; i < pData.length; i++) {
      purchases.push({
        purchaseId: pData[i][0],
        date: pData[i][1] ? Utilities.formatDate(new Date(pData[i][1]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : '',
        invoiceNo: pData[i][2],
        vendorName: pData[i][3],
        branch: pData[i][4],
        itemName: pData[i][5],
        qty: Number(pData[i][6]),
        rate: Number(pData[i][7]),
        unit: pData[i][8],
        taxableValue: Number(pData[i][9]),
        gstRate: Number(pData[i][10]),
        gstAmount: Number(pData[i][11]),
        totalAmount: Number(pData[i][12])
      });
    }
  }

  var dispatches = [];
  if (dSheet) {
    var dData = dSheet.getDataRange().getValues();
    for (var i = 1; i < dData.length; i++) {
      dispatches.push({
        dispatchId: dData[i][0],
        date: dData[i][1] ? Utilities.formatDate(new Date(dData[i][1]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : '',
        invoiceNo: dData[i][2],
        customerName: dData[i][3],
        destination: dData[i][4],
        branch: dData[i][5],
        itemName: dData[i][6],
        qty: Number(dData[i][7]),
        rate: Number(dData[i][8]),
        unit: dData[i][9],
        totalAmount: Number(dData[i][10])
      });
    }
  }

  var transfers = [];
  if (tSheet) {
    var tData = tSheet.getDataRange().getValues();
    for (var i = 1; i < tData.length; i++) {
      transfers.push({
        transferId: tData[i][0],
        date: tData[i][1] ? Utilities.formatDate(new Date(tData[i][1]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : '',
        fromBranch: tData[i][2],
        toBranch: tData[i][3],
        itemName: tData[i][4],
        qty: Number(tData[i][5]),
        unit: tData[i][6],
        status: tData[i][7],
        approvedBy: tData[i][8]
      });
    }
  }

  var crushing = [];
  if (cSheet) {
    var cData = cSheet.getDataRange().getValues();
    for (var i = 1; i < cData.length; i++) {
      var outputs = [];
      try {
        if (cData[i][4]) outputs = JSON.parse(cData[i][4]);
      } catch (e) {}
      
      crushing.push({
        logId: cData[i][0],
        date: cData[i][1] ? Utilities.formatDate(new Date(cData[i][1]), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd") : '',
        inputItem: cData[i][2],
        inputQty: Number(cData[i][3]),
        outputs: outputs,
        recoveryRate: Number(cData[i][5]),
        notes: cData[i][6]
      });
    }
  }

  return response({
    success: true,
    data: {
      purchases: purchases,
      dispatches: dispatches,
      transfers: transfers,
      crushing: crushing
    }
  });
}

// ----------------------------------------------------
// 6. SYSTEM SETTINGS (Settings sheet)
// Columns: CompanyName | GSTIN | Address | AlertThresholdPercentage
// ----------------------------------------------------
function getSettings(ss) {
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    // Return default settings
    return response({
      success: true,
      data: {
        companyName: "PMMPL Mining & Infra Pvt Ltd",
        gstin: "22AAAAA0000A1Z5",
        address: "Mining Zone, Jharsuguda, Odisha",
        alertThresholdPercentage: 20
      }
    });
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return response({
      success: true,
      data: {
        companyName: "PMMPL Mining & Infra Pvt Ltd",
        gstin: "22AAAAA0000A1Z5",
        address: "Mining Zone, Jharsuguda, Odisha",
        alertThresholdPercentage: 20
      }
    });
  }

  return response({
    success: true,
    data: {
      companyName: data[1][0],
      gstin: data[1][1],
      address: data[1][2],
      alertThresholdPercentage: Number(data[1][3])
    }
  });
}

function updateSettings(ss, payload) {
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    // Create settings sheet
    sheet = ss.insertSheet("Settings");
    sheet.appendRow(["CompanyName", "GSTIN", "Address", "AlertThresholdPercentage"]);
  }

  var settings = payload.settings;
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    sheet.appendRow([
      settings.companyName,
      settings.gstin,
      settings.address,
      Number(settings.alertThresholdPercentage)
    ]);
  } else {
    sheet.getRange(2, 1).setValue(settings.companyName);
    sheet.getRange(2, 2).setValue(settings.gstin);
    sheet.getRange(2, 3).setValue(settings.address);
    sheet.getRange(2, 4).setValue(Number(settings.alertThresholdPercentage));
  }

  return response({ success: true });
}
