import { useEffect, useMemo, useRef, useState } from 'react';
import { useHistoryState } from '@/hooks/use-history-state';
import toast from 'react-hot-toast';
import {
  HiOutlineBadgeCheck, HiOutlineSearch, HiOutlinePlus, HiOutlineArrowLeft, HiOutlineEye,
  HiOutlineDownload, HiOutlineTrash, HiOutlineUpload, HiOutlinePencil, HiOutlineUserAdd,
  HiOutlineUsers, HiOutlineX, HiOutlineRefresh, HiOutlineDocumentText, HiOutlineUserRemove,
} from 'react-icons/hi';
import {
  listInternalAssessments, createInternalAssessment, updateInternalAssessment, deleteInternalAssessment,
  addAssessmentCandidates, removeAssessmentCandidate, uploadAssessmentCertificate,
  getAssessmentCertificate, deleteAssessmentCertificate, getParticipants,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import SegmentedToggle from '../components/SegmentedToggle';
import { CountingNumber } from '@/components/animate-ui/primitives/texts/counting-number';

const MAX_BYTES = 10 * 1024 * 1024;

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const certCount = (a) => a.candidates.filter((c) => c.certificate).length;

const INPUT = 'w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors';
// Row actions sit in one joined control: neutral icons, colour only on hover.
const ACTION = 'h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-50';
const DANGER = 'hover:!bg-red-50 hover:!text-red-600';
const ICON_BTN = 'p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 disabled:opacity-50';

// Create / rename an assessment.
function AssessmentFormDialog({ open, initial, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', assessment_date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: initial?.title || '',
      description: initial?.description || '',
      assessment_date: initial?.assessment_date ? String(initial.assessment_date).slice(0, 10) : '',
    });
  }, [open, initial]);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Give the assessment a title'); return; }
    setSaving(true);
    try {
      const res = initial
        ? await updateInternalAssessment(initial.id, form)
        : await createInternalAssessment(form);
      toast.success(initial ? 'Assessment updated' : 'Assessment created');
      onSaved(res.data.assessment);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save assessment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit assessment' : 'New internal assessment'}</DialogTitle>
          <DialogDescription>Your own assessment. Add candidates and their certificates afterwards.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Title</span>
            <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Ramp Safety Assessment Q4" className={`${INPUT} mt-1`} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Assessment date</span>
            <input type="date" value={form.assessment_date}
              onChange={(e) => setForm((f) => ({ ...f, assessment_date: e.target.value }))} className={`${INPUT} mt-1`} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Description <span className="text-slate-400 font-normal">(optional)</span></span>
            <textarea rows={3} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={`${INPUT} mt-1 h-auto py-2 resize-none`} />
          </label>
        </div>
        <DialogFooter>
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={save} disabled={saving} className={BTN_PRIMARY}>{saving ? 'Saving…' : initial ? 'Save' : 'Create'}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add candidates: tick existing participants, or type people in by hand.
function AddCandidatesDialog({ open, assessment, onClose, onSaved }) {
  const { can } = useAuth();
  const canPick = can('participants.view');
  const [tab, setTab] = useState('existing');
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [manual, setManual] = useState([{ name: '', email: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(canPick ? 'existing' : 'manual');
    setSearch('');
    setPicked(new Set());
    setManual([{ name: '', email: '' }]);
    if (!canPick) return;
    setLoading(true);
    getParticipants()
      .then((res) => setPeople(res.data || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load participants'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const already = useMemo(
    () => new Set((assessment?.candidates || []).map((c) => c.participant).filter(Boolean)),
    [assessment],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => !already.has(String(p.id || p._id)))
      .filter((p) => !q || [p.participant_name, p.email].some((v) => (v || '').toLowerCase().includes(q)));
  }, [people, already, search]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allShownPicked = available.length > 0 && available.every((p) => picked.has(String(p.id || p._id)));
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    available.forEach((p) => {
      const id = String(p.id || p._id);
      if (allShownPicked) next.delete(id); else next.add(id);
    });
    return next;
  });

  const setRow = (i, patch) => setManual((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const manualRows = manual.filter((m) => m.name.trim());
  const total = picked.size + manualRows.length;

  const save = async () => {
    if (!total) { toast.error('Pick or enter at least one candidate'); return; }
    setSaving(true);
    try {
      const res = await addAssessmentCandidates(assessment.id, {
        participant_ids: [...picked],
        manual: manualRows.map((m) => ({ name: m.name.trim(), email: m.email.trim() })),
      });
      toast.success(`${res.data.added} candidate${res.data.added === 1 ? '' : 's'} added`);
      onSaved(res.data.assessment);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add candidates');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    ...(canPick ? [{ key: 'existing', label: 'From participants', n: picked.size }] : []),
    { key: 'manual', label: 'Add manually', n: manualRows.length },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add candidates</DialogTitle>
          <DialogDescription>{assessment?.title}</DialogDescription>
          <SegmentedToggle className="mt-3" value={tab} onChange={setTab}
            options={tabs.map((t) => ({ key: t.key, label: t.label, count: t.n > 0 ? t.n : undefined }))} />
        </DialogHeader>

        {tab === 'existing' ? (
          <div className="flex flex-col min-h-0">
            <div className="px-5 pt-3 pb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participants…" className={`${INPUT} pl-8`} />
              </div>
              {available.length > 0 && (
                <button onClick={toggleAll} className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
                  {allShownPicked ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            <div className="h-72 overflow-y-auto border-t border-slate-100">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : available.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium px-6 text-center">
                  {people.length === 0 ? 'No participants yet. Add candidates manually.' : 'No participants left to add.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {available.map((p) => {
                    const id = String(p.id || p._id);
                    return (
                      <label key={id} className="flex items-center gap-3 px-5 py-2 cursor-pointer hover:bg-slate-50/60">
                        <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)}
                          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-slate-100 text-slate-600`}>
                          {initials(p.participant_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate capitalize">{p.participant_name || 'Unnamed'}</p>
                          <p className="text-[11px] text-slate-400 truncate">{p.email || 'No email'}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-2 h-[21.5rem] overflow-y-auto">
            {manual.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={m.name} onChange={(e) => setRow(i, { name: e.target.value })}
                  placeholder="Full name" className={INPUT} />
                <input type="email" value={m.email} onChange={(e) => setRow(i, { email: e.target.value })}
                  placeholder="Email (optional)" className={INPUT} />
                <button onClick={() => setManual((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ name: '', email: '' }]))}
                  title="Remove row" className={`${ICON_BTN} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button onClick={() => setManual((rows) => [...rows, { name: '', email: '' }])}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700">
              <HiOutlinePlus className="w-3.5 h-3.5" /> Add another
            </button>
          </div>
        )}

        <DialogFooter>
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={save} disabled={saving || !total} className={BTN_PRIMARY}>
            {saving ? 'Adding…' : `Add ${total || ''} candidate${total === 1 ? '' : 's'}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One assessment as a card in the grid — same layout as the exam cards.
function AssessmentCard({ a, showOwner, onOpen }) {
  const total = a.candidates.length;
  const certs = certCount(a);
  const pct = total ? Math.round((certs / total) * 100) : 0;
  const state = total > 0 && certs === total
    ? { label: 'Complete', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : certs > 0
      ? { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { label: 'Not started', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <div className="group p-5 sm:p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between">
      <div className="space-y-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform mt-0.5">
              <HiOutlineBadgeCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors" title={a.title}>{a.title}</h2>
              <p className="text-[11px] font-medium text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{a.assessment_date ? fmtDate(a.assessment_date) : 'No date set'}</span>
                {showOwner && a.created_by_name && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80 truncate max-w-full">{a.created_by_name}</span>
                )}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold flex-shrink-0 ${state.cls}`}>{state.label}</span>
        </div>

        {/* Description — fixed height so cards line up */}
        <div className="h-9 flex items-center">
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {a.description || <span className="italic text-slate-300">No description provided</span>}
          </p>
        </div>

        {/* Info tiles */}
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-0.5">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
            <HiOutlineUsers className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{total} Candidate{total === 1 ? '' : 's'}</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
            <HiOutlineDocumentText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{certs}/{total} Certificates</span>
          </div>
        </div>

        {/* Certificate progress */}
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`${pct}% of certificates uploaded`}>
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Action */}
      <div className="pt-3.5 mt-3.5 border-t border-slate-100/90">
        <button type="button" onClick={onOpen}
          className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors">
          <HiOutlineUsers className="w-3.5 h-3.5 text-slate-400" /> Candidates &amp; certificates
        </button>
      </div>
    </div>
  );
}

// An airline's own assessments, shown as cards. Opening one lists its
// candidates, each with an uploadable certificate PDF.
// Department → the ones it created; main airline → its own + every department's.
export default function InternalAssessments() {
  const { isDepartment } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useHistoryState('openId', null);
  const [form, setForm] = useState({ open: false, initial: null });
  const [adding, setAdding] = useState(false);
  const [candSearch, setCandSearch] = useHistoryState('candSearch', '');
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);
  const uploadFor = useRef(null);

  useEffect(() => {
    listInternalAssessments()
      .then((res) => setItems(res.data.assessments || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load assessments'))
      .finally(() => setLoading(false));
  }, []);

  const current = items.find((a) => a.id === openId) || null;
  const put = (a) => setItems((prev) => (prev.some((x) => x.id === a.id) ? prev.map((x) => (x.id === a.id ? a : x)) : [a, ...prev]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => [a.title, a.description, a.created_by_name].some((v) => (v || '').toLowerCase().includes(q)));
  }, [items, search]);

  const candidates = useMemo(() => {
    const q = candSearch.trim().toLowerCase();
    const list = current?.candidates || [];
    if (!q) return list;
    return list.filter((c) => [c.name, c.email].some((v) => (v || '').toLowerCase().includes(q)));
  }, [current, candSearch]);

  const removeAssessment = async () => {
    if (!(await confirm(`Delete "${current.title}"? Its candidate list and every uploaded certificate are removed permanently.`, {
      title: 'Delete assessment', confirmLabel: 'Delete',
    }))) return;
    try {
      await deleteInternalAssessment(current.id);
      setItems((prev) => prev.filter((x) => x.id !== current.id));
      setOpenId(null);
      toast.success('Assessment deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  // Run a per-candidate request that returns the updated assessment.
  const act = async (c, fn, okMsg, failMsg) => {
    setBusyId(c.id);
    try {
      const res = await fn();
      if (res?.data?.assessment) put(res.data.assessment);
      if (okMsg) toast.success(okMsg);
    } catch (err) {
      toast.error(err.response?.data?.error || failMsg);
    } finally {
      setBusyId(null);
    }
  };

  const removeCandidate = async (c) => {
    if (!(await confirm(`Remove ${c.name} from this assessment?${c.certificate ? ' Their certificate is deleted too.' : ''}`, {
      title: 'Remove candidate', confirmLabel: 'Remove',
    }))) return;
    act(c, () => removeAssessmentCandidate(current.id, c.id), 'Candidate removed', 'Could not remove candidate');
  };

  const pickFile = (c) => { uploadFor.current = c; fileRef.current?.click(); };

  const onFile = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    const c = uploadFor.current;
    if (!f || !c) return;
    if (f.type !== 'application/pdf') { toast.error('Only PDF files are allowed'); return; }
    if (f.size > MAX_BYTES) { toast.error('PDF must be 10 MB or smaller'); return; }
    act(c, () => uploadAssessmentCertificate(current.id, c.id, f), 'Certificate uploaded', 'Upload failed');
  };

  const openCert = (c, download) => act(c, async () => {
    const res = await getAssessmentCertificate(current.id, c.id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = c.certificate.original_name || `${c.name}.pdf`;
      a.click();
    } else {
      window.open(url, '_blank', 'noopener');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, null, 'Could not open certificate');

  const removeCert = async (c) => {
    if (!(await confirm(`Delete the certificate uploaded for ${c.name}? The PDF is removed permanently.`, {
      title: 'Delete certificate', confirmLabel: 'Delete',
    }))) return;
    act(c, () => deleteAssessmentCertificate(current.id, c.id), 'Certificate deleted', 'Delete failed');
  };

  return (
    <div className={`w-full flex flex-col ${current ? 'h-[calc(100vh-4rem)] overflow-hidden' : 'min-h-full'}`}>
      {/* Header */}
      <div className="sticky top-0 z-20 w-full flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full px-3.5 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {current && (
              <button onClick={() => { setOpenId(null); setCandSearch(''); }} title="Back to assessments"
                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 flex items-center justify-center flex-shrink-0">
                <HiOutlineArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
              <HiOutlineBadgeCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none truncate">
                  {current ? current.title : 'Internal Assessment'}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold flex-shrink-0">
                  <CountingNumber number={current ? current.candidates.length : items.length} />
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {current
                  ? `${current.assessment_date ? fmtDate(current.assessment_date) : 'No date set'} · ${certCount(current)}/${current.candidates.length} certificates uploaded`
                  : `Your ${isDepartment ? "department's" : "airline's"} own assessments. Add candidates and upload a certificate for each.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {current ? (
              <>
                <button onClick={() => setForm({ open: true, initial: current })} className={BTN_GHOST}>
                  <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={removeAssessment} className={`${BTN_GHOST} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
                  <HiOutlineTrash className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={() => setAdding(true)} className={BTN_PRIMARY}>
                  <HiOutlineUserAdd className="w-3.5 h-3.5" /> Add candidates
                </button>
              </>
            ) : (
              <button onClick={() => setForm({ open: true, initial: null })} className={BTN_PRIMARY}>
                <HiOutlinePlus className="w-3.5 h-3.5" /> New assessment
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`w-full px-3.5 sm:px-6 lg:px-8 py-5 space-y-4 ${current ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
        {loading ? (
          <div className="py-24 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : !current ? (
          <>
            {items.length > 0 && (
              <div className="relative max-w-md">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assessments…" className={`${INPUT} pl-8`} />
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-16 flex flex-col items-center gap-3 text-center">
                <HiOutlineBadgeCheck className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500 font-medium">
                  {items.length === 0 ? 'No internal assessments yet.' : 'No matches.'}
                </p>
                {items.length === 0 && (
                  <button onClick={() => setForm({ open: true, initial: null })} className={BTN_PRIMARY}>
                    <HiOutlinePlus className="w-3.5 h-3.5" /> Create your first assessment
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {filtered.map((a) => (
                  <AssessmentCard key={a.id} a={a} showOwner={!isDepartment} onOpen={() => setOpenId(a.id)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
            {/* Toolbar: search + certificate progress */}
            <div className="flex-shrink-0 px-4 sm:px-5 py-3 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 sm:max-w-sm">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input value={candSearch} onChange={(e) => setCandSearch(e.target.value)}
                  placeholder="Search candidates…" className={`${INPUT} pl-8 bg-slate-50 focus:bg-white`} />
              </div>
              <div className="sm:ml-auto flex items-center gap-3 text-[11px] text-slate-500 whitespace-nowrap">
                <span><span className="font-semibold text-slate-800">{certCount(current)}</span> of {current.candidates.length} certificates uploaded</span>
                <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${current.candidates.length ? Math.round((certCount(current) / current.candidates.length) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
            {current.description && (
              <p className="flex-shrink-0 max-h-20 overflow-y-auto px-4 sm:px-5 py-2.5 border-b border-slate-100 text-xs text-slate-500 whitespace-pre-line">{current.description}</p>
            )}

            <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_12.5rem] md:items-center md:gap-4 px-4 sm:px-5 py-2 bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Candidate</span>
              <span>Certificate</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <HiOutlineUsers className="w-7 h-7 text-slate-300" />
                  <p className="text-sm text-slate-400 font-medium">
                    {current.candidates.length === 0 ? 'No candidates in this assessment yet.' : 'No matches.'}
                  </p>
                  {current.candidates.length === 0 && (
                    <button onClick={() => setAdding(true)} className={BTN_PRIMARY}>
                      <HiOutlineUserAdd className="w-3.5 h-3.5" /> Add candidates
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {candidates.map((c) => {
                    const busy = busyId === c.id;
                    return (
                    <div key={c.id} className="md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_12.5rem] md:items-center md:gap-4 px-4 sm:px-5 py-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Candidate */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate capitalize" title={c.name}>
                            {c.name}
                            {!c.participant && (
                              <span className="ml-1.5 px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-medium normal-case align-middle">Manual</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{c.email || 'No email'}</p>
                        </div>
                      </div>

                      {/* Certificate status */}
                      <div className="mt-2 md:mt-0 pl-11 md:pl-0 min-w-0">
                        {c.certificate ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <HiOutlineDocumentText className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 truncate" title={c.certificate.original_name}>{c.certificate.original_name}</p>
                              <p className="text-[10px] text-slate-400">Uploaded {fmtDate(c.certificate.uploaded_at)}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {busy ? 'Uploading…' : 'Not uploaded'}
                          </span>
                        )}
                      </div>

                      {/* Actions — one joined control */}
                      <div className="mt-2 md:mt-0 pl-11 md:pl-0 flex md:justify-end">
                        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white divide-x divide-slate-200 overflow-hidden shadow-2xs">
                          {c.certificate ? (
                            <>
                              <button onClick={() => openCert(c, false)} disabled={busy} title="View certificate" className={ACTION}>
                                <HiOutlineEye className="w-4 h-4" />
                              </button>
                              <button onClick={() => openCert(c, true)} disabled={busy} title="Download certificate" className={ACTION}>
                                <HiOutlineDownload className="w-4 h-4" />
                              </button>
                              <button onClick={() => pickFile(c)} disabled={busy} title="Replace certificate" className={ACTION}>
                                <HiOutlineRefresh className="w-4 h-4" />
                              </button>
                              <button onClick={() => removeCert(c)} disabled={busy} title="Delete certificate" className={`${ACTION} ${DANGER}`}>
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => pickFile(c)} disabled={busy} title="Upload a certificate PDF"
                              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors disabled:opacity-50">
                              <HiOutlineUpload className="w-4 h-4" /> Upload
                            </button>
                          )}
                          <button onClick={() => removeCandidate(c)} disabled={busy} title="Remove candidate from assessment" className={`${ACTION} ${DANGER}`}>
                            <HiOutlineUserRemove className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 px-4 sm:px-5 py-2 bg-slate-50/80 border-t border-slate-200/80 text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>{current.created_by_name ? `Created by ${current.created_by_name}` : 'Internal assessment'} · {fmtDate(current.createdAt)}</span>
              <span>Showing {candidates.length} of {current.candidates.length}</span>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFile} />
      <AssessmentFormDialog open={form.open} initial={form.initial}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(a) => { put(a); setForm((f) => ({ ...f, open: false })); if (!form.initial) setOpenId(a.id); }} />
      <AddCandidatesDialog open={adding} assessment={current}
        onClose={() => setAdding(false)}
        onSaved={(a) => { put(a); setAdding(false); }} />
      {ConfirmDialog}
    </div>
  );
}
