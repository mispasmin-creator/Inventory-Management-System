import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Database,
  Shield,
  User,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const Header = () => {
  const { user, logout } = useAuth();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/")                  return "Dashboard";
    if (path === "/inventory")         return "Inventory Control";
    if (path === "/raw-material")      return "Raw Material Inventory";
    if (path === "/finished-good")     return "Finished Goods Inventory";
    if (path.startsWith("/branch/")) {
      const bName = path.split("/").pop();
      return `${bName} — Raw Material`;
    }
    if (path.startsWith("/finish-good/")) {
      const bName = path.split("/").pop();
      return `${bName} — Finished Good`;
    }
    if (path === "/purchase")          return "Purchase Management";
    if (path === "/dispatch")          return "Dispatch & Billing";
    if (path === "/crushing")          return "Crushing Operations";
    if (path === "/pmmpl-rates")       return "PMMPL Rate Card";
    if (path === "/reports")           return "Analytics & Reports";
    if (path === "/stock-adjustment")  return "Stock Adjustment";
    if (path === "/settings")          return "System Settings";
    return "Inventory Control";
  };

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === "/")                  return "Home";
    if (path === "/raw-material")      return "Inventory / Raw Material";
    if (path === "/finished-good")     return "Inventory / Finished Goods";
    if (path === "/stock-adjustment")  return "Operations / Stock Adjustment";
    if (path === "/settings")          return "Admin / Settings";
    return "";
  };

  const userInitials = (user?.name || user?.username || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
    setTimeout(() => setRefreshing(false), 2000);
  };

  return (
    <header
      className="glass-header shrink-0 z-30 select-none"
      style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
      }}
    >
      {/* ── Left: Page Title ──────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h1
          className="hidden md:block"
          style={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--ink)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {getPageTitle()}
        </h1>
        {getBreadcrumb() && (
          <span
            className="hidden md:block"
            style={{
              fontSize: '0.68rem',
              color: 'var(--ink-faint)',
              marginTop: '2px',
              letterSpacing: '0.01em',
            }}
          >
            {getBreadcrumb()}
          </span>
        )}
      </div>

      {/* ── Right: Actions ───────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          title="Refresh Data"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--surface-soft)',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--surface-mid)';
            e.currentTarget.style.color = 'var(--ink)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--surface-soft)';
            e.currentTarget.style.color = 'var(--ink-muted)';
          }}
        >
          <RefreshCw
            style={{
              width: '14px',
              height: '14px',
              animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            }}
          />
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--line)' }} />

        {/* Profile Dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 10px 6px 6px',
              borderRadius: '9px',
              border: '1px solid var(--line)',
              background: showProfileDropdown ? 'var(--surface-mid)' : 'var(--surface-soft)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-mid)'}
            onMouseLeave={e => !showProfileDropdown && (e.currentTarget.style.background = 'var(--surface-soft)')}
          >
            {/* Avatar */}
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'var(--brand-green)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.65rem',
              flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div className="hidden sm:block" style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {user?.name?.split(" ")[0] || user?.username || "User"}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--ink-faint)', marginTop: '1px' }}>
                {user?.role}
              </div>
            </div>
            <ChevronDown
              style={{
                width: '13px',
                height: '13px',
                color: 'var(--ink-faint)',
                transition: 'transform 0.2s',
                transform: showProfileDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              className="hidden sm:block"
            />
          </button>

          <AnimatePresence>
            {showProfileDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: '220px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(17,24,39,0.12)',
                  overflow: 'hidden',
                  zIndex: 99,
                }}
              >
                {/* User Info */}
                <div style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--line)',
                  background: 'var(--surface-soft)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '9px',
                      background: 'var(--brand-green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                    }}>
                      {userInitials}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>
                        {user?.name || user?.username}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--ink-faint)', marginTop: '1px' }}>
                        {user?.username}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Meta Info */}
                <div style={{ padding: '8px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '7px',
                    fontSize: '0.75rem', color: 'var(--ink-muted)',
                  }}>
                    <Shield style={{ width: '13px', height: '13px', color: 'var(--brand-green)', flexShrink: 0 }} />
                    <span>Role: <strong style={{ color: 'var(--ink)' }}>{user?.role}</strong></span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '7px',
                    fontSize: '0.75rem', color: 'var(--ink-muted)',
                  }}>
                    <Database style={{ width: '13px', height: '13px', color: 'var(--brand-green)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.branch === "All"
                        ? "All Branches"
                        : Array.isArray(user?.branch)
                          ? user.branch.join(", ")
                          : user?.branch}
                    </span>
                  </div>
                </div>

                {/* Sign Out */}
                <div style={{ padding: '6px 8px 10px', borderTop: '1px solid var(--line)' }}>
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      logout();
                      navigate("/login");
                    }}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      color: '#dc2626',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut style={{ width: '14px', height: '14px' }} />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </header>
  );
};

export default Header;
