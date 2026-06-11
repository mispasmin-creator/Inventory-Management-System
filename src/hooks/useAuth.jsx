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
        return { success: true };
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
    const normalizedBranchName = normalizeBranch(branchName);
    const legacyBranchName = normalizedBranchName === 'Pmmpl' ? 'Madhya' : normalizedBranchName;

    // Check granular page_access keys first (RawMaterial_Purab, FinishGood_Rkl etc.)
    const pageAccess = user.page_access || [];
    const prefix = type === 'finish_good' ? 'FinishGood' : 'RawMaterial';
    const specificKey = `${prefix}_${normalizedBranchName}`;
    const legacySpecificKey = `${prefix}_${legacyBranchName}`;

    if (pageAccess.includes(specificKey) || pageAccess.includes(legacySpecificKey)) return true;

    // If page_access is configured, we strictly rely on it and do not fall back
    if (pageAccess.length > 0) return false;

    // Legacy fallback: branch array or string check
    if (user.branch === 'All') return true;
    if (Array.isArray(user.branch)) {
      return user.branch.some(b => normalizedBranchName.toLowerCase().startsWith(normalizeBranch(b).toLowerCase()));
    }
    return normalizeBranch(user.branch)?.toLowerCase() === normalizedBranchName.toLowerCase();
  };

  const isRole = (roles) => {
    if (!user) return false;
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    return user.role === roles;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canAccessBranch, isRole }}>
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
