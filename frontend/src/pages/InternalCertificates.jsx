import { useEffect, useMemo, useState } from 'react';
import { useHistoryState } from '@/hooks/use-history-state';
import toast from 'react-hot-toast';
import {
  FileBadge, FileText, Eye, Download, Trash2, Search, ShieldCheck, Clock, TriangleAlert, Files,
} from 'lucide-react';
import {
  listAllInternalCertificates, deleteInternalCertificate,
  getParticipants, downloadIssuedCertificate, previewIssuedCertificate,
  listInternalAssessments, getAssessmentCertificate, deleteAssessmentCertificate,
} from '../api';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { openInternalCertificate } from '../components/InternalCertificatesDialog';
import ValidityBadge from '../components/ValidityBadge';
import SegmentedToggle from '../components/SegmentedToggle';
import { internalCertExpiry, certExpiry } from '../utils/certValidity';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function bucketOf(expiry) {
  if (!expiry) return 'none';
  if (expiry.unlimited || expiry.status === 'valid') return 'valid';
  return expiry.status === 'expired' ? 'expired' : 'expiring';
}

// Sort key: soonest expiry first, then unlimited, then undated.
function urgency(expiry) {
  if (!expiry) return Infinity;
  return expiry.unlimited ? Number.MAX_SAFE_INTEGER : expiry.daysLeft;
}

const SOURCES = [
  { key: 'internal', label: 'Internal' },
  { key: 'ifoa', label: 'IFOA' },
];

// A released IFOA certificate (one per participant), shaped like an internal row.
function ifoaRow(p) {
  return {
    id: p.id || p._id,
    title: `${p.training_type || 'IFOA'} Certificate`,
    issued_on: p.end_date && String(p.end_date).trim() ? p.end_date : p.training_date,
    uploaded_by_name: 'IFOA',
    participant: { participant_name: p.participant_name, email: p.email, owner_name: '' },
    expiry: certExpiry(p),
  };
}

// IFOA certificates are generated on demand — preview inline, or download.
async function openIfoaCertificate(c, download) {
  const res = await (download ? downloadIssuedCertificate : previewIssuedCertificate)(c.id);
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `Certificate_${(c.participant?.participant_name || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Assessment filter value for certificates uploaded straight onto a candidate.
const NO_ASSESSMENT = '__none__';

// A certificate uploaded inside an internal assessment, shaped like an internal row.
function assessmentRow(a, c) {
  return {
    id: `${a.id}:${c.id}`,
    assessment: { id: a.id, title: a.title, candidateId: c.id },
    title: c.certificate.original_name?.replace(/\.pdf$/i, '') || 'Certificate',
    original_name: c.certificate.original_name,
    issued_on: a.assessment_date,
    uploaded_by_name: c.certificate.uploaded_by_name || a.created_by_name,
    createdAt: c.certificate.uploaded_at,
    participant: { participant_name: c.name, email: c.email, owner_name: '' },
  };
}

async function openAssessmentCertificate(c, download) {
  const res = await getAssessmentCertificate(c.assessment.id, c.assessment.candidateId);
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = c.original_name || `${c.title}.pdf`;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Row actions: quiet icon buttons, colour only on hover.
const ACTION = 'h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50 cursor-pointer';

const COLS = 'md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_6.5rem_9.5rem_8.5rem_6.5rem] md:items-center md:gap-4';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Every certificate the caller can see, across all candidates — switchable
// between the airline's own uploaded (internal) ones and those issued by IFOA.
// Internal: department → its own candidates; main airline → its own + every
// department's. IFOA: released certificates of the caller's own participants.
export default function InternalCertificates() {
  const { can, isDepartment, admin } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const canManage = can('internalCerts.manage');
  const canAssess = can('internalAssessments.manage');

  const [source, setSource] = useHistoryState('source', 'internal');
  const [directRows, setRows] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [assessment, setAssessment] = useHistoryState('assessment', ''); // '' = all, NO_ASSESSMENT, or an assessment id
  const [ifoaRows, setIfoaRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useHistoryState('search', '');
  const [owner, setOwner] = useHistoryState('owner', '');
  const [status, setStatus] = useHistoryState('status', 'all');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const internal = listAllInternalCertificates()
      .then((res) => setRows(res.data.certificates || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load certificates'));
    // Needs participants.view; without it the IFOA list simply stays empty.
    const ifoa = can('participants.view')
      ? getParticipants()
        .then((res) => setIfoaRows((res.data || []).filter((p) => p.cert_released).map(ifoaRow)))
        .catch((err) => toast.error(err.response?.data?.error || 'Failed to load IFOA certificates'))
      : Promise.resolve();
    // Certificates uploaded inside internal assessments belong to the Internal list too.
    const assess = canAssess
      ? listInternalAssessments()
        .then((res) => setAssessments(res.data.assessments || []))
        .catch((err) => toast.error(err.response?.data?.error || 'Failed to load assessment certificates'))
      : Promise.resolve();
    Promise.all([internal, ifoa, assess]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isIfoa = source === 'ifoa';
  // Internal = uploaded straight onto a candidate + uploaded inside an assessment.
  const internalRows = useMemo(() => [
    ...directRows,
    ...assessments.flatMap((a) => a.candidates.filter((c) => c.certificate).map((c) => assessmentRow(a, c))),
  ], [directRows, assessments]);
  const rows = isIfoa ? ifoaRows : internalRows;
  // Only offer assessments that actually hold a certificate.
  const assessmentOptions = useMemo(
    () => assessments.filter((a) => a.candidates.some((c) => c.certificate)),
    [assessments],
  );

  const switchSource = (key) => {
    setSource(key);
    setStatus('all');
    setOwner('');
    setAssessment('');
  };

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.participant?.owner_name).filter(Boolean))].sort(),
    [rows],
  );

  // Each row tagged with its validity, most urgent first.
  const tagged = useMemo(
    () => rows
      .map((r) => {
        const expiry = isIfoa ? r.expiry : internalCertExpiry(r);
        return { ...r, expiry, bucket: bucketOf(expiry) };
      })
      .sort((x, y) => urgency(x.expiry) - urgency(y.expiry)),
    [rows, isIfoa],
  );

  const counts = useMemo(() => {
    const out = { all: tagged.length, expired: 0, expiring: 0, valid: 0, none: 0 };
    tagged.forEach((r) => { out[r.bucket] += 1; });
    return out;
  }, [tagged]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tagged.filter((r) => {
      if (status !== 'all' && r.bucket !== status) return false;
      if (owner && r.participant?.owner_name !== owner) return false;
      if (!isIfoa && assessment && (assessment === NO_ASSESSMENT ? !!r.assessment : r.assessment?.id !== assessment)) return false;
      if (!q) return true;
      return [r.title, r.original_name, r.assessment?.title, r.participant?.participant_name, r.participant?.email]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [tagged, search, owner, status, assessment, isIfoa]);

  const open = async (c, download) => {
    setBusyId(c.id);
    try {
      await (isIfoa ? openIfoaCertificate : c.assessment ? openAssessmentCertificate : openInternalCertificate)(c, download);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not open certificate');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c) => {
    if (!(await confirm(`Delete "${c.title || c.original_name}"? The PDF is removed permanently.`, {
      title: 'Delete certificate', confirmLabel: 'Delete',
    }))) return;
    setBusyId(c.id);
    try {
      if (c.assessment) {
        const res = await deleteAssessmentCertificate(c.assessment.id, c.assessment.candidateId);
        setAssessments((prev) => prev.map((a) => (a.id === c.assessment.id ? res.data.assessment : a)));
      } else {
        await deleteInternalCertificate(c.id);
        setRows((prev) => prev.filter((x) => x.id !== c.id));
      }
      toast.success('Certificate deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const canDeleteCert = (c) => {
    if (isIfoa) return false;
    if (c.assessment) return canAssess;
    return canManage && (!isDepartment || String(c.uploaded_by) === String(admin?._id || admin?.id));
  };

  // Summary tiles double as the status filter.
  const TILES = [
    { key: 'all', label: 'All certificates', icon: Files, tone: 'bg-slate-100 text-slate-600', ring: 'ring-slate-900' },
    { key: 'valid', label: 'Valid', icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-500' },
    { key: 'expiring', label: 'Expiring soon', icon: Clock, tone: 'bg-amber-50 text-amber-600', ring: 'ring-amber-500' },
    { key: 'expired', label: 'Expired', icon: TriangleAlert, tone: 'bg-rose-50 text-rose-600', ring: 'ring-rose-500' },
  ];

  return (
    <div className="w-full min-h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <FileBadge className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight leading-tight">Certificates</h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {isIfoa
                  ? `Certificates IFOA has released for your ${isDepartment ? 'team' : 'candidates'}`
                  : `Internal certificates for your ${isDepartment ? 'team' : 'candidates and departments'} · upload new ones from Internal Assessments`}
              </p>
            </div>
          </div>

          {/* Source toggle */}
          <SegmentedToggle className="self-start sm:self-auto flex-shrink-0" value={source} onChange={switchSource}
            options={SOURCES.map((o) => ({ ...o, count: (o.key === 'ifoa' ? ifoaRows : internalRows).length }))} />
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Summary tiles (also filter the list) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TILES.map((t) => {
            const active = status === t.key;
            const n = counts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(active && t.key !== 'all' ? 'all' : t.key)}
                className={`flex items-center gap-3 p-4 rounded-2xl bg-white border text-left transition-all cursor-pointer ${
                  active
                    ? `border-transparent ring-2 ${t.ring} shadow-sm`
                    : 'border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300'
                }`}
              >
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.tone}`}>
                  <t.icon className="w-5 h-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-2xl font-semibold text-slate-900 tabular-nums leading-none">{loading ? '–' : n}</span>
                  <span className="block text-xs text-slate-500 mt-1 truncate">{t.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" strokeWidth={1.75} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by candidate, email or certificate title…"
                className="w-full pl-9 pr-3 h-9 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition" />
            </div>
            {!isIfoa && assessmentOptions.length > 0 && (
              <Select value={assessment || 'all'} onValueChange={(v) => setAssessment(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-56 h-9 text-xs bg-slate-50 rounded-xl border-slate-200/80 flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All internal assessments</SelectItem>
                  {assessmentOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                  <SelectItem value={NO_ASSESSMENT}>Not in an assessment</SelectItem>
                </SelectContent>
              </Select>
            )}
            {owners.length > 1 && (
              <select value={owner} onChange={(e) => setOwner(e.target.value)}
                className="h-9 px-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                <option value="">All departments</option>
                {owners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {counts.none > 0 && (
              <button type="button" onClick={() => setStatus(status === 'none' ? 'all' : 'none')}
                className={`h-9 px-3 rounded-xl text-xs font-medium border whitespace-nowrap transition cursor-pointer ${
                  status === 'none' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200/80 hover:border-slate-300'
                }`}>
                No expiry set · {counts.none}
              </button>
            )}
          </div>

          {/* Column header */}
          <div className={`hidden ${COLS} px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400`}>
            <span>Candidate</span>
            <span>Certificate</span>
            <span>Issued</span>
            <span>Validity</span>
            <span>{isIfoa ? 'Issued by' : 'Uploaded by'}</span>
            <span className="text-right">Actions</span>
          </div>

          {/* List — grows with its rows, scrolls once it gets long */}
          <div className="max-h-[calc(100vh-24rem)] min-h-[12rem] overflow-y-auto">
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-400 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {rows.length > 0 ? 'No matching certificates' : isIfoa ? 'No IFOA certificates yet' : 'No certificates uploaded yet'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {rows.length > 0 ? 'Try a different search or filter.' : isIfoa ? 'Released certificates will appear here.' : 'Upload certificates from Internal Assessments.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const name = c.participant?.participant_name || 'Unknown candidate';
                  const title = c.title || c.original_name;
                  return (
                  <div key={c.id} className={`${COLS} px-5 py-3.5 hover:bg-slate-50/70 transition-colors`}>
                    {/* Candidate */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center flex-shrink-0 text-[11px] font-semibold">
                        {initials(c.participant?.participant_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate capitalize" title={name}>{name}</p>
                        <p className="text-xs text-slate-500 truncate">{c.participant?.email || 'No email'}</p>
                      </div>
                    </div>

                    {/* Certificate */}
                    <div className="mt-3 md:mt-0 flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-9 rounded-md bg-rose-50 text-rose-500 border border-rose-100 flex flex-col items-center justify-center flex-shrink-0">
                        <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span className="text-[7px] font-bold leading-none mt-0.5">PDF</span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate" title={title}>{title}</p>
                        {c.assessment ? (
                          <p className="text-[11px] text-slate-500 truncate" title={`Internal assessment: ${c.assessment.title}`}>{c.assessment.title}</p>
                        ) : !isDepartment && c.participant?.owner_name && (
                          <p className="text-[11px] text-slate-500 truncate">{c.participant.owner_name}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 md:mt-0 flex items-center gap-x-4 gap-y-2 flex-wrap md:contents">
                      <div className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        <span className="md:hidden text-slate-400">Issued </span>{fmtDate(c.issued_on)}
                      </div>
                      <div>
                        <ValidityBadge expiry={c.expiry}
                          fallback={<span className="text-xs text-slate-400">{isIfoa ? '—' : 'No expiry set'}</span>} />
                      </div>
                      <div className="hidden md:block min-w-0 text-xs">
                        <p className="text-slate-700 truncate" title={c.uploaded_by_name || ''}>{c.uploaded_by_name || '—'}</p>
                        {!isIfoa && <p className="text-slate-400 tabular-nums">{fmtDate(c.createdAt)}</p>}
                      </div>
                      <div className="flex ml-auto md:ml-0 md:justify-end gap-0.5">
                        <button onClick={() => open(c, false)} disabled={busyId === c.id} title="View" className={ACTION}>
                          <Eye className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                        <button onClick={() => open(c, true)} disabled={busyId === c.id} title="Download" className={ACTION}>
                          <Download className="w-4 h-4" strokeWidth={1.75} />
                        </button>
                        {canDeleteCert(c) && (
                          <button onClick={() => remove(c)} disabled={busyId === c.id} title="Delete"
                            className={`${ACTION} hover:!bg-rose-50 hover:!text-rose-600`}>
                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>{isIfoa ? 'Issued by IFOA' : 'Uploaded internally'}</span>
            <span className="tabular-nums">{loading ? '…' : `Showing ${filtered.length} of ${rows.length}`}</span>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}
