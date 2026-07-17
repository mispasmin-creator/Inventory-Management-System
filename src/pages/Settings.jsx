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
  History as HistoryIcon,
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
  {
    group: 'Stock Adjustment',
    icon: SlidersHorizontal,
    pages: [
      { key: 'StockAdjustment_Purab', label: 'Purab Branch' },
      { key: 'StockAdjustment_Pmmpl', label: 'Pmmpl Branch' },
      { key: 'StockAdjustment_Rkl', label: 'Rkl Branch' },
    ]
  },
  {
    group: 'Stock Adjustment Tabs',
    icon: Layers,
    pages: [
      { key: 'StockAdjustmentTab_Adjustments', label: 'Stock Adjustment Tab' },
      { key: 'StockAdjustmentTab_OpStock', label: 'OP. Stock Tab' },
      { key: 'StockAdjustmentTab_Products', label: 'Products Tab' },
    ]
  },
  { group: null, pages: [
    { key: 'Settings',  label: 'System Settings',  icon: Cog },
    { key: 'Dashboard', label: 'Dashboard',        icon: LayoutDashboard },
    { key: 'History',   label: 'Stock History',    icon: HistoryIcon },
  ]},
];

// Flat list of all keys for select-all
const ALL_PAGE_KEYS = ALL_PAGE_GROUPS.flatMap(g => g.pages.map(p => p.key));

// Group a user's raw page_access keys by category so "Purab Branch" etc. only
// ever appears once per group instead of being repeated for every group that
// happens to grant that branch (Raw Material / Finish Good / Stock Adjustment).
const groupPageAccessBadges = (pageAccess = []) => {
  const badges = [];
  ALL_PAGE_GROUPS.forEach(grp => {
    const matched = grp.pages.filter(pg => pageAccess.includes(pg.key));
    if (matched.length === 0) return;
    if (grp.group) {
      badges.push({
        key: grp.group,
        icon: grp.icon,
        label: `${grp.group}: ${matched.map(m => m.label.replace(' Branch', '')).join(', ')}`,
        tone: 'group',
      });
    } else {
      matched.forEach(pg => badges.push({ key: pg.key, icon: pg.icon, label: pg.label, tone: 'single' }));
    }
  });
  return badges;
};

const ROLES = ['Admin', 'User', 'Viewer'];
const BRANCH_OPTIONS = ['Purab', 'Pmmpl', 'Rkl'];
const normalizeBranchName = (value) => value === 'Madhya' ? 'Pmmpl' : value;
const normalizePageAccessKey = (key) => key
  ?.replace('RawMaterial_Madhya', 'RawMaterial_Pmmpl')
  .replace('FinishGood_Madhya', 'FinishGood_Pmmpl')
  .replace('StockAdjustment_Madhya', 'StockAdjustment_Pmmpl');

const normalizePageAccess = (pageAccess = []) => {
  const normalized = pageAccess.map(normalizePageAccessKey);
  if (!normalized.includes('StockAdjustment')) return normalized;

  return [
    ...normalized.filter(key => key !== 'StockAdjustment'),
    'StockAdjustment_Purab',
    'StockAdjustment_Pmmpl',
    'StockAdjustment_Rkl'
  ];
};

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
      page_access: normalizePageAccess(usr.page_access),
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
      Admin: 'bg-(--brand-green-soft) text-(--brand-green-dark) border-(--brand-green)/25',
      User: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30',
      Viewer: 'bg-(--surface-mid) text-(--ink-muted) border-(--line)',
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
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-0.5">
          Firm Name
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['All', ...BRANCH_OPTIONS].map(firm => {
            const isActive = form.firms.includes(firm);
            return (
              <label
                key={firm}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-xs select-none ${
                  isActive
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                    : 'bg-slate-900/30 border-slate-800/70 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleFirm(firm)}
                  className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                />
                <span className="font-medium">{firm === 'All' ? 'All Firms' : firm}</span>
              </label>
            );
          })}
        </div>
      </div>

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
        <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-(--brand-green-soft) border border-(--brand-green)/20 text-xs font-semibold text-(--brand-green-dark)">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          Admin role grants full access to all pages and all branches automatically.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 w-full p-1.5 animate-slide-up pb-12">

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-(--line) pb-5">
        <div>
          <h2 className="text-2xl font-black text-(--ink) tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-(--brand-green) dark:text-emerald-500" />
            <span>User Management</span>
          </h2>
          <p className="text-xs text-(--ink-muted) mt-1 font-medium">
            Create, edit, and manage system users, their roles, branch access, and page permissions.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-5 py-2.5 text-xs rounded-xl bg-linear-to-r from-green-600 to-emerald-700 hover:brightness-105 font-bold text-white shadow-md shadow-green-500/20 transition-all duration-200 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New User
          </button>
        )}
      </div>

      {/* Users Table */}
      <GlassCard className="p-5 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-(--ink-faint) text-sm gap-2">
            <Users className="w-8 h-8 opacity-30" />
            <span>No users found</span>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block max-h-[560px] overflow-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-(--line) bg-(--surface-mid)">
                    <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Username</th>
                    <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Role</th>
                    <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Firm / Branch</th>
                    <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Page Access</th>
                    <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Created</th>
                    {isAdmin && (
                      <th className="px-5 py-3.5 text-[10.5px] font-bold text-(--ink-muted) uppercase tracking-wider sticky top-0 bg-(--surface-mid) z-10">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--line-soft)">
                  {users.map(usr => (
                    <tr key={usr.id} className="hover:bg-(--brand-green-soft) transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-(--surface-mid) border border-(--line) flex items-center justify-center text-[10px] font-bold text-(--ink-muted) uppercase">
                            {usr.username.slice(0, 2)}
                          </div>
                          <span className="font-semibold text-(--ink) text-[13px]">{usr.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadge(usr.role)}`}>
                          {usr.role}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1.5 text-(--ink-muted) font-medium">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>{usr.firm_name === 'All' ? 'All Branches' : `${firmStringToArray(usr.firm_name).join(', ')} Branch`}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {usr.role === 'Admin' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold text-(--brand-green-dark) bg-(--brand-green-soft) border border-(--brand-green)/20">
                            <ShieldCheck className="w-3.5 h-3.5" /> Full Access
                          </span>
                        ) : (usr.page_access || []).length === 0 ? (
                          <span className="text-(--ink-faint) italic text-[11px]">No pages assigned</span>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {groupPageAccessBadges(usr.page_access).map(b => {
                              const Icon = b.icon;
                              return (
                                <span
                                  key={b.key}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold ${
                                    b.tone === 'group'
                                      ? 'bg-(--brand-green-soft) border-(--brand-green)/20 text-(--brand-green-dark)'
                                      : 'bg-(--surface-mid) border-(--line) text-(--ink-muted)'
                                  }`}
                                >
                                  {Icon && <Icon className="w-3 h-3 shrink-0" />}
                                  {b.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-(--ink-muted)">
                        {new Date(usr.created_at).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              onClick={() => openEdit(usr)}
                              className="p-2 rounded-lg bg-(--surface-mid) border border-(--line) text-(--ink-muted) hover:text-(--brand-green-dark) hover:border-(--brand-green)/30 hover:bg-(--brand-green-soft) transition-all cursor-pointer"
                              title="Edit user"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeleteTarget(usr); setDeleteOpen(true); }}
                              className="p-2 rounded-lg bg-(--surface-mid) border border-(--line) text-(--ink-muted) hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
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
            <div className="block md:hidden max-h-[560px] overflow-auto divide-y divide-(--line-soft)">
              {users.map(usr => (
                <div key={usr.id} className="p-4 space-y-3 hover:bg-(--brand-green-soft) transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-(--surface-mid) border border-(--line) flex items-center justify-center text-[10px] font-bold text-(--ink-muted) uppercase">
                        {usr.username.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-semibold text-(--ink) text-sm block">{usr.username}</span>
                        <span className="text-[10px] text-(--ink-faint)">{new Date(usr.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(usr)}
                          className="p-2 rounded-lg bg-(--surface-mid) border border-(--line) text-(--ink-muted) hover:text-(--brand-green-dark) hover:border-(--brand-green)/30 hover:bg-(--brand-green-soft) transition-all cursor-pointer"
                          title="Edit user"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(usr); setDeleteOpen(true); }}
                          className="p-2 rounded-lg bg-(--surface-mid) border border-(--line) text-(--ink-muted) hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-(--ink-faint) block">Role</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${roleBadge(usr.role)}`}>
                        {usr.role}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-(--ink-faint) block">Firm / Branch</span>
                      <div className="flex items-center gap-1 text-(--ink-muted) text-xs font-medium">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{usr.firm_name === 'All' ? 'All Branches' : `${firmStringToArray(usr.firm_name).join(', ')} Branch`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-(--line-soft)">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-(--ink-faint) block">Page Access</span>
                    {usr.role === 'Admin' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold text-(--brand-green-dark) bg-(--brand-green-soft) border border-(--brand-green)/20">
                        <ShieldCheck className="w-3.5 h-3.5" /> Full Access
                      </span>
                    ) : (usr.page_access || []).length === 0 ? (
                      <span className="text-(--ink-faint) italic text-[11px]">No pages assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {groupPageAccessBadges(usr.page_access).map(b => {
                          const Icon = b.icon;
                          return (
                            <span
                              key={b.key}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold ${
                                b.tone === 'group'
                                  ? 'bg-(--brand-green-soft) border-(--brand-green)/20 text-(--brand-green-dark)'
                                  : 'bg-(--surface-mid) border-(--line) text-(--ink-muted)'
                              }`}
                            >
                              {Icon && <Icon className="w-3 h-3 shrink-0" />}
                              {b.label}
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
