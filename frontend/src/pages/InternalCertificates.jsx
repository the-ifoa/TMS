import { useEffect, useMemo, useState } from 'react';
import { useHistoryState } from '@/hooks/use-history-state';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentText, HiOutlineSearch, HiOutlineEye, HiOutlineDownload, HiOutlineTrash,
} from 'react-icons/hi';
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
import { CountingNumber } from '@/components/animate-ui/primitives/texts/counting-number';
import { internalCertExpiry, certExpiry } from '../utils/certValidity';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const BUCKETS = [
  { key: 'all', label: 'All', dot: 'bg-slate-400' },
  { key: 'expired', label: 'Expired', dot: 'bg-red-500' },
  { key: 'expiring', label: 'Expiring soon', dot: 'bg-amber-500' },
  { key: 'valid', label: 'Valid', dot: 'bg-emerald-500' },
  { key: 'none', label: 'No expiry set', dot: 'bg-slate-300' },
];

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

// Row actions sit in one joined control: neutral icons, colour only on hover.
const ACTION = 'h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-50';

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

  return (
    <div className="w-full min-h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full px-3.5 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
                <HiOutlineDocumentText className="w-4 h-4" />
              </div>
              <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none">Certificates</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
                <CountingNumber number={rows.length} />
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {isIfoa ? (
                <>Every certificate IFOA has released for your {isDepartment ? 'team' : 'candidates'}.</>
              ) : (
                <>
                  Every internal certificate uploaded for your {isDepartment ? 'team' : 'candidates and departments'}.
                  Upload new ones from a candidate&apos;s Certificates button.
                </>
              )}
            </p>
          </div>

          {/* Source toggle */}
          <SegmentedToggle className="self-start sm:self-auto flex-shrink-0" value={source} onChange={switchSource}
            options={SOURCES.map((o) => ({ ...o, count: (o.key === 'ifoa' ? ifoaRows : internalRows).length }))} />
        </div>
      </div>

      <div className="w-full px-3.5 sm:px-6 lg:px-8 py-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="p-3 border-b border-slate-200/80 space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by candidate, email or certificate title…"
                  className="w-full pl-8 pr-3 h-9 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              {!isIfoa && assessmentOptions.length > 0 && (
                <Select value={assessment || 'all'} onValueChange={(v) => setAssessment(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-full sm:w-56 h-9 text-xs bg-slate-50 rounded-lg border-slate-200/80 flex-shrink-0">
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
                  className="h-9 px-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="">All departments</option>
                  {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </div>

            {/* Status filter */}
            {rows.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {BUCKETS.filter((b) => b.key === 'all' || counts[b.key] > 0).map((b) => (
                  <button key={b.key} onClick={() => setStatus(b.key)}
                    className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-semibold transition-colors ${
                      status === b.key
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300'
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
                    {b.label}
                    <span className={status === b.key ? 'text-white/70' : 'text-slate-400'}>{counts[b.key]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column header */}
          <div className={`hidden ${COLS} px-4 py-2 bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-400`}>
            <span>Candidate</span>
            <span>Certificate</span>
            <span>Issued</span>
            <span>Validity</span>
            <span>{isIfoa ? 'Issued by' : 'Uploaded by'}</span>
            <span className="text-right">Actions</span>
          </div>

          {/* List — fixed height, scrolls internally */}
          <div className="h-[calc(100vh-21rem)] min-h-[18rem] overflow-y-auto">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-sm text-slate-400 font-medium">
                <HiOutlineDocumentText className="w-7 h-7 text-slate-300" />
                {rows.length > 0 ? 'No matches.' : isIfoa ? 'No IFOA certificates released yet.' : 'No certificates uploaded yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const name = c.participant?.participant_name || 'Unknown candidate';
                  const title = c.title || c.original_name;
                  return (
                  <div key={c.id} className={`${COLS} px-4 py-3 hover:bg-slate-50/60 transition-colors`}>
                    {/* Candidate */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                        {initials(c.participant?.participant_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate capitalize" title={name}>{name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {c.participant?.email || 'No email'}
                        </p>
                      </div>
                    </div>

                    {/* Certificate */}
                    <div className="mt-2 md:mt-0 flex items-center gap-2 min-w-0">
                      <HiOutlineDocumentText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate" title={title}>{title}</p>
                        {c.assessment ? (
                          <p className="text-[10px] text-slate-400 truncate" title={`Internal assessment: ${c.assessment.title}`}>{c.assessment.title}</p>
                        ) : !isDepartment && c.participant?.owner_name && (
                          <p className="text-[10px] text-slate-400 font-medium truncate">{c.participant.owner_name}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 md:mt-0 flex items-center gap-x-4 gap-y-2 flex-wrap md:contents">
                      <div className="text-[11px] text-slate-500 whitespace-nowrap">
                        <span className="md:hidden text-slate-400">Issued </span>{fmtDate(c.issued_on)}
                      </div>
                      <div>
                        <ValidityBadge expiry={c.expiry}
                          fallback={<span className="text-[11px] text-slate-400">{isIfoa ? '—' : 'No expiry set'}</span>} />
                      </div>
                      <div className="hidden md:block min-w-0 text-[11px]">
                        <p className="text-slate-600 truncate" title={c.uploaded_by_name || ''}>{c.uploaded_by_name || '—'}</p>
                        {!isIfoa && <p className="text-slate-400">{fmtDate(c.createdAt)}</p>}
                      </div>
                      <div className="flex ml-auto md:ml-0 md:justify-end">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-2xs">
                          <button onClick={() => open(c, false)} disabled={busyId === c.id} title="View" className={ACTION}>
                            <HiOutlineEye className="w-4 h-4" />
                          </button>
                          <button onClick={() => open(c, true)} disabled={busyId === c.id} title="Download" className={ACTION}>
                            <HiOutlineDownload className="w-4 h-4" />
                          </button>
                          {canDeleteCert(c) && (
                            <button onClick={() => remove(c)} disabled={busyId === c.id} title="Delete"
                              className={`${ACTION} hover:!bg-red-50 hover:!text-red-600`}>
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-200/80 text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>{isIfoa ? 'Issued by IFOA' : 'Uploaded internally'}</span>
            <span>{loading ? '…' : `${filtered.length} of ${rows.length}`}</span>
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}
