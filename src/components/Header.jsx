import React, { useState, useEffect } from "react";
import {
  Bell,
  RefreshCw,
  Database,
  User,
  Shield,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiService } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";

const Header = () => {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isMock = !import.meta.env.VITE_APPS_SCRIPT_URL;
  const navigate = useNavigate();
  const location = useLocation();

  // Map route to page title
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/") return "Dashboard";
    if (path === "/inventory") return "Inventory Control";
    if (path === "/raw-material") return "Raw Material";
    if (path === "/finished-good") return "Finished Good";
    if (path.startsWith("/branch/")) {
      const bName = path.split("/").pop();
      return `${bName} Branch Raw Material`;
    }
    if (path.startsWith("/finish-good/")) {
      const bName = path.split("/").pop();
      return `${bName} Branch Finish Good`;
    }
    if (path === "/purchase") return "Purchase Management";
    if (path === "/dispatch") return "Dispatch & Billing";
    if (path === "/crushing") return "Crushing Operations";
    if (path === "/pmmpl-rates") return "PMMPL Rate Card";
    if (path === "/reports") return "Analytics & Reports";
    if (path === "/settings") return "System Settings";
    return "Inventory Control";
  };

  const fetchAlerts = async () => {
    if (!user) return;
    try {
      const list = [];

      // 1. Fetch inventory to look for low stock alerts
      const branchesToQuery =
        user.branch === "All"
          ? ["Main", "Madhya", "Rkl", "Purab"]
          : Array.isArray(user.branch)
            ? user.branch
            : [user.branch];

      for (const bName of branchesToQuery) {
        const items = await apiService.getInventory(bName);
        items.forEach((item) => {
          if (item.currentStock <= item.minThreshold) {
            list.push({
              id: `low-${bName}-${item.itemId}`,
              type: "low_stock",
              title: "Low Stock Alert",
              message: `${item.itemName} in ${bName} is at ${item.currentStock} ${item.unit} (Min: ${item.minThreshold})`,
              severity: "high",
              link: `/branch/${bName}`,
            });
          }
        });
      }

      // 2. Fetch transfers for pending requests
      const transfers = await apiService.getTransfers();
      const pendingTransfers = transfers.filter((t) => t.status === "Pending");
      pendingTransfers.forEach((t) => {
        // Admins approve all, Branch managers see if it involves them
        const isAuthorized =
          user.role === "Admin" ||
          (Array.isArray(user.branch)
            ? user.branch.some(
                (b) => b.toLowerCase() === t.toBranch.toLowerCase(),
              )
            : user.branch?.toLowerCase() === t.toBranch?.toLowerCase());
        if (isAuthorized) {
          list.push({
            id: `transfer-${t.transferId}`,
            type: "transfer_request",
            title: "Material Transfer Request",
            message: `${t.qty} ${t.unit} of ${t.itemName} requested: ${t.fromBranch} → ${t.toBranch}`,
            severity: "info",
            link:
              user.role === "Admin"
                ? `/branch/${t.toBranch}`
                : `/branch/${t.fromBranch}`,
          });
        }
      });

      setNotifications(list);
    } catch (e) {
      console.error("Failed to load notification alerts:", e);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Poll notifications every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAlerts();
    setTimeout(() => setRefreshing(false), 8000);
  };

  return (
    <header className="h-[70px] glass-header shrink-0 flex items-center justify-between px-6 z-30 select-none">
      {/* Title */}
      <div>
        <h1 className="font-semibold text-lg text-slate-900 hidden md:block">
          {getPageTitle()}
        </h1>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-4 ml-auto md:ml-0">
        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfileDropdown(!showProfileDropdown);
              setShowNotifDropdown(false);
            }}
            className="flex items-center gap-2 p-2 rounded-full bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 cursor-pointer select-none"
          >
            <span className="text-xs font-medium max-w-[100px] truncate hidden sm:inline">
              {user?.name?.split(" ")[0] || "User"}
            </span>
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
          </button>

          <AnimatePresence>
            {showProfileDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2.5 w-52 rounded-xl glass-dropdown shadow-2xl p-2 z-[99] text-xs"
              >
                <div className="p-3 border-b border-slate-800">
                  <p className="font-semibold text-slate-200">{user?.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {user?.username}
                  </p>
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="flex items-center gap-2 px-3 py-2 text-slate-400">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span>Role: {user?.role}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-slate-400">
                    <Database className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Scope:{" "}
                      {user?.branch === "All"
                        ? "All Branches"
                        : Array.isArray(user?.branch)
                          ? user.branch.join(", ")
                          : user?.branch}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-800 mt-2 pt-1.5">
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      logout();
                      navigate("/login");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                  >
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

export default Header;
