import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  SlidersHorizontal,
  Settings,
  Package,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const TopNav = () => {
  const { user } = useAuth();

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

  return (
    <nav className="glass-header shrink-0 z-20 select-none">
      <div
        className="flex items-center overflow-x-auto"
        style={{ padding: '10px 16px', gap: '8px' }}
      >
        {filteredMenuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={idx}
              to={item.path}
              end={item.path === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '9999px',
                fontSize: '0.82rem',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? '#ffffff' : 'var(--ink-muted)',
                background: isActive ? 'linear-gradient(135deg, var(--brand-green-light), var(--brand-green))' : 'transparent',
                boxShadow: isActive ? '0 4px 14px rgba(4, 120, 87, 0.28)' : 'none',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              })}
              onMouseEnter={(e) => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.background = 'var(--brand-green-soft)';
                  e.currentTarget.style.color = 'var(--brand-green-dark)';
                }
              }}
              onMouseLeave={(e) => {
                if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-muted)';
                }
              }}
            >
              <Icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default TopNav;
