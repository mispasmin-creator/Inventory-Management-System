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

  // ... (बाकी सभी ब्रांच फ़िल्टरिंग फंक्शन्स आपके जैसे ही रहेंगे) ...
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
  const accessibleStockAdjustmentBranches = branches.filter((branch) => {
    if (!user) return false;
    if (user.role === "Admin") return true;

    const branchName = branch.name.replace(" Branch", "");
    const pageAccess = user.page_access || [];
    const normalizedBranch = branchName === "Madhya" ? "Pmmpl" : branchName;
    const legacyBranch = normalizedBranch === "Pmmpl" ? "Madhya" : normalizedBranch;
    const hasGranularAccess = pageAccess.some(key => key.startsWith("StockAdjustment_"));
    const assignedBranches = user.branch === "All"
      ? branches.map(item => item.name.replace(" Branch", ""))
      : (Array.isArray(user.branch) ? user.branch : [user.branch]);
    const hasAssignedBranch = assignedBranches.some(assigned =>
      (assigned === "Madhya" ? "Pmmpl" : assigned) === normalizedBranch
    );

    if (hasGranularAccess) {
      return hasAssignedBranch && (
        pageAccess.includes(`StockAdjustment_${normalizedBranch}`)
        || pageAccess.includes(`StockAdjustment_${legacyBranch}`)
      );
    }

    if (!pageAccess.includes("StockAdjustment")) return false;
    return hasAssignedBranch;
  });

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
      return accessibleStockAdjustmentBranches.length > 0;
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
    <div
      className="flex flex-col h-full relative"
      style={{ background: 'var(--surface)' }}
    >
      {/* Logo watermark - optional, you can keep or remove */}
      <div className="sidebar-logo-watermark" />

      {/* ── Brand Header ─────────────────────────── */}
      <div
        style={{
          padding: isCollapsed ? '20px 14px' : '22px 22px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          minHeight: '78px',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', minWidth: 0, flexShrink: isCollapsed ? 0 : 1 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--brand-green-light), var(--brand-green))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(4, 120, 87, 0.30)',
            }}
          >
            <img
              src="/logo.png"
              alt="Logo"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '7px',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ink)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                IMS Application
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '3px' }}>
                {/* optional subtitle */}
              </div>
            </motion.div>
          )}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            padding: '7px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--surface-soft)',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--brand-green-soft)';
            e.currentTarget.style.color = 'var(--brand-green-dark)';
            e.currentTarget.style.borderColor = 'rgba(4, 120, 87, 0.25)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--surface-soft)';
            e.currentTarget.style.color = 'var(--ink-muted)';
            e.currentTarget.style.borderColor = 'var(--line)';
          }}
        >
          <ChevronLeft
            style={{
              width: '16px', height: '16px',
              transition: 'transform 0.25s',
              transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────── */}
      <div
        ref={navScrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}
      >
        {!isCollapsed && (
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-faint)',
            padding: '8px 12px 6px',
          }}>
            {/* Menu label - optional */}
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
              title={isCollapsed ? item.title : undefined}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: isCollapsed ? '12px' : '12px 16px',
                borderRadius: '11px',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#ffffff' : 'var(--ink-muted)',
                background: isActive ? 'linear-gradient(135deg, var(--brand-green-light), var(--brand-green))' : 'transparent',
                boxShadow: isActive ? '0 4px 14px rgba(4, 120, 87, 0.28)' : 'none',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                position: 'relative',
                zIndex: 1,
              })}
              onMouseEnter={(e) => {
                const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--brand-green-soft)';
                  e.currentTarget.style.color = 'var(--brand-green-dark)';
                }
              }}
              onMouseLeave={(e) => {
                const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-muted)';
                }
              }}
            >
              <Icon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          );
        })}
      </div>

      {/* ── User Footer ──────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--line)',
        padding: '18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
        zIndex: 1,
      }}>
        {!isCollapsed && user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 14px',
            borderRadius: '13px',
            background: 'var(--surface-soft)',
            border: '1px solid var(--line)',
            marginBottom: '4px',
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--brand-green-light), var(--brand-green))',
              boxShadow: '0 3px 10px rgba(4, 120, 87, 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
            }}>
              {userInitials}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.username}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 500 }}>
                {user.role}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          title={isCollapsed ? 'Log Out' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '10px 12px',
            borderRadius: '9px',
            fontSize: '0.85rem',
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
          <LogOut style={{ width: '17px', height: '17px', flexShrink: 0 }} />
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
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="md:hidden fixed top-0 bottom-0 left-0 w-[284px] z-50 glass-sidebar"
            >
              {renderNavContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div
        className="hidden md:block h-screen glass-sidebar shrink-0 transition-all duration-300"
        style={{ width: isCollapsed ? '78px' : '276px' }}
      >
        {renderNavContent()}
      </div>
    </>
  );
};

export default Sidebar;