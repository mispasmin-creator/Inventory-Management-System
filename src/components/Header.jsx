import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  Database,
  Shield,
  User,
  ChevronDown,
  LogOut,
  Calendar,
  Search,
  Bell,
  Sun,
  Moon,
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

  // Theme support
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

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

  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  return (
    <header
      className="glass-header shrink-0 z-30 select-none transition-colors duration-200"
      style={{
        height: '76px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* ── Left: Date Display & Page Title ──────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <Calendar className="w-3.5 h-3.5 text-(--brand-green) shrink-0" />
          <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--ink-muted)' }}>{formattedDate}</span>
        </div>
        <h1
          style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            color: 'var(--ink)',
            margin: 0,
            lineHeight: 1.2,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {getPageTitle()}
          {/* {getPageTitle() === 'Dashboard' && <span role="img" aria-label="emoji">😍</span>} */}
        </h1>
      </div>

      {/* ── Center: Search Input Mockup (Adapted from image) ───────────────── */}
      {/* <div className="relative hidden lg:block w-72">
        <input
          type="text"
          placeholder="Search by date, name or ID..."
          disabled
          style={{
            width: '100%',
            padding: '7px 40px 7px 16px',
            fontSize: '0.75rem',
            borderRadius: '9999px',
            border: '1px solid var(--line)',
            background: 'var(--surface-soft)',
            color: 'var(--ink)',
            outline: 'none',
            cursor: 'not-allowed',
          }}
        />
        <Search className="absolute right-3.5 top-2.5 w-3.5 h-3.5 text-(--ink-faint)" />
      </div> */}

      {/* ── Right: Actions ───────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        {/* Notification Bell Button */}
        {/* <button
          title="Notifications"
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
            position: 'relative',
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
          <Bell style={{ width: '15px', height: '15px' }} />
          <span style={{ position: 'absolute', top: '8px', right: '8px', width: '6px', height: '6px', background: '#e11d48', borderRadius: '50%' }} />
        </button> */}

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
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
          {theme === "light" ? <Moon style={{ width: '15px', height: '15px' }} /> : <Sun style={{ width: '15px', height: '15px' }} />}
        </button>

        {/* Refresh Button */}
        {/* <button
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
        </button> */}

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
