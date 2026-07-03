import { useState, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from './useAuth';

const INVENTORY_START_DATE = '2026-06-23';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const { showSuccess, showError } = useToast();
  const { user } = useAuth();

  const fetchInventory = useCallback(async (branch, type = 'raw_material', dateFilter = INVENTORY_START_DATE, page = 1, pageSize = 100, searchQuery = '', firmFilter = '') => {
    setLoading(true);
    try {
      const response = type === 'finish_good'
        ? await apiService.getFinishGoodInventory(branch, dateFilter, page, pageSize, searchQuery, firmFilter)
        : await apiService.getInventory(branch, dateFilter, page, pageSize, searchQuery, firmFilter);
      
      setInventoryItems(response.data || []);
      setTotalCount(response.count || 0);
    } catch (e) {
      showError(e.message || `Failed to fetch inventory for ${branch}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const addInventory = useCallback(async (branch, item) => {
    setLoading(true);
    try {
      const res = await apiService.addInventory(branch, item);
      if (res.success) {
        showSuccess(`Item ${item.itemName} added to ${branch} branch.`);
        await fetchInventory(branch);
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to add inventory item.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [fetchInventory, showSuccess, showError]);

  const updateInventory = useCallback(async (branch, itemId, updatedFields) => {
    setLoading(true);
    try {
      const res = await apiService.updateInventory(branch, itemId, updatedFields);
      if (res.success) {
        showSuccess('Inventory item updated successfully.');
        await fetchInventory(branch);
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to update inventory item.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [fetchInventory, showSuccess, showError]);

  const deleteInventory = useCallback(async (branch, itemId) => {
    setLoading(true);
    try {
      const res = await apiService.deleteInventory(branch, itemId);
      if (res.success) {
        showSuccess('Item deleted from inventory.');
        await fetchInventory(branch);
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to delete inventory item.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [fetchInventory, showSuccess, showError]);

  const transferMaterial = useCallback(async (transfer) => {
    setLoading(true);
    try {
      const res = await apiService.transferMaterial(transfer);
      if (res.success) {
        showSuccess(`Transfer request submitted for ${transfer.qty} ${transfer.unit} of ${transfer.itemName}.`);
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to submit transfer request.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [showSuccess, showError]);

  const approveTransfer = useCallback(async (transferId) => {
    if (!user) return false;
    setLoading(true);
    try {
      const res = await apiService.approveTransfer(transferId, user.username);
      if (res.success) {
        showSuccess('Material transfer approved successfully.');
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to approve material transfer.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [user, showSuccess, showError]);

  const rejectTransfer = useCallback(async (transferId) => {
    if (!user) return false;
    setLoading(true);
    try {
      const res = await apiService.rejectTransfer(transferId, user.username);
      if (res.success) {
        showSuccess('Material transfer request rejected.');
        return true;
      }
    } catch (e) {
      showError(e.message || 'Failed to reject material transfer request.');
    } finally {
      setLoading(false);
    }
    return false;
  }, [user, showSuccess, showError]);

  return {
    loading,
    inventoryItems,
    fetchInventory,
    addInventory,
    updateInventory,
    deleteInventory,
    transferMaterial,
    approveTransfer,
    rejectTransfer,
    totalCount
  };
};
export default useInventory;
