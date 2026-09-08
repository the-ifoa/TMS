import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineUsers, HiOutlineSearch, HiOutlineMail, HiOutlineCheck, HiOutlineX,
  HiOutlineFilter, HiOutlineChartBar, HiOutlinePlus,
  HiOutlinePencil, HiOutlineTrash,
} from 'react-icons/hi';
import { getParticipants, updateParticipantEmail, deleteParticipant } from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const TRAINING_TYPES = ['FDI', 'FDR', 'FDA', 'FTL', 'NDG', 'HF', 'GD', 'TCD'];

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'S';
}

// Inline email add/edit for one participant.
function EmailCell({ rec }) {
  const [email, setEmail] = useState(rec.email || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rec.email || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateParticipantEmail(rec.id || rec._id, draft.trim());
      setEmail(draft.trim());
      rec.email = draft.trim();
      setEditing(false);
      toast.success(draft.trim() ? 'Email saved' : 'Email cleared');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save email');
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input autoFocus type="email" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(email); setEditing(false); } }}
          placeholder="candidate@email.com"
          className="w-52 px-2.5 py-1 text-xs border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25" />
        <button onClick={save} disabled={saving} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"><HiOutlineCheck className="w-4 h-4" /></button>
        <button onClick={() => { setDraft(email); setEditing(false); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><HiOutlineX className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <button onClick={() => { setDraft(email); setEditing(true); }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${email ? 'bg-blue-50/80 border-blue-200/80 text-blue-700 hover:bg-blue-100/80' : 'bg-slate-50 border-dashed border-slate-300 text-slate-500 hover:bg-slate-100'}`}
      title={email ? 'Edit email' : 'Add email'}>
      <HiOutlineMail className="w-3.5 h-3.5" />
      <span className="max-w-[220px] truncate">{email || 'Add email'}</span>
    </button>
  );
}

// Airline participants directory — flat, searchable/filterable list of all the
// airline's participants with details and inline email editing.
export default function AirlineParticipants() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const canEdit = !can || can('participants.edit');
  const canDelete = !can || can('participants.delete');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const removeRecord = async (rec) => {
    const id = rec.id || rec._id;
    const name = rec.participant_name || `${rec.first_name || ''} ${rec.last_name || ''}`.trim() || 'this participant';
    if (!(await confirm(`Delete ${name}? This cannot be undone.`, {
      title: 'Delete participant', confirmLabel: 'Delete',
    }))) return;
    setDeletingId(id);
    try {
      await deleteParticipant(id);
      setRecords((prev) => prev.filter((r) => (r.id || r._id) !== id));
      toast.success('Participant deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [emailFilter, setEmailFilter] = useState(''); // '' | 'with' | 'without'
  const [bulkEmail, setBulkEmail] = useState(false);
  const [emailDrafts, setEmailDrafts] = useState({});
  const [savingEmails, setSavingEmails] = useState(false);

  useEffect(() => {
    getParticipants()
      .then((res) => setRecords(res.data || []))
      .catch(() => toast.error('Failed to load participants.'))
      .finally(() => setLoading(false));
  }, []);

  const enterBulk = () => {
    const d = {};
    records.forEach((r) => { d[r.id || r._id] = r.email || ''; });
    setEmailDrafts(d);
    setBulkEmail(true);
  };
  const setDraft = (id, val) => setEmailDrafts((p) => ({ ...p, [id]: val }));

  const saveAllEmails = async () => {
    const changed = records.filter((r) => {
      const id = r.id || r._id;
      return emailDrafts[id] !== undefined && (emailDrafts[id].trim() || '') !== (r.email || '');
    });
    if (changed.length === 0) { setBulkEmail(false); toast('No email changes to save.', { icon: 'ℹ️' }); return; }
    setSavingEmails(true);
    let ok = 0, fail = 0;
    for (const r of changed) {
      const id = r.id || r._id;
      try { await updateParticipantEmail(id, emailDrafts[id].trim()); r.email = emailDrafts[id].trim(); ok++; }
      catch { fail++; }
    }
    setSavingEmails(false);
    setBulkEmail(false);
    setRecords((prev) => [...prev]); // reflect updated emails
    if (fail === 0) toast.success(`${ok} email${ok !== 1 ? 's' : ''} saved.`);
    else toast.error(`${ok} saved, ${fail} failed.`);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (filterType && r.training_type !== filterType) return false;
      if (emailFilter === 'with' && !r.email) return false;
      if (emailFilter === 'without' && r.email) return false;
      if (!q) return true;
      return (r.participant_name || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.department || '').toLowerCase().includes(q);
    });
  }, [records, search, filterType, emailFilter]);

  const withEmail = records.filter((r) => r.email).length;

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Sticky header + compact toolbar */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2 space-y-2">
          {/* Top Row: Title, Counter & Action Button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
                <HiOutlineUsers className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none">Participants</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
                {withEmail}/{records.length} with email
              </span>
            </div>

            {/* Bulk Email Manager + New Enrollment Actions */}
            {bulkEmail ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={saveAllEmails} disabled={savingEmails}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs disabled:opacity-60 whitespace-nowrap">
                  <HiOutlineCheck className="w-3.5 h-3.5" />{savingEmails ? 'Saving…' : 'Save All'}
                </button>
                <button type="button" onClick={() => setBulkEmail(false)} disabled={savingEmails}
                  className="inline-flex items-center h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold whitespace-nowrap">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" onClick={enterBulk}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs whitespace-nowrap">
                  <HiOutlineMail className="w-3.5 h-3.5 text-slate-500" /> Manage Emails
                </button>
                {(!can || can('participants.create')) && (
                  <Link to="/airline/enrollment/new"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs whitespace-nowrap">
                    <HiOutlinePlus className="w-3.5 h-3.5" /> New Enrollment
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Bottom Row: Search & Filters in a single horizontal row */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or department…"
                className="w-full pl-8 pr-7 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-8 transition-all" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <HiOutlineX className="w-3 h-3" />
                </button>
              )}
            </div>

            <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px] sm:w-36 h-8 text-xs bg-white rounded-lg flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Training Types</SelectItem>
                {TRAINING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={emailFilter || 'all'} onValueChange={(v) => setEmailFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[120px] sm:w-32 h-8 text-xs bg-white rounded-lg flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Email</SelectItem>
                <SelectItem value="with">Has Email</SelectItem>
                <SelectItem value="without">Missing Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 flex-1">
        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : records.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl">No participants enrolled yet.</Card>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-xs font-medium text-slate-400">No participants match your filters.</div>
            ) : filtered.map((r) => (
              <div key={r.id || r._id} className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                {/* Identity */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="w-9 h-9 border border-slate-200 shadow-2xs flex-shrink-0">
                    <AvatarFallback className="bg-slate-100 text-slate-600 text-[11px] font-bold">{initials(r.participant_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{r.participant_name}</p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">
                      {r.department || '—'} · {fmtDate(r.training_date)}{r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                    </p>
                  </div>
                </div>

                {/* Meta + email + status + actions */}
                <div className="flex items-center gap-2.5 flex-wrap lg:flex-nowrap pl-12 lg:pl-0 flex-shrink-0">
                  {/* Training Type */}
                  <div className="w-14 shrink-0 flex justify-center">
                    {r.training_type ? (
                      <span className="w-full text-center px-2 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-[11px] font-bold text-slate-600">{r.training_type}</span>
                    ) : (
                      <span className="w-full text-center text-slate-300 text-xs">—</span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="w-44 sm:w-48 shrink-0">
                    {bulkEmail ? (
                      <input type="email"
                        value={emailDrafts[r.id || r._id] ?? (r.email || '')}
                        onChange={(e) => setDraft(r.id || r._id, e.target.value)}
                        placeholder="candidate@email.com"
                        className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25 bg-blue-50/30" />
                    ) : (
                      <EmailCell rec={r} />
                    )}
                  </div>

                  {/* Performance */}
                  <div className="w-28 shrink-0">
                    <Link to={`/airline/participants/${r.id || r._id}/performance`}
                      className="w-full justify-center inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-all">
                      <HiOutlineChartBar className="w-3.5 h-3.5 shrink-0" /> Performance
                    </Link>
                  </div>

                  {/* Edit / Delete */}
                  {(canEdit || canDelete) && (
                    <div className="shrink-0 flex items-center gap-1">
                      {canEdit && (
                        <button type="button"
                          onClick={() => navigate(`/airline/enrollment/${r.id || r._id}/edit`)}
                          title="Edit participant"
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition-all">
                          <HiOutlinePencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button type="button"
                          onClick={() => removeRecord(r)}
                          disabled={deletingId === (r.id || r._id)}
                          title="Delete participant"
                          className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-500 hover:text-red-600 transition-all disabled:opacity-50">
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && records.length > 0 && (
          <p className="text-xs text-slate-400 text-right font-medium">
            Showing {filtered.length} of {records.length} participant{records.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}
