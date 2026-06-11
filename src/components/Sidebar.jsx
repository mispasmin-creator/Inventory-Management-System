import React, { useState, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Send,
  Layers,
  IndianRupee,
  FileBarChart,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  X,
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

  // Branch Submenu items
  const branches = [
    { name: "Purab Branch", path: "/branch/Purab" },
    { name: "Pmmpl Branch", path: "/branch/Pmmpl" },
    { name: "Rkl Branch", path: "/branch/Rkl" },
  ];

  // Helper: check if user has access to a branch name (and optionally a type)
  const hasBranchAccess = (branchName, type = "raw_material") => {
    if (!user) return false;
    if (user.role === "Admin") return true;

    const normalizeBranch = (value) =>
      value?.toLowerCase() === "madhya" ? "Pmmpl" : value;

    // Check granular page_access keys: RawMaterial_Purab, FinishGood_Rkl etc.
    const pageAccess = user.page_access || [];
    const prefix = type === "finish_good" ? "FinishGood" : "RawMaterial";
    // Extract just the branch name without " Branch" suffix
    const bName = normalizeBranch(branchName.replace(" Branch", ""));
    const legacyBName = bName === "Pmmpl" ? "Madhya" : bName;
    const specificKey = `${prefix}_${bName}`;
    const legacySpecificKey = `${prefix}_${legacyBName}`;
    if (
      pageAccess.includes(specificKey) ||
      pageAccess.includes(legacySpecificKey)
    )
      return true;

    // If page_access is configured, we strictly rely on it and do not fall back
    if (pageAccess.length > 0) return false;

    // Legacy: branch array or 'All' fallback
    if (user.branch === "All") return true;
    if (Array.isArray(user.branch)) {
      return user.branch.some((b) => branchName.startsWith(normalizeBranch(b)));
    }
    return branchName.startsWith(normalizeBranch(user.branch));
  };

  // Filter branches based on access
  const accessibleBranches = branches.filter((b) =>
    hasBranchAccess(b.name, "raw_material"),
  );
  const accessibleFinishGoodBranches = branches.filter((b) =>
    hasBranchAccess(b.name, "finish_good"),
  );

  const menuItems = [
    { title: "Dashboard", path: "/", icon: LayoutDashboard },
    { title: "Raw Material", path: "/raw-material", icon: Building2 },
    { title: "Finished Good", path: "/finished-good", icon: Building2 },
    // { title: 'Purchase Entry', path: '/purchase', icon: ShoppingCart },
    // { title: 'Dispatch (Sales)', path: '/dispatch', icon: Send },
    // { title: 'Crushing Item', path: '/crushing', icon: Layers },
    // { title: 'PMMPL Rates', path: '/pmmpl-rates', icon: IndianRupee },
    // { title: 'Reports Center', path: '/reports', icon: FileBarChart },
    { title: "System Settings", path: "/settings", icon: Settings },
  ];

  // Filter menuItems based on page_access for non-Admin users
  const filteredMenuItems = menuItems.filter((item) => {
    if (!user) return false;
    if (user.role === "Admin") return true;

    const pageMapping = {
      Dashboard: "Dashboard",
      "Raw Material": null,
      "Finished Good": null,
      "Purchase Entry": "Purchase",
      "Dispatch (Sales)": "Dispatch",
      "Crushing Item": "Crushing",
      "PMMPL Rates": "PmmplRate",
      "Reports Center": "Reports",
      "System Settings": "Settings",
    };

    // Inventory pages are checked per-branch via hasBranchAccess
    if (item.title === "Raw Material") {
      return accessibleBranches.length > 0;
    }
    if (item.title === "Finished Good") {
      return accessibleFinishGoodBranches.length > 0;
    }

    const dbPageName = pageMapping[item.title];
    if (!dbPageName) return true;

    const allowedPages = user.page_access || [];
    return allowedPages.includes(dbPageName);
  });

  // Shared nav content rendered inline (NOT as inner component) to preserve scroll
  const renderNavContent = () => (
    <div className="flex flex-col h-full text-slate-700 bg-white">
      {/* Brand Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="PMMPL Logo"
            className="w-9 h-9 rounded-xl object-cover shadow-sm border border-slate-200"
          />
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="font-semibold text-lg text-slate-900"
            >
              INVENTORY APP
            </motion.div>
          )}
        </div>

        {/* Toggle Collapse Button for desktop */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200 cursor-pointer"
        >
          <ChevronLeft
            className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Navigation Links */}
      <div
        ref={navScrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      >
        {filteredMenuItems.map((item, idx) => {
          const Icon = item.icon;

          if (item.submenu) {
            return (
              <div key={idx} className="space-y-1">
                {!isCollapsed ? (
                  <>
                    <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    <div className="pl-6 space-y-1">
                      {item.submenu.map((sub, sIdx) => (
                        <NavLink
                          key={sIdx}
                          to={sub.path}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 border-l-4 border-emerald-500 font-medium"
                                : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                            }`
                          }
                        >
                          {sub.name}
                        </NavLink>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex justify-center py-2 text-slate-500">
                    <Icon className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={idx}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold border-l-4 border-emerald-500 shadow-sm"
                    : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                } ${isCollapsed ? "justify-center" : ""}`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>{item.title}</span>}
            </NavLink>
          );
        })}
      </div>

      {/* Logout Action */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-rose-400 hover:bg-rose-950/20 hover:text-rose-300 transition-colors cursor-pointer ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
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
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-200 cursor-pointer"
        >
          {mobileOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="md:hidden fixed inset-0 bg-black z-40"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="md:hidden fixed top-0 bottom-0 left-0 w-[260px] z-50 glass-sidebar shadow-2xl"
            >
              {renderNavContent()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar Layout */}
      <div
        className={`hidden md:block h-screen glass-sidebar shrink-0 transition-all duration-300 ${
          isCollapsed ? "w-[70px]" : "w-[250px]"
        }`}
      >
        {renderNavContent()}
      </div>
    </>
  );
};

export default Sidebar;
