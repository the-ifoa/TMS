import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineUsers, HiOutlineSearch, HiOutlinePlus, HiOutlineMail,
  HiOutlinePencil, HiOutlineTrash, HiOutlineCheck, HiOutlineX, HiOutlineChartBar,
} from 'react-icons/hi';
import { getParticipants, createCandidate, updateParticipant, deleteParticipant } from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';

function initials(name) {
  return (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0].toUpperCase()).join('') || '?';
}

export default function MyTeam() {
  const { can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const canCreate = !can || can('participants.create');
  const canEdit = !can || can('participants.edit');
  const canDelete = !can || can('participants.delete');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const [edit, setEdit] = useState(null); // { id, first_name, last_name, email }
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getParticipants();
      setRows(res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.participant_name || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q));
  }, [rows, search]);

  const add = async (e) => {
    e.preventDefault();
    const first_name = form.first_name.trim();
    const last_name = form.last_name.trim();
    const email = form.email.trim();
    if (!first_name) { toast.error('Enter a first name'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Enter a valid email'); return; }
    setSaving(true);
    try {
      const res = await createCandidate({ first_name, last_name, email });
      setRows((prev) => [res.data, ...prev]);
      setForm({ first_name: '', last_name: '', email: '' });
      toast.success('Candidate added');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    const id = edit.id;
    const first_name = edit.first_name.trim();
    const last_name = edit.last_name.trim();
    const email = edit.email.trim();
    if (!first_name) { toast.error('First name cannot be empty'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Enter a valid email'); return; }
    setBusyId(id);
    try {
      const res = await updateParticipant(id, { first_name, last_name, email });
      setRows((prev) => prev.map((r) => (r.id || r._id) === id ? { ...r, ...res.data } : r));
      setEdit(null);
      toast.success('Saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r) => {
    const id = r.id || r._id;
    if (!(await confirm(`Remove ${r.participant_name || 'this candidate'} from your team?`, {
      title: 'Remove candidate', confirmLabel: 'Remove',
    }))) return;
    setBusyId(id);
    try {
      await deleteParticipant(id);
      setRows((prev) => prev.filter((x) => (x.id || x._id) !== id));
      toast.success('Removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
              <HiOutlineUsers className="w-4 h-4" />
            </div>
            <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none">My Team</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
              {rows.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Add the people in your department — name and email. Used to invite them to exams.</p>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Add form */}
        {canCreate && (
          <form onSubmit={add}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">First name *</label>
              <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="e.g. Ahmed"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Last name</label>
              <input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="e.g. Al Mansouri"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Email <span className="font-normal text-slate-400">(for exam invites)</span></label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="e.g. ahmed@example.com"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <button type="submit" disabled={saving}
              className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs disabled:opacity-60 inline-flex items-center gap-1.5 justify-center whitespace-nowrap">
              <HiOutlinePlus className="w-4 h-4" />{saving ? 'Adding…' : 'Add candidate'}
            </button>
          </form>
        )}

        {/* Search */}
        <div className="relative">
          <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-8 pr-3 h-9 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 py-16 text-center text-sm text-slate-400 font-medium">
            {rows.length === 0 ? 'No candidates yet. Add your first one above.' : 'No matches.'}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {filtered.map((r) => {
              const id = r.id || r._id;
              const isEditing = edit && edit.id === id;
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {initials(r.participant_name)}
                  </div>

                  {isEditing ? (
                    <>
                      <input value={edit.first_name} onChange={(e) => setEdit((x) => ({ ...x, first_name: e.target.value }))}
                        placeholder="first name"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-blue-300 bg-blue-50/30 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                      <input value={edit.last_name} onChange={(e) => setEdit((x) => ({ ...x, last_name: e.target.value }))}
                        placeholder="last name"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-blue-300 bg-blue-50/30 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                      <input value={edit.email} onChange={(e) => setEdit((x) => ({ ...x, email: e.target.value }))}
                        placeholder="email"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-blue-300 bg-blue-50/30 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                      <button onClick={saveEdit} disabled={busyId === id}
                        className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50">
                        <HiOutlineCheck className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEdit(null)}
                        className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100">
                        <HiOutlineX className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.participant_name || '—'}</p>
                        <p className="text-[11px] text-slate-400 truncate inline-flex items-center gap-1">
                          <HiOutlineMail className="w-3 h-3" />{r.email || <span className="italic">no email</span>}
                        </p>
                      </div>
                      <Link to={`/airline/participants/${id}/performance`}
                        title="Performance"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-all whitespace-nowrap">
                        <HiOutlineChartBar className="w-3.5 h-3.5" /> Performance
                      </Link>
                      {canEdit && (
                        <button onClick={() => setEdit({
                          id,
                          first_name: r.first_name || (r.participant_name || '').split(/\s+/)[0] || '',
                          last_name: r.last_name || (r.participant_name || '').split(/\s+/).slice(1).join(' '),
                          email: r.email || '',
                        })}
                          title="Edit"
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all">
                          <HiOutlinePencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => remove(r)} disabled={busyId === id}
                          title="Remove"
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-all disabled:opacity-50">
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <p className="text-xs text-slate-400 text-right font-medium">
            {filtered.length} of {rows.length}
          </p>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}
