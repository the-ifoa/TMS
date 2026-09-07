import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineX, HiOutlineShieldCheck, HiOutlineOfficeBuilding, HiOutlineUsers, HiOutlineSearch,
  HiOutlineCheck,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import {
  getTeamCatalog, getTeamAirlines, getTeamMembers,
  createTeamMember, updateTeamMember, deleteTeamMember,
  getMemberParticipants, updateMemberParticipants,
} from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// Flatten { group: [{key,label}] } → [{key,label,group}]
const flatten = (groups) =>
  Object.entries(groups || {}).flatMap(([group, items]) =>
    items.map((i) => ({ ...i, group })));

function PermissionChecklist({ groups, value, onChange }) {
  const set = new Set(value);
  const toggle = (key) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange([...next]);
  };

  const allKeys = Object.values(groups || {}).flatMap((items) => items.map((i) => i.key));
  const isAllSelected = allKeys.length > 0 && allKeys.every((k) => set.has(k));

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(allKeys);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">Permissions & Powers</span>
        {allKeys.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
          >
            {isAllSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {Object.entries(groups || {}).map(([group, items]) => {
          if (!items || items.length === 0) return null;
          const groupKeys = items.map((i) => i.key);
          const allGroupSelected = groupKeys.every((k) => set.has(k));

          const toggleGroup = (e) => {
            e.stopPropagation();
            const next = new Set(set);
            if (allGroupSelected) {
              groupKeys.forEach((k) => next.delete(k));
            } else {
              groupKeys.forEach((k) => next.add(k));
            }
            onChange([...next]);
          };

          return (
            <div key={group} className="p-3 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {group}
                </span>
                <button
                  type="button"
                  onClick={toggleGroup}
                  className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {allGroupSelected ? 'None' : 'All'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {items.map((i) => {
                  const checked = set.has(i.key);
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => toggle(i.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-left transition-all cursor-pointer border ${checked
                          ? 'bg-white border-blue-300/90 text-blue-800 font-semibold shadow-2xs'
                          : 'bg-white/60 border-slate-200/70 text-slate-600 hover:bg-white hover:border-slate-300'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-colors border ${checked
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                        }`}>
                        {checked && <HiOutlineCheck className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate flex-1">{i.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { isAdmin } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();

  const [catalog, setCatalog] = useState({});      // { admin?: groups, airline: groups }
  const [airlines, setAirlines] = useState([]);      // admin only — parent picker
  const [members, setMembers] = useState({ subAdmins: [], departments: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);    // { mode:'create'|'edit', ... }
  const [partModal, setPartModal] = useState(null);  // { id, name, loading, rows[], checked:Set, orig:Set, search, saving }

  const load = async () => {
    setLoading(true);
    try {
      const reqs = [getTeamCatalog(), getTeamMembers()];
      if (isAdmin) reqs.push(getTeamAirlines());
      const [cat, mem, air] = await Promise.all(reqs);
      setCatalog(cat.data.catalog || {});
      setMembers(mem.data || { subAdmins: [], departments: [] });
      if (air) setAirlines(air.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allMembers = useMemo(
    () => [...(members.subAdmins || []), ...(members.departments || [])],
    [members],
  );

  const openCreate = (scope) => setModal({
    mode: 'create', scope,
    name: '', email: '', password: '',
    permissions: [], parentAirlineId: airlines[0]?._id || '', department_name: '',
  });
  const openEdit = (m) => setModal({
    mode: 'edit', id: m._id || m.id, scope: m.memberScope,
    name: m.name || '', email: m.email || '', password: '',
    permissions: m.permissions || [],
    account_status: m.account_status || 'active',
    department_name: m.department_name || '',
  });

  const save = async () => {
    const m = modal;
    if (!m.name.trim() || !m.email.trim() || (m.mode === 'create' && m.password.length < 6)) {
      toast.error('Name, email and a 6+ char password are required.');
      return;
    }
    try {
      if (m.mode === 'create') {
        await createTeamMember({
          scope: m.scope,
          name: m.name.trim(), email: m.email.trim(), password: m.password,
          permissions: m.permissions,
          parentAirlineId: m.scope === 'airline' && isAdmin ? m.parentAirlineId : undefined,
          department_name: m.scope === 'airline' ? m.department_name.trim() : undefined,
        });
        toast.success('User created');
      } else {
        await updateTeamMember(m.id, {
          name: m.name.trim(),
          password: m.password || undefined,
          permissions: m.permissions,
          account_status: m.account_status,
          department_name: m.scope === 'airline' ? m.department_name.trim() : undefined,
        });
        toast.success('User updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    }
  };

  const remove = async (m) => {
    if (!(await confirm(`Remove "${m.name}"? They will lose access immediately.`, {
      title: 'Remove user', confirmLabel: 'Remove',
    }))) return;
    try {
      await deleteTeamMember(m._id || m.id);
      toast.success('User removed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  // ── Participant assignment ──────────────────────────────────────────────────
  const openParticipants = async (m) => {
    const id = m._id || m.id;
    setPartModal({ id, name: m.department_name || m.name, loading: true, rows: [], checked: new Set(), orig: new Set(), search: '', saving: false });
    try {
      const res = await getMemberParticipants(id);
      const assigned = res.data.assigned || [];
      const available = res.data.available || [];
      const rows = [...assigned.map(p => ({ ...p, was: true })), ...available.map(p => ({ ...p, was: false }))];
      const checked = new Set(assigned.map(p => p.id));
      setPartModal(pm => pm && pm.id === id
        ? { ...pm, loading: false, rows, checked, orig: new Set(checked) }
        : pm);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load participants');
      setPartModal(null);
    }
  };
  const togglePart = (pid) => setPartModal(pm => {
    const checked = new Set(pm.checked);
    checked.has(pid) ? checked.delete(pid) : checked.add(pid);
    return { ...pm, checked };
  });
  const savePart = async () => {
    const pm = partModal;
    const assign = [...pm.checked].filter(id => !pm.orig.has(id));
    const unassign = [...pm.orig].filter(id => !pm.checked.has(id));
    if (!assign.length && !unassign.length) { setPartModal(null); return; }
    setPartModal(x => ({ ...x, saving: true }));
    try {
      await updateMemberParticipants(pm.id, { assign, unassign });
      toast.success('Participants updated');
      setPartModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
      setPartModal(x => ({ ...x, saving: false }));
    }
  };

  const toggleStatus = async (m) => {
    try {
      await updateTeamMember(m._id || m.id, {
        account_status: m.account_status === 'disabled' ? 'active' : 'disabled',
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const modalGroups = modal ? (catalog[modal.scope] || {}) : {};
  const permLabels = useMemo(() => {
    const all = [...flatten(catalog.admin), ...flatten(catalog.airline)];
    return Object.fromEntries(all.map((i) => [i.key, i.label]));
  }, [catalog]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col">
      {/* Header */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-primary-800 tracking-tight flex items-center gap-2">
            <HiOutlineUserGroup className="w-5 h-5 text-accent-500" />
            {isAdmin ? 'Sub-admins & Sub-departments' : 'Departments'}
          </h1>
          <p className="text-xs text-primary-400 mt-0.5 hidden sm:block">
            {isAdmin
              ? 'Create sub-admins (restricted admin logins) and sub-departments (airline department accounts), and grant each one specific powers.'
              : 'Create department logins for your airline and choose exactly what each department can do.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => openCreate('admin')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
            >
              <HiOutlineShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
              <span>New sub-admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openCreate('airline')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <FaPlaneDeparture className="w-3.5 h-3.5 shrink-0 text-slate-300" />
            <span>{isAdmin ? 'New sub-department' : 'New department'}</span>
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-4">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : allMembers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 py-16 text-center text-sm text-slate-400 font-medium">
            No sub-users yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {allMembers.map((m) => {
              const isAdminScope = m.memberScope === 'admin';
              const isDisabled = m.account_status === 'disabled';
              const perms = m.permissions || [];

              return (
                <div
                  key={m._id || m.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 p-5 flex flex-col justify-between gap-4 shadow-2xs hover:shadow-md ${isDisabled ? 'border-slate-200/60 opacity-80' : 'border-slate-200/90'
                    }`}
                >
                  {/* Card Header & Identity */}
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs ${isAdminScope
                            ? 'bg-violet-50 text-violet-600 border border-violet-100'
                            : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                          {isAdminScope
                            ? <HiOutlineShieldCheck className="w-5 h-5" />
                            : <FaPlaneDeparture className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900 truncate">{m.name}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isAdminScope
                                ? 'bg-violet-50 text-violet-700 border-violet-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                              {isAdminScope ? 'ADMIN' : (m.department_name || 'DEPARTMENT')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{m.email}</p>
                        </div>
                      </div>

                      {/* Status indicator badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${isDisabled
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                        {isDisabled ? 'DISABLED' : 'ACTIVE'}
                      </span>
                    </div>

                    {/* Permissions List */}
                    <div className="pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Permissions ({perms.length})
                        </span>
                      </div>
                      {perms.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No powers granted</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                          {perms.map((p) => (
                            <span
                              key={p}
                              className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200/80"
                            >
                              {permLabels[p] || p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                    <div>
                      {m.memberScope === 'airline' && (
                        <button
                          type="button"
                          onClick={() => openParticipants(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50/80 border border-blue-200/80 text-blue-700 hover:bg-blue-100/80 transition-colors cursor-pointer shadow-2xs"
                        >
                          <HiOutlineUsers className="w-3.5 h-3.5" />
                          <span>Participants</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => toggleStatus(m)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer shadow-2xs ${isDisabled
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        {isDisabled ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        title="Edit member"
                        className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all cursor-pointer shadow-2xs"
                      >
                        <HiOutlinePencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        title="Remove member"
                        className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-all cursor-pointer shadow-2xs"
                      >
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${modal.scope === 'admin' ? 'bg-violet-50 text-violet-600 border border-violet-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                  {modal.scope === 'admin' ? <HiOutlineShieldCheck className="w-5 h-5" /> : <FaPlaneDeparture className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
                    {modal.mode === 'create'
                      ? (modal.scope === 'admin' ? 'New sub-admin' : (isAdmin ? 'New sub-department' : 'New department'))
                      : `Edit ${modal.name}`}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    {modal.scope === 'admin' ? 'Administrative user privileges' : 'Department account and power delegation'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Full Name</span>
                  <input
                    value={modal.name}
                    onChange={(e) => setModal({ ...modal, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Email Address</span>
                  <input
                    value={modal.email}
                    disabled={modal.mode === 'edit'}
                    onChange={(e) => setModal({ ...modal, email: e.target.value })}
                    placeholder="name@company.com"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
                  />
                </label>
              </div>

              {modal.scope === 'airline' && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Department Name</span>
                  <input
                    value={modal.department_name}
                    onChange={(e) => setModal({ ...modal, department_name: e.target.value })}
                    placeholder="e.g. Flight Dispatch"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
                  />
                </label>
              )}

              {modal.mode === 'create' && modal.scope === 'airline' && isAdmin && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Parent Airline</span>
                  <Select
                    value={modal.parentAirlineId || undefined}
                    onValueChange={(val) => setModal({ ...modal, parentAirlineId: val })}
                  >
                    <SelectTrigger className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium text-slate-800 bg-white shadow-2xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer">
                      <SelectValue placeholder="Select parent airline…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border border-slate-200 shadow-xl bg-white max-h-64 p-1.5 z-[60]">
                      {airlines.map((a) => (
                        <SelectItem
                          key={a._id}
                          value={a._id}
                          className="rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer focus:bg-blue-50 focus:text-blue-900"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{a.airlineName}</span>
                            <span className="text-slate-400 text-xs">— {a.email}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  {modal.mode === 'create' ? 'Password' : 'New password (leave blank to keep)'}
                </span>
                <input
                  type="password"
                  value={modal.password}
                  onChange={(e) => setModal({ ...modal, password: e.target.value })}
                  placeholder={modal.mode === 'create' ? '••••••••' : 'Leave empty to keep current password'}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
                />
              </label>

              {modal.mode === 'edit' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Account Access</p>
                    <p className="text-[11px] text-slate-400">Block or allow this user to log into the platform</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModal({ ...modal, account_status: modal.account_status === 'disabled' ? 'active' : 'disabled' })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${modal.account_status === 'disabled'
                        ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                      }`}
                  >
                    {modal.account_status === 'disabled' ? 'Disabled (Blocked)' : 'Active (Allowed)'}
                  </button>
                </div>
              )}

              <div className="pt-2">
                <PermissionChecklist
                  groups={modalGroups}
                  value={modal.permissions}
                  onChange={(permissions) => setModal({ ...modal, permissions })}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              >
                {modal.mode === 'create' ? 'Create user' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Participant assignment modal */}
      {partModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPartModal(null); }}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-800">Participants — {partModal.name}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ticked participants are moved into this department and only it sees them. Unticked ones go back to the main airline list.
                </p>
              </div>
              <button onClick={() => setPartModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pt-3">
              <div className="relative">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={partModal.search}
                  onChange={(e) => setPartModal(pm => ({ ...pm, search: e.target.value }))}
                  placeholder="Search participants…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {partModal.loading ? (
                <div className="py-12 flex items-center justify-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : partModal.rows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No participants in the main airline list yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {partModal.rows
                    .filter(p => {
                      const q = partModal.search.trim().toLowerCase();
                      return !q || [p.participant_name, p.department, p.training_type]
                        .some(s => (s || '').toLowerCase().includes(q));
                    })
                    .map(p => (
                      <label key={p.id}
                        className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer text-sm">
                        <input type="checkbox" className="accent-blue-600"
                          checked={partModal.checked.has(p.id)} onChange={() => togglePart(p.id)} />
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold text-slate-800 block truncate">{p.participant_name || '—'}</span>
                          <span className="text-[11px] text-slate-400">
                            {p.department || '—'}{p.training_type ? ` · ${p.training_type}` : ''}
                          </span>
                        </span>
                        {p.was && !partModal.checked.has(p.id) && (
                          <span className="text-[10px] font-semibold text-amber-600">→ back to main</span>
                        )}
                        {!p.was && partModal.checked.has(p.id) && (
                          <span className="text-[10px] font-semibold text-blue-600">→ assign</span>
                        )}
                      </label>
                    ))}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">{partModal.checked.size} assigned</span>
              <div className="flex gap-2">
                <button onClick={() => setPartModal(null)}
                  className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={savePart} disabled={partModal.saving || partModal.loading}
                  className="px-3.5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                  {partModal.saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </motion.div>
  );
}
