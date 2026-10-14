// Google Apps Script Integration Service Layer
import axios from 'axios';
import * as mockDb from './mockData';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

const isMock = !APPS_SCRIPT_URL;

if (isMock) {
  console.log('IMS System: VITE_APPS_SCRIPT_URL not set. Operating in Local Mock Database mode.');
} else {
  console.log(`IMS System: Connecting to Google Sheets API at: ${APPS_SCRIPT_URL}`);
}

// Axios helper for Google Apps Script Web App
// Web Apps redirect with a 302, Axios handles this automatically in browser environments.
const client = axios.create({
  baseURL: APPS_SCRIPT_URL,
  headers: {
    'Content-Type': 'text/plain;charset=utf-8', // Google Apps Script handles POST payloads best with this or no Content-Type
  },
});

// Helper to make API calls to Google Apps Script
export const callApi = async (action, payload = {}) => {
  try {
    const response = await client.post('', {
      action,
      ...payload,
    });

    if (response.data && response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data?.message || 'API request failed');
    }
  } catch (error) {
    console.error(`API Error on action [${action}]:`, error);
    throw error;
  }
};

export const appsScriptService = {
  // Rates
  getRates: async () => {
    if (isMock) {
      return mockDb.mockGetRates();
    }
    const res = await callApi('getRates');
    return res.data;
  },

  updateRate: async (rateId, newRate, effectiveDate) => {
    if (isMock) {
      return mockDb.mockUpdateRate(rateId, newRate, effectiveDate);
    }
    return callApi('updateRate', { rateId, newRate, effectiveDate });
  },

  // Purchases
  addPurchase: async (purchase) => {
    if (isMock) {
      return mockDb.mockAddPurchase(purchase);
    }
    return callApi('addPurchase', { purchase });
  },

  getPurchases: async () => {
    if (isMock) {
      return mockDb.getDatabase().purchases;
    }
    const res = await callApi('getReports');
    return res.data?.purchases || [];
  },

  // Dispatches
  addDispatch: async (dispatch) => {
    if (isMock) {
      return mockDb.mockAddDispatch(dispatch);
    }
    return callApi('addDispatch', { dispatch });
  },

  getDispatches: async () => {
    if (isMock) {
      return mockDb.getDatabase().dispatches;
    }
    const res = await callApi('getReports');
    return res.data?.dispatches || [];
  },

  // Crushing Logs
  addCrushingLog: async (log) => {
    if (isMock) {
      return mockDb.mockAddCrushingLog(log);
    }
    return callApi('addCrushingLog', { log });
  },

  getCrushingLogs: async () => {
    if (isMock) {
      return mockDb.getDatabase().crushingLogs;
    }
    const res = await callApi('getReports');
    return res.data?.crushing || [];
  },

  // Transfers
  transferMaterial: async (transfer) => {
    if (isMock) {
      return mockDb.mockTransferMaterial(transfer);
    }
    return callApi('branchTransfer', { transfer });
  },

  getTransfers: async () => {
    if (isMock) {
      return mockDb.getDatabase().transfers;
    }
    const res = await callApi('getReports');
    return res.data?.transfers || [];
  },

  approveTransfer: async (transferId, approvedBy) => {
    if (isMock) {
      return mockDb.mockApproveTransfer(transferId, approvedBy);
    }
    return callApi('approveTransfer', { transferId, approvedBy });
  },

  rejectTransfer: async (transferId, approvedBy) => {
    if (isMock) {
      return mockDb.mockRejectTransfer(transferId, approvedBy);
    }
    return callApi('rejectTransfer', { transferId, approvedBy });
  },

  // Reports
  getReports: async () => {
    if (isMock) {
      return mockDb.mockGetReports();
    }
    const res = await callApi('getReports');
    return res.data;
  },

  // Settings
  getSettings: async () => {
    if (isMock) {
      return mockDb.mockGetSettings();
    }
    const res = await callApi('getSettings');
    return res.data;
  },

  updateSettings: async (settings) => {
    if (isMock) {
      return mockDb.mockUpdateSettings(settings);
    }
    return callApi('updateSettings', { settings });
  },
};
