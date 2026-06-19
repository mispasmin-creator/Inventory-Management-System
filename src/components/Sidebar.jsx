import React, { useState, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  SlidersHorizontal,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  X,
  Package,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navScrollRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const branches = [
    { name: "Purab Branch", path: "/branch/Purab" },
    { name: "Pmmpl Branch", path: "/branch/Pmmpl" },
    { name: "Rkl Branch",   path: "/branch/Rkl"   },
  ];

  const hasBranchAccess = (branchName, type = "raw_material") => {
    if (!user) return false;
    if (user.role === "Admin") return true;
    const normalizeBranch = (value) =>
      value?.toLowerCase() === "madhya" ? "Pmmpl" : value;
    const pageAccess = user.page_access || [];
    const prefix = type === "finish_good" ? "FinishGood" : "RawMaterial";
    const bName = normalizeBranch(branchName.replace(" Branch", ""));
    const legacyBName = bName === "Pmmpl" ? "Madhya" : bName;
    const specificKey = `${prefix}_${bName}`;
    const legacySpecificKey = `${prefix}_${legacyBName}`;
    if (pageAccess.includes(specificKey) || pageAccess.includes(legacySpecificKey)) return true;
    if (pageAccess.length > 0) return false;
    if (user.branch === "All") return true;
    if (Array.isArray(user.branch)) {
      return user.branch.some((b) => branchName.startsWith(normalizeBranch(b)));
    }
    return branchName.startsWith(normalizeBranch(user.branch));
  };

  const accessibleBranches = branches.filter((b) => hasBranchAccess(b.name, "raw_material"));
  const accessibleFinishGoodBranches = branches.filter((b) => hasBranchAccess(b.name, "finish_good"));

  const menuItems = [
    { title: "Dashboard",       path: "/",               icon: LayoutDashboard },
    { title: "Raw Material",    path: "/raw-material",   icon: Building2 },
    { title: "Finished Good",   path: "/finished-good",  icon: Package },
    { title: "Stock Adjustment",path: "/stock-adjustment",icon: SlidersHorizontal },
    { title: "System Settings", path: "/settings",       icon: Settings },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (!user) return false;
    if (user.role === "Admin") return true;
    const pageMapping = {
      Dashboard:        "Dashboard",
      "Raw Material":   null,
      "Finished Good":  null,
      "Stock Adjustment": "StockAdjustment",
      "System Settings":  "Settings",
    };
    if (item.title === "Raw Material")    return accessibleBranches.length > 0;
    if (item.title === "Finished Good")   return accessibleFinishGoodBranches.length > 0;
    if (item.title === "Stock Adjustment") {
      const allowed = user.page_access || [];
      return allowed.includes("StockAdjustment") && accessibleBranches.length > 0;
    }
    const dbPageName = pageMapping[item.title];
    if (!dbPageName) return true;
    const allowedPages = user.page_access || [];
    return allowedPages.includes(dbPageName);
  });

  const userInitials = (user?.name || user?.username || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderNavContent = () => (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--surface)' }}>

      {/* Logo watermark */}
      <div className="sidebar-logo-watermark" />

      {/* ── Brand Header ─────────────────────────── */}
      <div
        style={{
          padding: isCollapsed ? '18px 12px' : '18px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          minHeight: '70px',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <img
            src="/logo.png"
            alt="Logo"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              objectFit: 'cover',
              border: '1px solid var(--line)',
              flexShrink: 0,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          />
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--ink)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                PASSARY GROUP
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '2px' }}>
                Inventory Management
              </div>
            </motion.div>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex"
          style={{
            padding: '6px',
            borderRadius: '7px',
            border: '1px solid var(--line)',
            background: 'var(--surface-soft)',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-mid)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-soft)'}
        >
          <ChevronLeft
            style={{
              width: '14px', height: '14px',
              transition: 'transform 0.25s',
              transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────── */}
      <div
        ref={navScrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}
      >
        {!isCollapsed && (
          <div style={{
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            padding: '8px 10px 4px',
          }}>
            Navigation
          </div>
        )}

        {filteredMenuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={idx}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: isCollapsed ? '10px' : '9px 10px',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--brand-green-dark)' : 'var(--ink-muted)',
                background: isActive ? 'var(--brand-green-soft)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--brand-green)' : '3px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                position: 'relative',
                zIndex: 1,
              })}
              onMouseEnter={(e) => {
                const active = e.currentTarget.style.background !== 'transparent' && e.currentTarget.style.background !== '';
                if (!active) {
                  e.currentTarget.style.background = 'var(--surface-mid)';
                  e.currentTarget.style.color = 'var(--ink)';
                }
              }}
              onMouseLeave={(e) => {
                const isActiveEl = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!isActiveEl) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-muted)';
                }
              }}
            >
              <Icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          );
        })}
      </div>

      {/* ── User Footer ──────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--line)',
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        position: 'relative',
        zIndex: 1,
      }}>
        {!isCollapsed && user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: 'var(--surface-soft)',
            border: '1px solid var(--line)',
            marginBottom: '4px',
          }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '7px',
              background: 'var(--brand-green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.username}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', marginTop: '1px' }}>
                {user.role}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '8px 10px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 500,
            color: '#dc2626',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut style={{ width: '15px', height: '15px', flexShrink: 0 }} />
          {!isCollapsed && <span>Log Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            padding: '8px',
            borderRadius: '10px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            color: 'var(--ink-muted)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            cursor: 'pointer',
          }}
        >
          {mobileOpen ? <X style={{ width: '18px', height: '18px' }} /> : <Menu style={{ width: '18px', height: '18px' }} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="md:hidden fixed inset-0 bg-black z-40"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="md:hidden fixed top-0 bottom-0 left-0 w-[260px] z-50 glass-sidebar"
            >
              {renderNavContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div
        className="hidden md:block h-screen glass-sidebar shrink-0 transition-all duration-300"
        style={{ width: isCollapsed ? '68px' : '240px' }}
      >
        {renderNavContent()}
      </div>
    </>
  );
};

export default Sidebar;
