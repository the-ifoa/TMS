import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineSearch } from 'react-icons/hi';
import { GraduationCap, Users2, FileText, Mail, Settings2 } from 'lucide-react';
import LogoAvatar from './LogoAvatar';
import { getAirlineSettings, bulkUpdateAirlineSettings } from '../api';

// Admin-granted feature flags on a top-level airline. Same keys the per-airline
// Edit modal toggles — this dialog manages them for every airline at once.
const SETTINGS = [
  { key: 'can_author_exams', label: 'Manage exams', hint: 'Build exams and email them to its own students', icon: GraduationCap, color: 'text-blue-600' },
  { key: 'can_create_subusers', label: 'Sub-users', hint: 'Create department logins', icon: Users2, color: 'text-purple-600' },
  { key: 'can_upload_internal_certs', label: 'Internal certs', hint: "Upload the airline's own certificate PDFs", icon: FileText, color: 'text-emerald-600' },
  { key: 'email_use_airline_logo', label: 'Logo in emails', hint: "Airline's logo instead of IFOA's in outgoing emails", icon: Mail, color: 'text-sky-600' },
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function Switch({ checked, onChange, indeterminate = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 inline-flex items-center rounded-full p-0.5 flex-shrink-0 transition-colors duration-200 ${
        checked ? 'bg-blue-600' : indeterminate ? 'bg-blue-300' : 'bg-slate-200'
      }`}
    >
      <span className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
        checked ? 'translate-x-4' : indeterminate ? 'translate-x-2' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default function AirlineSettingsDialog({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState({}); // id → airline as loaded
  const [rows, setRows] = useState([]);          // editable copies
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    getAirlineSettings()
      .then((res) => {
        const list = res.data.airlines || [];
        setOriginal(Object.fromEntries(list.map((a) => [a._id, a])));
        setRows(list.map((a) => ({ ...a })));
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load airline settings'))
      .finally(() => setLoading(false));
  }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.airlineName?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q));
  }, [rows, search]);
  const visibleIds = useMemo(() => new Set(visible.map((r) => r._id)), [visible]);

  const changed = useMemo(() => rows
    .map((r) => {
      const diff = {};
      SETTINGS.forEach(({ key }) => { if (r[key] !== original[r._id]?.[key]) diff[key] = r[key]; });
      return Object.keys(diff).length ? { id: r._id, ...diff } : null;
    })
    .filter(Boolean), [rows, original]);

  const setOne = (id, key, val) => setRows((prev) => prev.map((r) => (r._id === id ? { ...r, [key]: val } : r)));
  // Column-wide toggle acts on the airlines currently shown (respects search).
  const setColumn = (key, val) => setRows((prev) => prev.map((r) => (visibleIds.has(r._id) ? { ...r, [key]: val } : r)));
  const columnState = (key) => {
    const on = visible.filter((r) => r[key]).length;
    return { all: visible.length > 0 && on === visible.length, some: on > 0 && on < visible.length, on };
  };

  const save = async () => {
    if (!changed.length) { onClose(); return; }
    setSaving(true);
    try {
      await bulkUpdateAirlineSettings(changed);
      toast.success(`Settings saved for ${changed.length} airline${changed.length === 1 ? '' : 's'}`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (saving) return;
    if (changed.length && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-slate-900/60 pointer-events-none"
          />
          <div key="layout" className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={requestClose}>
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/80"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                    <Settings2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">Airline Settings</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Manage feature access for every airline at once. Departments follow their main airline.</p>
                  </div>
                </div>
                <button onClick={requestClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search airlines…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto min-h-0">
                {loading ? (
                  <div className="p-10 text-center text-sm text-slate-400">Loading airlines…</div>
                ) : visible.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-400">No airlines found.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgb(241_245_249)]">
                      <tr>
                        <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Airline</th>
                        {SETTINGS.map(({ key, label, hint, icon: Icon, color }) => {
                          const st = columnState(key);
                          return (
                            <th key={key} className="px-3 py-3 text-center align-top min-w-[120px]" title={hint}>
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                  <Icon className={`w-3.5 h-3.5 ${color}`} />{label}
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                                  <Switch checked={st.all} indeterminate={st.some} onChange={(v) => setColumn(key, v)} label={`${label}: all airlines`} />
                                  All ({st.on}/{visible.length})
                                </span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => {
                        const dirty = SETTINGS.some(({ key }) => a[key] !== original[a._id]?.[key]);
                        return (
                          <tr key={a._id} className={`border-t border-slate-100 ${dirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <LogoAvatar logoUrl={a.logo_url} name={a.airlineName} initials={initials(a.airlineName)} size="w-9 h-9" textSize="text-xs" />
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 truncate">
                                    {a.airlineName}
                                    {dirty && <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase">Edited</span>}
                                  </p>
                                  <p className="text-xs text-slate-500 truncate">
                                    {a.email}
                                    {a.department_count > 0 && <span className="text-slate-400"> · {a.department_count} dept{a.department_count === 1 ? '' : 's'}</span>}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {SETTINGS.map(({ key, label }) => (
                              <td key={key} className="px-3 py-3 text-center">
                                <Switch checked={!!a[key]} onChange={(v) => setOne(a._id, key, v)} label={`${label}: ${a.airlineName}`} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                <span className="text-xs font-medium text-slate-500">
                  {changed.length ? `${changed.length} airline${changed.length === 1 ? '' : 's'} changed` : 'No changes'}
                </span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={requestClose} disabled={saving}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 font-medium text-xs sm:text-sm transition-all shadow-2xs">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={saving || loading || !changed.length}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
