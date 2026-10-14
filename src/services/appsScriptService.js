// Google Apps Script Integration Service Layer
import axios from 'axios';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

if (APPS_SCRIPT_URL) {
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
    const res = await callApi('getRates');
    return res.data;
  },

  updateRate: async (rateId, newRate, effectiveDate) => {
    return callApi('updateRate', { rateId, newRate, effectiveDate });
  },

  // Purchases
  addPurchase: async (purchase) => {
    return callApi('addPurchase', { purchase });
  },

  getPurchases: async () => {
    const res = await callApi('getReports');
    return res.data?.purchases || [];
  },

  // Dispatches
  addDispatch: async (dispatch) => {
    return callApi('addDispatch', { dispatch });
  },

  getDispatches: async () => {
    const res = await callApi('getReports');
    return res.data?.dispatches || [];
  },

  // Crushing Logs
  addCrushingLog: async (log) => {
    return callApi('addCrushingLog', { log });
  },

  getCrushingLogs: async () => {
    const res = await callApi('getReports');
    return res.data?.crushing || [];
  },

  // Transfers
  transferMaterial: async (transfer) => {
    return callApi('branchTransfer', { transfer });
  },

  getTransfers: async () => {
    const res = await callApi('getReports');
    return res.data?.transfers || [];
  },

  approveTransfer: async (transferId, approvedBy) => {
    return callApi('approveTransfer', { transferId, approvedBy });
  },

  rejectTransfer: async (transferId, approvedBy) => {
    return callApi('rejectTransfer', { transferId, approvedBy });
  },

  // Reports
  getReports: async () => {
    const res = await callApi('getReports');
    return res.data;
  },

  // Settings
  getSettings: async () => {
    const res = await callApi('getSettings');
    return res.data;
  },

  updateSettings: async (settings) => {
    return callApi('updateSettings', { settings });
  },
};
