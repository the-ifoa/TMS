import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineBadgeCheck, HiOutlineSearch, HiOutlinePlus, HiOutlineArrowLeft, HiOutlineEye,
  HiOutlineDownload, HiOutlineTrash, HiOutlineUpload, HiOutlinePencil, HiOutlineUserAdd,
  HiOutlineCalendar, HiOutlineUsers, HiOutlineX, HiOutlineRefresh,
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

const MAX_BYTES = 10 * 1024 * 1024;

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const AVATAR_TONES = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
];

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Stable colour per candidate name.
function avatarTone(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

const certCount = (a) => a.candidates.filter((c) => c.certificate).length;

const INPUT = 'w-full h-9 px-3 bg-white border border-slate-200/80 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-colors';
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
          <DialogDescription>Your own assessment — add candidates and their certificates afterwards.</DialogDescription>
        </DialogHeader>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">Title</span>
            <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Ramp Safety Assessment — Q4" className={`${INPUT} mt-1`} />
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
          <div className="mt-3 inline-flex p-0.5 bg-slate-100 border border-slate-200/80 rounded-lg">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-semibold transition-colors ${
                  tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t.label}
                {t.n > 0 && <span className={tab === t.key ? 'text-white/70' : 'text-slate-400'}>{t.n}</span>}
              </button>
            ))}
          </div>
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
                  {people.length === 0 ? 'No participants yet — add candidates manually.' : 'No participants left to add.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {available.map((p) => {
                    const id = String(p.id || p._id);
                    return (
                      <label key={id} className="flex items-center gap-3 px-5 py-2 cursor-pointer hover:bg-slate-50/60">
                        <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)}
                          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${avatarTone(p.participant_name)}`}>
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

// One assessment as a card in the grid.
function AssessmentCard({ a, showOwner, onOpen }) {
  const total = a.candidates.length;
  const certs = certCount(a);
  const pct = total ? Math.round((certs / total) * 100) : 0;
  return (
    <button onClick={onOpen}
      className="group text-left bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
          <HiOutlineBadgeCheck className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors" title={a.title}>{a.title}</p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
            <HiOutlineCalendar className="w-3 h-3" /> {a.assessment_date ? fmtDate(a.assessment_date) : 'No date set'}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 line-clamp-2 min-h-[2rem]">{a.description || 'No description.'}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex -space-x-2">
          {a.candidates.slice(0, 5).map((c) => (
            <div key={c.id} title={c.name}
              className={`w-7 h-7 rounded-full ring-2 ring-white flex items-center justify-center text-[9px] font-bold ${avatarTone(c.name)}`}>
              {initials(c.name)}
            </div>
          ))}
          {total > 5 && (
            <div className="w-7 h-7 rounded-full ring-2 ring-white bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold">+{total - 5}</div>
          )}
          {total === 0 && <span className="text-[11px] text-slate-400">No candidates yet</span>}
        </div>
        {showOwner && a.created_by_name && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold truncate max-w-[45%]">{a.created_by_name}</span>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] font-medium">
          <span className="text-slate-600 inline-flex items-center gap-1"><HiOutlineUsers className="w-3.5 h-3.5 text-slate-400" /> {total} candidate{total === 1 ? '' : 's'}</span>
          <span className="text-slate-400">{certs}/{total} certificates</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
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
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({ open: false, initial: null });
  const [adding, setAdding] = useState(false);
  const [candSearch, setCandSearch] = useState('');
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
    <div className="w-full min-h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
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
                  {current ? current.candidates.length : items.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {current
                  ? `${current.assessment_date ? fmtDate(current.assessment_date) : 'No date set'} · ${certCount(current)}/${current.candidates.length} certificates uploaded`
                  : `Your ${isDepartment ? "department's" : "airline's"} own assessments — add candidates and upload a certificate for each.`}
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

      <div className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 space-y-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((a) => (
                  <AssessmentCard key={a.id} a={a} showOwner={!isDepartment} onOpen={() => setOpenId(a.id)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
            {(current.description || current.candidates.length > 0) && (
              <div className="p-3 border-b border-slate-200/80 space-y-2.5">
                {current.description && <p className="text-xs text-slate-600 whitespace-pre-line">{current.description}</p>}
                {current.candidates.length > 0 && (
                  <div className="relative">
                    <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input value={candSearch} onChange={(e) => setCandSearch(e.target.value)}
                      placeholder="Search candidates…" className={`${INPUT} pl-8 bg-slate-50 focus:bg-white`} />
                  </div>
                )}
              </div>
            )}

            <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_9rem] md:gap-4 px-4 py-2 bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Candidate</span>
              <span>Certificate</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="h-[calc(100vh-19rem)] min-h-[18rem] overflow-y-auto">
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
                  {candidates.map((c) => (
                    <div key={c.id} className="md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_9rem] md:items-center md:gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${avatarTone(c.name)}`}>
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate capitalize" title={c.name}>
                            {c.name}
                            {!c.participant && (
                              <span className="ml-1.5 px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-semibold normal-case align-middle">Manual</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{c.email || 'No email'}</p>
                        </div>
                      </div>

                      <div className="mt-2 md:mt-0 min-w-0">
                        {c.certificate ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100 text-[9px] font-extrabold flex-shrink-0">PDF</span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate" title={c.certificate.original_name}>{c.certificate.original_name}</p>
                              <p className="text-[10px] text-slate-400">Uploaded {fmtDate(c.certificate.uploaded_at)}</p>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => pickFile(c)} disabled={busyId === c.id}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-slate-300 text-[11px] font-semibold text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 transition-colors">
                            <HiOutlineUpload className="w-3.5 h-3.5" /> {busyId === c.id ? 'Uploading…' : 'Upload certificate'}
                          </button>
                        )}
                      </div>

                      <div className="mt-2 md:mt-0 flex items-center gap-1 md:justify-end">
                        {c.certificate && (
                          <>
                            <button onClick={() => openCert(c, false)} disabled={busyId === c.id} title="View certificate"
                              className={`${ICON_BTN} hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600`}>
                              <HiOutlineEye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openCert(c, true)} disabled={busyId === c.id} title="Download certificate"
                              className={`${ICON_BTN} hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600`}>
                              <HiOutlineDownload className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => pickFile(c)} disabled={busyId === c.id} title="Replace certificate"
                              className={`${ICON_BTN} hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600`}>
                              <HiOutlineRefresh className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeCert(c)} disabled={busyId === c.id} title="Delete certificate"
                              className={`${ICON_BTN} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => removeCandidate(c)} disabled={busyId === c.id} title="Remove candidate"
                          className={`${ICON_BTN} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
                          <HiOutlineX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-200/80 text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>{current.created_by_name ? `Created by ${current.created_by_name}` : 'Internal assessment'} · {fmtDate(current.createdAt)}</span>
              <span>{candidates.length} of {current.candidates.length}</span>
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
