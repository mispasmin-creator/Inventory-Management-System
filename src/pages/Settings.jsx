import React, { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import GlassCard from '../components/GlassCard';
import Modal from '../components/Modal';
import { TableSkeleton } from '../components/Skeleton';
import { supabase } from '../services/supabaseClient';
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  ShieldCheck,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Lock,
  UserCheck,
  Building2,
  LayoutDashboard,
  Layers,
  ShoppingCart,
  Send,
  IndianRupee,
  FileBarChart,
  Cog,
  PackageOpen,
  SlidersHorizontal,
} from 'lucide-react';

// Page access groups — each with sub-pages
const ALL_PAGE_GROUPS = [
  {
    group: 'Raw Material',
    icon: Building2,
    pages: [
      { key: 'RawMaterial_Purab',  label: 'Purab Branch' },
      { key: 'RawMaterial_Pmmpl', label: 'Pmmpl Branch' },
      { key: 'RawMaterial_Rkl',   label: 'Rkl Branch' },
    ]
  },
  {
    group: 'Finish Good',
    icon: PackageOpen,
    pages: [
      { key: 'FinishGood_Purab',  label: 'Purab Branch' },
      { key: 'FinishGood_Pmmpl', label: 'Pmmpl Branch' },
      { key: 'FinishGood_Rkl',   label: 'Rkl Branch' },
    ]
  },
  { group: null, pages: [
    { key: 'StockAdjustment', label: 'Stock Adjustment', icon: SlidersHorizontal },
    { key: 'Settings',  label: 'System Settings',  icon: Cog },
    { key: 'Dashboard', label: 'Dashboard',        icon: LayoutDashboard },
  ]},
];

// Flat list of all keys for select-all
const ALL_PAGE_KEYS = ALL_PAGE_GROUPS.flatMap(g => g.pages.map(p => p.key));

const ROLES = ['Admin', 'User', 'Viewer'];
const BRANCH_OPTIONS = ['Purab', 'Pmmpl', 'Rkl'];
const normalizeBranchName = (value) => value === 'Madhya' ? 'Pmmpl' : value;
const normalizePageAccessKey = (key) => key
  ?.replace('RawMaterial_Madhya', 'RawMaterial_Pmmpl')
  .replace('FinishGood_Madhya', 'FinishGood_Pmmpl');

const emptyForm = {
  username: '',
  password: '',
  role: 'Viewer',
  firms: ['All'],   // array; 'All' means all branches
  page_access: [],
};

const Settings = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const isAdmin = user?.role === 'Admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form state
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('login')
        .select('id, username, password, role, firm_name, page_access, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (e) {
      showError('Failed to load users: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Page access checkbox toggle ───────────────────────────────────────────
  const togglePage = (key) => {
    setForm(prev => ({
      ...prev,
      page_access: prev.page_access.includes(key)
        ? prev.page_access.filter(p => p !== key)
        : [...prev.page_access, key]
    }));
  };

  // ── Firm/Branch multi-select toggle ──────────────────────────────────────
  const toggleFirm = (firm) => {
    setForm(prev => {
      if (firm === 'All') {
        // Toggle 'All' — if already selected deselect everything, else select only 'All'
        return { ...prev, firms: prev.firms.includes('All') ? [] : ['All'] };
      }
      // Selecting a specific branch — remove 'All' if present
      const withoutAll = prev.firms.filter(f => f !== 'All');
      const already = withoutAll.includes(firm);
      const newFirms = already ? withoutAll.filter(f => f !== firm) : [...withoutAll, firm];
      // If all 3 specific branches selected, auto-switch to 'All'
      if (BRANCH_OPTIONS.every(b => newFirms.includes(b))) return { ...prev, firms: ['All'] };
      return { ...prev, firms: newFirms };
    });
  };

  // ── Serialize firms array → stored string ────────────────────────────────
  const firmsToString = (firms) => {
    if (!firms || firms.length === 0) return 'Purab'; // fallback
    if (firms.includes('All')) return 'All';
    return firms.join(',');
  };

  // ── Parse stored firm_name string → array ────────────────────────────────
  const firmStringToArray = (str) => {
    if (!str) return ['All'];
    if (str === 'All') return ['All'];
    return str.split(',').map(s => normalizeBranchName(s.trim())).filter(Boolean);
  };

  // ── Open Add Modal ────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm);
    setShowPassword(false);
    setAddOpen(true);
  };

  // ── Open Edit Modal ───────────────────────────────────────────────────────
  const openEdit = (usr) => {
    setSelectedUser(usr);
    setForm({
      username: usr.username,
      password: usr.password || '', // pre-fill password
      role: usr.role,
      firms: firmStringToArray(usr.firm_name),
      page_access: (usr.page_access || []).map(normalizePageAccessKey),
    });
    setShowPassword(false);
    setEditOpen(true);
  };

  // ── Create User ───────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password.trim()) {
      showError('Username and password are required.');
      return;
    }
    if (!form.firms || form.firms.length === 0) {
      showError('Please select at least one branch.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('login').insert([{
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        firm_name: firmsToString(form.firms),
        page_access: form.role === 'Admin' ? [] : form.page_access,
      }]);
      if (error) throw error;
      showSuccess(`User "${form.username}" created successfully.`);
      setAddOpen(false);
      fetchUsers();
    } catch (e) {
      showError('Failed to create user: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Update User ───────────────────────────────────────────────────────────
  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!form.firms || form.firms.length === 0) {
      showError('Please select at least one branch.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        username: form.username.trim(),
        role: form.role,
        firm_name: firmsToString(form.firms),
        page_access: form.role === 'Admin' ? [] : form.page_access,
      };
      // Only update password if a new one is entered
      if (form.password.trim()) {
        updates.password = form.password;
      }
      const { error } = await supabase
        .from('login')
        .update(updates)
        .eq('id', selectedUser.id);
      if (error) throw error;
      showSuccess(`User "${form.username}" updated successfully.`);
      setEditOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (e) {
      showError('Failed to update user: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete User ───────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('login')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      showSuccess(`User "${deleteTarget.username}" deleted.`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchUsers();
    } catch (e) {
      showError('Failed to delete user: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Role badge style ──────────────────────────────────────────────────────
  const roleBadge = (role) => {
    const map = {
      Admin: 'bg-violet-950 text-violet-300 border-violet-500/20',
      Manager: 'bg-indigo-950 text-indigo-300 border-indigo-500/20',
      Viewer: 'bg-slate-800 text-slate-400 border-slate-700',
    };
    return map[role] || map.Viewer;
  };

  // ── Shared form fields (used in both Add & Edit) ──────────────────────────
  const renderFormFields = (isEdit = false) => (
    <div className="space-y-5">
      {/* Username & Password row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
            Username
          </label>
          <input
            type="text"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            placeholder="e.g. john_doe"
            className="w-full px-3 py-2.5 text-xs rounded-lg glass-input"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Enter password"
              className="w-full px-3 py-2.5 pr-9 text-xs rounded-lg glass-input"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Role row */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
          Role
        </label>
        <select
          value={form.role}
          onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
          className="w-full px-3 py-2.5 text-xs rounded-lg glass-input appearance-none bg-slate-900"
        >
          {ROLES.map(r => (
            <option key={r} value={r}>
              {r === 'Admin' ? 'Admin' : r === 'User' ? 'User' : 'Viewer (View Only)'}
            </option>
          ))}
        </select>
      </div>

      {/* Page Access — shown for non-Admin roles */}
      {form.role !== 'Admin' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
              Page Access
            </label>
            <button
              type="button"
              onClick={() => setForm(p => ({
                ...p,
                page_access: p.page_access.length === ALL_PAGE_KEYS.length ? [] : [...ALL_PAGE_KEYS]
              }))}
              className="text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer underline underline-offset-2"
            >
              {form.page_access.length === ALL_PAGE_KEYS.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="space-y-3">
            {ALL_PAGE_GROUPS.map((grp, gIdx) => (
              <div key={gIdx}>
                {/* Group header with icon (for Raw Material / Finish Good) */}
                {grp.group && (() => {
                  const GrpIcon = grp.icon;
                  const grpKeys = grp.pages.map(p => p.key);
                  const allChecked = grpKeys.every(k => form.page_access.includes(k));
                  return (
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <GrpIcon className="w-3 h-3" />
                        {grp.group}
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(p => {
                          const withoutGrp = p.page_access.filter(k => !grpKeys.includes(k));
                          return { ...p, page_access: allChecked ? withoutGrp : [...withoutGrp, ...grpKeys] };
                        })}
                        className="text-[10px] text-slate-500 hover:text-indigo-400 cursor-pointer underline underline-offset-2"
                      >
                        {allChecked ? 'Deselect All' : 'All'}
                      </button>
                    </div>
                  );
                })()}

                {/* Sub-pages */}
                <div className={`grid grid-cols-1 gap-1 ${grp.group ? 'pl-3 border-l border-slate-800' : ''}`}>
                  {grp.pages.map((pg, idx) => {
                    const Icon = pg.icon || null;
                    const isActive = form.page_access.includes(pg.key);
                    return (
                      <label
                        key={`${pg.key}-${idx}`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs select-none ${
                          isActive
                            ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                            : 'bg-slate-900/30 border-slate-800/70 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => togglePage(pg.key)}
                          className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                        />
                        {Icon && <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-600'}`} />}
                        <span className="font-medium">{pg.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {form.role === 'Admin' && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-violet-950/20 border border-violet-500/15 text-xs text-violet-300">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          Admin role grants full access to all pages and all branches automatically.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1.5 animate-slide-up">

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-indigo-400" />
            <span>User Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Create, edit, and manage system users, their roles, branch access, and page permissions.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-white shadow shadow-indigo-600/20 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New User
          </button>
        )}
      </div>

      {/* Users Table */}
      <GlassCard className="p-4 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
            <Users className="w-8 h-8 opacity-30" />
            <span>No users found</span>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block max-h-[500px] overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-800 bg-slate-900">
                    <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Username</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Role</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Firm / Branch</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Page Access</th>
                    <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Created</th>
                    {isAdmin && (
                      <th className="text-right px-5 py-3.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-900 z-10">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map(usr => (
                    <tr key={usr.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase">
                            {usr.username.slice(0, 2)}
                          </div>
                          <span className="font-semibold text-slate-200">{usr.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadge(usr.role)}`}>
                          {usr.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Building2 className="w-3 h-3" />
                          <span>{usr.firm_name === 'All' ? 'All Branches' : `${firmStringToArray(usr.firm_name).join(', ')} Branch`}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {usr.role === 'Admin' ? (
                          <span className="text-violet-400 flex items-center gap-1 text-[10px]">
                            <ShieldCheck className="w-3 h-3" /> Full Access
                          </span>
                        ) : (usr.page_access || []).length === 0 ? (
                          <span className="text-slate-600 italic">No pages assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(usr.page_access || []).map(p => {
                              const pg = ALL_PAGE_GROUPS.flatMap(g => g.pages).find(pg => pg.key === p);
                              return (
                                <span key={p} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-medium">
                                  {pg?.label || p}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {new Date(usr.created_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => openEdit(usr)}
                              className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-950/30 transition-all cursor-pointer"
                              title="Edit user"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-black" />
                            </button>
                            <button
                              onClick={() => { setDeleteTarget(usr); setDeleteOpen(true); }}
                              className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-950/30 transition-all cursor-pointer"
                              title="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden max-h-[500px] overflow-auto divide-y divide-slate-800/60">
              {users.map(usr => (
                <div key={usr.id} className="p-4 space-y-3 hover:bg-slate-800/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase">
                        {usr.username.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200 text-sm block">{usr.username}</span>
                        <span className="text-[10px] text-slate-500">{new Date(usr.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(usr)}
                          className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-950/30 transition-all cursor-pointer"
                          title="Edit user"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-black" />
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(usr); setDeleteOpen(true); }}
                          className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-950/30 transition-all cursor-pointer"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">Role</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${roleBadge(usr.role)}`}>
                        {usr.role}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">Firm / Branch</span>
                      <div className="flex items-center gap-1 text-slate-400 text-xs">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{usr.firm_name === 'All' ? 'All Branches' : `${firmStringToArray(usr.firm_name).join(', ')} Branch`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-slate-800/40">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">Page Access</span>
                    {usr.role === 'Admin' ? (
                      <span className="text-violet-400 flex items-center gap-1 text-[10px]">
                        <ShieldCheck className="w-3.5 h-3.5" /> Full Access
                      </span>
                    ) : (usr.page_access || []).length === 0 ? (
                      <span className="text-slate-600 italic text-[11px]">No pages assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(usr.page_access || []).map(p => {
                          const pg = ALL_PAGE_GROUPS.flatMap(g => g.pages).find(pg => pg.key === p);
                          return (
                            <span key={p} className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-medium">
                              {pg?.label || p}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          // { icon: ShieldCheck, color: 'text-violet-400', bg: 'bg-violet-950/20 border-violet-500/15', title: 'Admin', desc: 'Full access to all pages, all branches, and user management.' },
          // { icon: UserCheck, color: 'text-indigo-400', bg: 'bg-indigo-950/20 border-indigo-500/15', title: 'User', desc: 'Assigned branch data entry and reporting access.' },
          // { icon: Lock, color: 'text-slate-400', bg: 'bg-slate-900/40 border-slate-700/30', title: 'Viewer', desc: 'Viewer (View Only) access to assigned pages only.' },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${bg} text-xs`}>
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
            <div>
              <p className={`font-bold ${color}`}>{title}</p>
              <p className="text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── MODAL: ADD USER ──────────────────────────────────────────────── */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Create New User">
        <form onSubmit={handleCreate} className="space-y-5">
          {renderFormFields(false)}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button type="button" onClick={() => setAddOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer disabled:opacity-60">
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: EDIT USER ──────────────────────────────────────────────── */}
      <Modal isOpen={editOpen} onClose={() => { setEditOpen(false); setSelectedUser(null); }}
        title={`Edit User: ${selectedUser?.username}`}>
        <form onSubmit={handleUpdate} className="space-y-5">
          {renderFormFields(true)}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 text-xs">
            <button type="button" onClick={() => setEditOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 cursor-pointer disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: DELETE CONFIRM ────────────────────────────────────────── */}
      <Modal isOpen={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteTarget(null); }}
        title="Confirm Delete">
        <div className="space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-rose-950/20 border border-rose-500/15 text-xs text-rose-300">
            <Trash2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-200">Delete user permanently?</p>
              <p className="mt-1 text-rose-400">
                User <strong className="text-rose-200">"{deleteTarget?.username}"</strong> will be permanently removed from the system. This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 text-xs">
            <button onClick={() => { setDeleteOpen(false); setDeleteTarget(null); }}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-500 cursor-pointer disabled:opacity-60">
              {saving ? 'Deleting...' : 'Delete User'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default Settings;
