import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on start
  useEffect(() => {
    const savedSession = localStorage.getItem('mis_user_session');
    if (savedSession) {
      try {
        setUser(JSON.parse(savedSession));
      } catch (e) {
        localStorage.removeItem('mis_user_session');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const res = await apiService.login(username, password);
      if (res.success) {
        setUser(res.user);
        localStorage.setItem('mis_user_session', JSON.stringify(res.user));
        return { success: true, user: res.user };
      } else {
        return { success: false, message: res.message || 'Login failed' };
      }
    } catch (e) {
      return { success: false, message: e.message || 'Server connection error' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mis_user_session');
  };

  const canAccessBranch = (branchName, type = 'raw_material') => {
    if (!user) return false;
    if (user.role === 'Admin') return true;

    const normalizeBranch = (value) => value?.toLowerCase() === 'madhya' ? 'Pmmpl' : value;
    const cleanBranch = branchName ? String(branchName).replace(/\s+Branch$/i, '').trim() : '';
    const normalizedBranchName = normalizeBranch(cleanBranch);
    const legacyBranchName = normalizedBranchName === 'Pmmpl' ? 'Madhya' : normalizedBranchName;

    // Check granular page_access keys first (RawMaterial_Purab, FinishGood_Rkl, TradingMaterial_Purab, StockAdjustment_Purab etc.)
    const pageAccess = user.page_access || [];
    const prefix =
      type === 'finish_good'
        ? 'FinishGood'
        : type === 'trading_material'
        ? 'TradingMaterial'
        : type === 'stock_adjustment'
        ? 'StockAdjustment'
        : 'RawMaterial';
    const specificKey = `${prefix}_${normalizedBranchName}`;
    const legacySpecificKey = `${prefix}_${legacyBranchName}`;

    if (pageAccess.includes(specificKey) || pageAccess.includes(legacySpecificKey)) return true;
    if (type === 'trading_material' && pageAccess.includes('TradingMaterial')) return true;
    if (type === 'stock_adjustment' && pageAccess.includes('StockAdjustment')) return true;

    // If page_access is configured, we strictly rely on it and do not fall back
    if (pageAccess.length > 0) return false;

    // Legacy fallback: branch array or string check
    if (user.branch === 'All') return true;
    if (Array.isArray(user.branch)) {
      return user.branch.some(b => normalizedBranchName.toLowerCase().startsWith(normalizeBranch(b).toLowerCase()));
    }
    return normalizeBranch(user.branch)?.toLowerCase() === normalizedBranchName.toLowerCase();
  };

  const canAccessPage = (pageKey) => {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    const pageAccess = user.page_access;
    if (!pageAccess || pageAccess.length === 0) return true;
    return pageAccess.includes(pageKey);
  };

  const getFirstAccessibleRoute = () => {
    if (!user || user.role === 'Admin') return '/';
    const pageAccess = user.page_access || [];
    if (pageAccess.length === 0 || pageAccess.includes('Dashboard')) return '/';
    if (pageAccess.some(k => k.startsWith('RawMaterial_'))) return '/raw-material';
    if (pageAccess.some(k => k.startsWith('FinishGood_'))) return '/finished-good';
    if (pageAccess.some(k => k.startsWith('TradingMaterial_') || k === 'TradingMaterial')) return '/trading-material';
    if (pageAccess.some(k => k.startsWith('StockAdjustment_') || k === 'StockAdjustment')) return '/stock-adjustment';
    if (pageAccess.includes('History')) return '/history';
    if (pageAccess.includes('Settings')) return '/settings';
    return null;
  };

  const isRole = (roles) => {
    if (!user) return false;
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    return user.role === roles;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccessBranch, canAccessPage, getFirstAccessibleRoute, isRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
