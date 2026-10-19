import { useEffect, useMemo, useState } from 'react';
import { useHistoryState } from '@/hooks/use-history-state';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineUsers, HiOutlineSearch, HiOutlineMail, HiOutlineCheck, HiOutlineX,
  HiOutlineFilter, HiOutlinePresentationChartLine, HiOutlinePlus, HiOutlineCalendar,
  HiOutlinePencil, HiOutlineTrash, HiOutlineDocumentText, HiOutlineSortDescending,
} from 'react-icons/hi';
import { getParticipants, updateParticipantEmail, deleteParticipant } from '../api';
import { RESULT_SORTS, useLatestExamResults, sortByLatestResult, LatestResultCell } from '../components/LatestExamResult';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import InternalCertificatesDialog, { useInternalCertCounts } from '../components/InternalCertificatesDialog';
import ValidityBadge from '../components/ValidityBadge';
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
          className="w-full min-w-0 px-2.5 py-1 text-xs border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25" />
        <button onClick={save} disabled={saving} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"><HiOutlineCheck className="w-4 h-4" /></button>
        <button onClick={() => { setDraft(email); setEditing(false); }} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"><HiOutlineX className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <button onClick={() => { setDraft(email); setEditing(true); }}
      className={`group/email inline-flex items-center gap-1.5 max-w-full text-xs transition-colors ${
        email ? 'font-medium text-slate-600 hover:text-blue-600' : 'font-semibold text-blue-600 hover:text-blue-700'
      }`}
      title={email ? 'Edit email' : 'Add email'}>
      {email
        ? <><HiOutlineMail className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" /><span className="truncate">{email}</span></>
        : <><HiOutlinePlus className="w-3.5 h-3.5 flex-shrink-0" /> Add email</>}
      {email && <HiOutlinePencil className="w-3 h-3 flex-shrink-0 text-slate-300 group-hover/email:text-blue-500" />}
    </button>
  );
}

// Airline participants directory — flat, searchable/filterable list of all the
// airline's participants with details and inline email editing.
export default function AirlineParticipants() {
  const { can, admin } = useAuth();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirm();
  const canEdit = !can || can('participants.edit');
  const canDelete = !can || can('participants.delete');
  // Admin-enabled for this airline: internal certificate PDFs per candidate.
  const internalCertsOn = !!admin?.can_upload_internal_certs;
  const [certsFor, setCertsFor] = useState(null); // { participant, mode: 'upload' | 'view' }
  const [certCounts, , certExpiries, reloadCerts] = useInternalCertCounts(internalCertsOn);
  // Row grid: participant · training · exam result · email · (certificates) · actions.
  const COLS = internalCertsOn
    ? 'lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_14rem_8rem] lg:items-center lg:gap-4'
    : 'lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_8rem] lg:items-center lg:gap-4';
  // Row actions sit in one joined control: neutral icons, colour only on hover.
  const ACTION = 'h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-50';
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

  const [search, setSearch] = useHistoryState('search', '');
  const [filterType, setFilterType] = useHistoryState('filterType', '');
  const [emailFilter, setEmailFilter] = useHistoryState('emailFilter', ''); // '' | 'with' | 'without'
  const [sortKey, setSortKey] = useHistoryState('sortKey', 'added');
  const latestResult = useLatestExamResults();
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
    const list = records.filter((r) => {
      if (filterType && r.training_type !== filterType) return false;
      if (emailFilter === 'with' && !r.email) return false;
      if (emailFilter === 'without' && r.email) return false;
      if (!q) return true;
      return (r.participant_name || '').toLowerCase().includes(q)
        || (r.email || '').toLowerCase().includes(q)
        || (r.department || '').toLowerCase().includes(q);
    });
    return sortByLatestResult(list, sortKey, latestResult);
  }, [records, search, filterType, emailFilter, sortKey, latestResult]);

  const withEmail = records.filter((r) => r.email).length;

  return (
    <div className="w-full min-h-full flex flex-col">
      {/* Sticky header: title + page actions */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full px-3.5 sm:px-6 lg:px-8 py-3">
          {/* Top Row: Title, Counter & Action Button */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
                <HiOutlineUsers className="w-4.5 h-4.5" />
              </div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">Participants</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
                {withEmail}/{records.length} with email
              </span>
            </div>

            {/* Bulk Email Manager + New Enrollment Actions */}
            {bulkEmail ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={saveAllEmails} disabled={savingEmails}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs disabled:opacity-60 whitespace-nowrap">
                  <HiOutlineCheck className="w-3.5 h-3.5" />{savingEmails ? 'Saving…' : 'Save All'}
                </button>
                <button type="button" onClick={() => setBulkEmail(false)} disabled={savingEmails}
                  className="inline-flex items-center h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold whitespace-nowrap">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {internalCertsOn && (
                  <Link to="/airline/certificates"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs whitespace-nowrap">
                  <HiOutlineDocumentText className="w-3.5 h-3.5 text-slate-500" /> All Certificates
                </Link>
                )}
                <button type="button" onClick={enterBulk}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs whitespace-nowrap">
                  <HiOutlineMail className="w-3.5 h-3.5 text-slate-500" /> Manage Emails
                </button>
                {(!can || can('participants.create')) && (
                  <Link to="/airline/enrollment/new"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs whitespace-nowrap">
                    <HiOutlinePlus className="w-3.5 h-3.5" /> New Enrollment
                  </Link>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="w-full px-3.5 sm:px-6 lg:px-8 py-5 flex-1">
        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : records.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-400 rounded-2xl">No participants enrolled yet.</Card>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
            {/* Toolbar: search + filters */}
            <div className="p-3 border-b border-slate-200/80">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or department…"
                className="w-full pl-8 pr-7 h-9 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-8 transition-all" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <HiOutlineX className="w-3 h-3" />
                </button>
              )}
            </div>

            <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[140px] sm:w-36 h-9 text-xs bg-white rounded-lg flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Training Types</SelectItem>
                {TRAINING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={emailFilter || 'all'} onValueChange={(v) => setEmailFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[120px] sm:w-32 h-9 text-xs bg-white rounded-lg flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Email</SelectItem>
                <SelectItem value="with">Has Email</SelectItem>
                <SelectItem value="without">Missing Email</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortKey} onValueChange={setSortKey}>
              <SelectTrigger className="w-[170px] sm:w-44 h-9 text-xs bg-white rounded-lg flex-shrink-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <HiOutlineSortDescending className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {RESULT_SORTS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
            </div>

            {/* Column header */}
            <div className={`hidden ${COLS} px-4 sm:px-5 py-2 bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400`}>
              <span>Participant</span>
              <span>Training</span>
              <span>Exam result</span>
              <span>Email</span>
              {internalCertsOn && <span>Certificates</span>}
              <span className="text-right">Actions</span>
            </div>

            {/* Rows — fixed height, scrolls internally */}
            <div className="h-[calc(100vh-19.5rem)] min-h-[18rem] overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-medium text-slate-400">No participants match your filters.</div>
            ) : filtered.map((r) => {
              const id = r.id || r._id;
              const certs = certCounts[id] || 0;
              return (
              <div key={id} className={`${COLS} px-4 sm:px-5 py-2.5 hover:bg-slate-50/60 transition-colors`}>
                {/* Participant */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">{initials(r.participant_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate capitalize" title={r.participant_name}>{r.participant_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.department || 'No department'}</p>
                  </div>
                </div>

                {/* Training */}
                <div className="mt-2 lg:mt-0 pl-11 lg:pl-0 flex items-center gap-2 min-w-0">
                  {r.training_type && (
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 flex-shrink-0">{r.training_type}</span>
                  )}
                  <HiOutlineCalendar className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  <span className="text-[11px] text-slate-500 truncate">
                    {r.training_date ? `${fmtDate(r.training_date)}${r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}` : 'No date'}
                  </span>
                </div>

                {/* Latest exam result */}
                <div className="mt-2 lg:mt-0 pl-11 lg:pl-0 min-w-0">
                  <LatestResultCell result={latestResult[id]} />
                </div>

                {/* Email */}
                <div className="mt-2 lg:mt-0 pl-11 lg:pl-0 min-w-0">
                  {bulkEmail ? (
                    <input type="email"
                      value={emailDrafts[id] ?? (r.email || '')}
                      onChange={(e) => setDraft(id, e.target.value)}
                      placeholder="candidate@email.com"
                      className="w-full px-2.5 py-1 text-xs border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/25 bg-blue-50/30" />
                  ) : (
                    <EmailCell rec={r} />
                  )}
                </div>

                {/* Internal certificates */}
                {internalCertsOn && (
                  <div className="mt-2 lg:mt-0 pl-11 lg:pl-0 flex items-center gap-2 min-w-0">
                    {certs > 0 ? (
                      <>
                        <button type="button" onClick={() => setCertsFor({ participant: r, mode: 'view' })}
                          title="View uploaded certificates"
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 transition-colors whitespace-nowrap">
                          <HiOutlineDocumentText className="w-3.5 h-3.5 text-slate-400" /> {certs} file{certs === 1 ? '' : 's'}
                        </button>
                        <ValidityBadge expiry={certExpiries[id] ?? null} showDate={false} />
                      </>
                    ) : (
                      <span className="text-xs text-slate-300">None</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-2 lg:mt-0 pl-11 lg:pl-0 flex lg:justify-end">
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-2xs">
                  <Link to={`/airline/participants/${id}/performance`} title="Performance dashboard" className={ACTION}>
                    <HiOutlinePresentationChartLine className="w-4 h-4" />
                  </Link>
                  {canEdit && (
                    <button type="button" onClick={() => navigate(`/airline/enrollment/${id}/edit`)}
                      title="Edit participant" className={ACTION}>
                      <HiOutlinePencil className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => removeRecord(r)} disabled={deletingId === id}
                      title="Delete participant"
                      className={`${ACTION} hover:!bg-red-50 hover:!text-red-600`}>
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  )}
                  </div>
                </div>
              </div>
              );
            })}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-5 py-2 bg-slate-50/80 border-t border-slate-200/80 text-[11px] font-medium text-slate-400 flex items-center justify-between">
              <span>{withEmail} of {records.length} have an email</span>
              <span>Showing {filtered.length} of {records.length}</span>
            </div>
          </div>
        )}

      </div>
      {ConfirmDialog}
      <InternalCertificatesDialog participant={certsFor?.participant} mode={certsFor?.mode}
        onClose={() => setCertsFor((c) => c && { ...c, participant: null })} onChange={reloadCerts} />
    </div>
  );
}
