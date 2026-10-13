import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineX, HiOutlineShieldCheck, HiOutlineOfficeBuilding, HiOutlineUsers,
  HiOutlineCheck, HiOutlineEye, HiOutlineEyeOff,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import InfoButton from '../components/InfoButton';
import { ShieldCheck, Building2, Users, CheckCircle2, Sliders, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getTeamCatalog, getTeamAirlines, getTeamMembers,
  createTeamMember, updateTeamMember, deleteTeamMember,
} from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const DEFAULT_PERM_LABELS = {
  'participants.view': 'View Participants',
  'participants.add': 'Add Participants',
  'participants.edit': 'Edit Participants',
  'participants.delete': 'Delete Participants',
  'exams.manage': 'Create & Edit Exams',
  'exams.assign': 'Assign Exams',
  'exams.grade': 'Grade Exam Attempts',
  'attendance.view': 'View Attendance',
  'attendance.manage': 'Manage Attendance',
  'attendance.checklist': 'Attendance Checklist',
  'airline.manage': 'Manage Airline Details',
  'certificates.view': 'View Certificates',
  'certificates.release': 'Release Certificates',
  'analytics.view': 'View Analytics',
};

const formatPermLabel = (key, customLabels = {}) => {
  if (customLabels[key]) return customLabels[key];
  if (DEFAULT_PERM_LABELS[key]) return DEFAULT_PERM_LABELS[key];
  const parts = key.split('.');
  if (parts.length === 2) {
    const [domain, action] = parts;
    const cleanAction = action.charAt(0).toUpperCase() + action.slice(1);
    const cleanDomain = domain.charAt(0).toUpperCase() + domain.slice(1);
    return `${cleanAction} ${cleanDomain}`;
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

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
  const selectedCount = allKeys.filter((k) => set.has(k)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-semibold text-slate-900">
          Permissions
          <span className="ml-2 font-medium text-slate-500">{selectedCount} of {allKeys.length} selected</span>
        </h3>
        {allKeys.length > 0 && (
          <button type="button" onClick={() => onChange(isAllSelected ? [] : allKeys)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer">
            {isAllSelected ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>

      {/* One bordered block per area; the dialog body scrolls, not this list */}
      <div className="space-y-3">
        {Object.entries(groups || {}).map(([group, items]) => {
          if (!items || items.length === 0) return null;
          const groupKeys = items.map((i) => i.key);
          const groupOn = groupKeys.filter((k) => set.has(k)).length;
          const allGroupSelected = groupOn === groupKeys.length;
          const toggleGroup = () => {
            const next = new Set(set);
            groupKeys.forEach((k) => (allGroupSelected ? next.delete(k) : next.add(k)));
            onChange([...next]);
          };

          return (
            <div key={group} className="rounded-xl border border-slate-200/80 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-slate-50/80 border-b border-slate-100">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {group}
                  <span className="ml-2 normal-case tracking-normal font-medium text-slate-400">{groupOn}/{groupKeys.length}</span>
                </span>
                <button type="button" onClick={toggleGroup}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer">
                  {allGroupSelected ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {items.map((i) => {
                  const checked = set.has(i.key);
                  return (
                    <button key={i.key} type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(i.key)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors cursor-pointer hover:bg-blue-50/50">
                      <span className={`w-4 h-4 rounded-[5px] flex items-center justify-center flex-shrink-0 border transition-colors ${
                        checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {checked && <HiOutlineCheck className="w-3 h-3 stroke-[3]" />}
                      </span>
                      <span className={`text-[13px] truncate ${checked ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{i.label}</span>
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
  const [showPassword, setShowPassword] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

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

  const openCreate = (scope) => {
    setShowPassword(false);
    setModal({
      mode: 'create', scope,
      name: '', email: '', password: '',
      permissions: [], parentAirlineId: airlines[0]?._id || '', department_name: '',
    });
  };
  const openEdit = (m) => {
    setShowPassword(false);
    setModal({
      mode: 'edit', id: m._id || m.id, scope: m.memberScope,
      name: m.name || '', email: m.email || '', password: '',
      permissions: m.permissions || [],
      account_status: m.account_status || 'active',
      department_name: m.department_name || '',
      parentAirlineId: m.parent_airline ? String(m.parent_airline) : '',
    });
  };

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

  // Admin-gated keys (internal certificates / assessments) are only grantable to a department whose parent
  // airline has the admin switch on. (An airline caller's catalog is already
  // filtered server-side; this covers an admin picking the parent.)
  const modalGroups = useMemo(() => {
    const groups = modal ? (catalog[modal.scope] || {}) : {};
    if (!modal || modal.scope !== 'airline' || !isAdmin) return groups;
    const parent = airlines.find((a) => String(a._id) === String(modal.parentAirlineId));
    const gated = { 'internalCerts.manage': 'can_upload_internal_certs', 'internalAssessments.manage': 'can_manage_internal_assessments' };
    return Object.fromEntries(
      Object.entries(groups)
        .map(([g, items]) => [g, items.filter((i) => !gated[i.key] || parent?.[gated[i.key]])])
        .filter(([, items]) => items.length),
    );
  }, [modal, catalog, airlines, isAdmin]);
  const permLabels = useMemo(() => {
    const all = [...flatten(catalog.admin), ...flatten(catalog.airline)];
    return Object.fromEntries(all.map((i) => [i.key, i.label]));
  }, [catalog]);

  // "How it works" popup content, by who is reading it.
  const disable = <><strong>Disable</strong> pauses the login straight away and keeps its permissions and participant list. <strong>Remove</strong> deletes the account and everything it owns for good.</>;
  const INFO = isAdmin ? {
    title: 'How sub-users work',
    subtitle: 'Roles, permissions and who sees which participants',
    intro: 'Hand out parts of the work without sharing the main admin login. Each sub-user gets its own email and password, and only the powers you tick.',
    roles: [
      { name: 'Sub-admin', scope: 'All airlines', icon: ShieldCheck, text: <>Works across <strong>every airline</strong>, limited to the admin powers you enable. For example an auditor who can only view, or someone who only issues certificates.</> },
      { name: 'Sub-department', scope: 'One airline', icon: Building2, text: <>Belongs to <strong>one parent airline</strong>. Keeps its own participant list and holds only the airline powers you grant.</> },
    ],
    points: [
      { icon: CheckCircle2, title: 'Permissions are a checklist', text: <>Powers are grouped by area (participants, exams, certificates). Tick them one by one or use <strong>Select all</strong>. Each card shows how many are active.</> },
      { icon: Users, title: 'Each department has its own list', text: <>A sub-department builds its <strong>own team roster</strong> on its My Team page. Those records are never shared with, or moved from, the main airline list.</> },
      { icon: Sliders, title: 'Disable or remove', text: disable },
    ],
    steps: [
      { title: 'Choose the type', text: 'Click New sub-admin or New sub-department.' },
      { title: 'Set permissions', text: 'Tick the powers this account should have.' },
      { title: 'Hand over the login', text: 'They sign in and start work; a department adds its people on My Team.' },
    ],
  } : {
    title: 'How departments work',
    subtitle: 'Separate logins for teams inside your airline',
    intro: 'Create a login for each team (for example Flight Dispatch or Cabin Crew) so it can manage its own people without using your main account.',
    roles: [
      { name: 'Department login', scope: 'Your airline only', icon: Building2, text: <>Signs in with its own email and password. It sees only your airline, and can do only what you tick when you create it.</> },
    ],
    points: [
      { icon: CheckCircle2, title: 'Permissions are a checklist', text: <>Powers are grouped by area (participants, exams, certificates). Each department card shows how many are active.</> },
      { icon: Users, title: 'Each department has its own list', text: <>A department builds its <strong>own team roster</strong> on its My Team page. It is separate from your main list and from other departments.</> },
      { icon: Sliders, title: 'Disable or remove', text: disable },
    ],
    steps: [
      { title: 'Create the department', text: 'Enter its name, email and password.' },
      { title: 'Set permissions', text: 'Tick the powers it should have.' },
      { title: 'Hand over the login', text: 'The department signs in and adds its people on My Team.' },
    ],
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col">
      {/* Header */}
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-primary-800 tracking-tight flex flex-wrap items-center gap-x-2 gap-y-1">
            <HiOutlineUserGroup className="w-5 h-5 text-accent-500" />
            {isAdmin ? 'Sub-admins & Sub-departments' : 'Departments'}
            <InfoButton onClick={() => setInfoOpen(true)} active={infoOpen} />
          </h1>
          <p className="text-xs text-primary-400 mt-0.5 hidden sm:block">
            {isAdmin
              ? 'Create sub-admins (restricted admin logins) and sub-departments (airline department accounts), and grant each one specific powers.'
              : 'Create department logins for your airline and choose exactly what each department can do.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap [&>button]:whitespace-nowrap">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {allMembers.map((m) => {
              const isAdminScope = m.memberScope === 'admin';
              const isDisabled = m.account_status === 'disabled';
              const perms = m.permissions || [];

              const MAX_CHIPS = 5;
              const shown = perms.slice(0, MAX_CHIPS);
              const extra = perms.slice(MAX_CHIPS);

              return (
                <div
                  key={m._id || m.id}
                  className={`group p-5 sm:p-6 bg-white border rounded-3xl shadow-2xs transition-all duration-200 flex flex-col justify-between ${
                    isDisabled ? 'border-slate-200/70 bg-slate-50/60' : 'border-slate-200/90 hover:shadow-lg hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Header: icon, name, status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs mt-0.5 transition-transform group-hover:scale-105 ${
                          isDisabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white'
                        }`}>
                          {isAdminScope ? <HiOutlineShieldCheck className="w-5 h-5" /> : <FaPlaneDeparture className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className={`text-sm sm:text-base font-extrabold break-words leading-snug ${isDisabled ? 'text-slate-500' : 'text-slate-900'}`} title={m.name}>
                            {m.name}
                          </h3>
                          <p className="text-[11px] font-medium text-slate-400 mt-1 truncate" title={m.email}>{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${
                          isDisabled ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isDisabled ? 'Disabled' : 'Active'}
                        </span>
                        <button type="button" onClick={() => remove(m)} title="Remove"
                          className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer">
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Info tiles */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60 min-w-0"
                        title={isAdminScope ? 'Sub-admin' : m.department_name || 'Department'}>
                        {isAdminScope
                          ? <HiOutlineShieldCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          : <HiOutlineUsers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                        <span className="truncate">{isAdminScope ? 'Sub-admin' : m.department_name || 'Department'}</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60 min-w-0">
                        <HiOutlineCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{perms.length} Permission{perms.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>

                    {/* Permissions — fixed height so every card lines up */}
                    <div className="min-h-[3.75rem]">
                      {perms.length === 0 ? (
                        <p className="text-xs italic text-slate-300">No permissions assigned</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((p) => (
                            <span key={p} className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg">
                              {formatPermLabel(p, permLabels)}
                            </span>
                          ))}
                          {extra.length > 0 && (
                            <span className="text-[11px] font-semibold text-slate-500 px-2 py-0.5 rounded-lg border border-dashed border-slate-200 cursor-help"
                              title={extra.map((p) => formatPermLabel(p, permLabels)).join('\n')}>
                              +{extra.length} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3.5 mt-3.5 border-t border-slate-100/90 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openEdit(m)}
                      className="w-full h-8 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer">
                      <HiOutlinePencil className="w-3.5 h-3.5 text-slate-400" /> Edit
                    </button>
                    <button type="button" onClick={() => toggleStatus(m)}
                      className={`w-full h-8 inline-flex items-center justify-center gap-1 rounded-xl border text-xs font-bold shadow-2xs transition-colors cursor-pointer ${
                        isDisabled
                          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}>
                      {isDisabled ? 'Enable' : 'Disable'}
                    </button>
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
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-900 text-white">
                  {modal.scope === 'admin' ? <HiOutlineShieldCheck className="w-4.5 h-4.5" /> : <FaPlaneDeparture className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
                    {modal.mode === 'create'
                      ? (modal.scope === 'admin' ? 'New sub-admin' : (isAdmin ? 'New sub-department' : 'New department'))
                      : `Edit ${modal.name}`}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {modal.scope === 'admin' ? 'Sign-in details and admin powers' : 'Sign-in details and what this department may do'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setModal(null)} title="Close"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Body: account details, then status, then permissions */}
            <div className="px-6 py-5 space-y-6 overflow-y-auto">
              <section>
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">Account details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-1">Full name</span>
                    <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })}
                      placeholder="e.g. John Doe" className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors" />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-1">Email address</span>
                    <input value={modal.email} disabled={modal.mode === 'edit'}
                      onChange={(e) => setModal({ ...modal, email: e.target.value })}
                      placeholder="name@company.com"
                      title={modal.mode === 'edit' ? 'The sign-in email cannot be changed here' : undefined}
                      className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:bg-slate-50 disabled:text-slate-500" />
                  </label>

                  {modal.scope === 'airline' && (
                    <label className="block sm:col-span-2">
                      <span className="block text-xs font-medium text-slate-600 mb-1">Department name</span>
                      <input value={modal.department_name} onChange={(e) => setModal({ ...modal, department_name: e.target.value })}
                        placeholder="e.g. Flight Dispatch" className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors" />
                    </label>
                  )}

                  {modal.mode === 'create' && modal.scope === 'airline' && isAdmin && (
                    <div className="sm:col-span-2">
                      <span className="block text-xs font-medium text-slate-600 mb-1">Parent airline</span>
                      <Select value={modal.parentAirlineId || undefined} onValueChange={(val) => setModal({ ...modal, parentAirlineId: val })}>
                        <SelectTrigger className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 bg-white">
                          <SelectValue placeholder="Select parent airline…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64 z-[60]">
                          {airlines.map((a) => (
                            <SelectItem key={a._id} value={a._id}>
                              <span className="font-semibold text-slate-900">{a.airlineName}</span>
                              <span className="text-slate-400 text-xs"> · {a.email}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <label className="block sm:col-span-2">
                    <span className="block text-xs font-medium text-slate-600 mb-1">
                      {modal.mode === 'create' ? 'Password' : 'New password'}
                      {modal.mode === 'edit' && <span className="font-normal text-slate-400"> (leave blank to keep the current one)</span>}
                    </span>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={modal.password}
                        onChange={(e) => setModal({ ...modal, password: e.target.value })}
                        placeholder={modal.mode === 'create' ? 'At least 6 characters' : 'Unchanged'}
                        className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors pr-10" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors">
                        {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              </section>

              {modal.mode === 'edit' && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-900 mb-2.5">Sign-in</h3>
                  <div className="rounded-xl border border-slate-200/80 px-3.5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {modal.account_status === 'disabled' ? 'Sign-in is blocked' : 'Sign-in is allowed'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {modal.account_status === 'disabled'
                          ? 'This account cannot log in. Its data and permissions are kept.'
                          : 'Turn off to block this account from logging in without deleting it.'}
                      </p>
                    </div>
                    <button type="button" role="switch" aria-checked={modal.account_status !== 'disabled'}
                      aria-label="Allow sign-in"
                      onClick={() => setModal({ ...modal, account_status: modal.account_status === 'disabled' ? 'active' : 'disabled' })}
                      className={`w-10 h-6 inline-flex items-center rounded-full p-0.5 flex-shrink-0 transition-colors cursor-pointer ${
                        modal.account_status === 'disabled' ? 'bg-slate-200' : 'bg-blue-600'
                      }`}>
                      <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${modal.account_status === 'disabled' ? '' : 'translate-x-4'}`} />
                    </button>
                  </div>
                </section>
              )}

              <PermissionChecklist
                groups={modalGroups}
                value={modal.permissions}
                onChange={(permissions) => setModal({ ...modal, permissions })}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={save}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer">
                {modal.mode === 'create' ? 'Create user' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* "How it works" info modal */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setInfoOpen(false); }}>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200/80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-900 text-white">
                  <Info className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 leading-tight tracking-tight">{INFO.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{INFO.subtitle}</p>
                </div>
              </div>
              <button type="button" onClick={() => setInfoOpen(false)} title="Close"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Body: three numbered-free sections, one neutral palette */}
            <div className="px-6 py-5 space-y-6 overflow-y-auto">
              <p className="text-sm text-slate-600 leading-relaxed">{INFO.intro}</p>

              {/* Account types */}
              <section>
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">{INFO.roles.length > 1 ? 'Account types' : 'What a department gets'}</h3>
                <div className={`grid grid-cols-1 gap-3 ${INFO.roles.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                  {INFO.roles.map((r) => (
                    <div key={r.name} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0">
                            <r.icon className="w-4 h-4" />
                          </span>
                          <span className="text-sm font-semibold text-slate-900 truncate">{r.name}</span>
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 flex-shrink-0">{r.scope}</span>
                      </div>
                      <p className="mt-2.5 text-[13px] text-slate-600 leading-relaxed">{r.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* How it works */}
              <section>
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">How it works</h3>
                <ul className="rounded-xl border border-slate-200/80 divide-y divide-slate-100">
                  {INFO.points.map((pt) => (
                    <li key={pt.title} className="flex items-start gap-3 p-4">
                      <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                        <pt.icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{pt.title}</p>
                        <p className="mt-0.5 text-[13px] text-slate-600 leading-relaxed">{pt.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Setup */}
              <section>
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">Set up in three steps</h3>
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {INFO.steps.map((st, i) => (
                    <li key={st.title} className="rounded-xl border border-slate-200/80 p-3.5">
                      <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{st.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{st.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200/80 flex items-center justify-end">
              <button type="button" onClick={() => setInfoOpen(false)}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </motion.div>
  );
}
