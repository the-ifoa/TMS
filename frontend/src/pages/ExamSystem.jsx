import { useEffect, useRef, useState } from 'react';
import { useHistoryState } from '@/hooks/use-history-state';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineAcademicCap, HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash,
  HiOutlineUserAdd, HiOutlineClipboardCheck,
  HiOutlineSearch, HiOutlineX, HiOutlineUserGroup, HiChevronRight,
  HiOutlineClock, HiOutlineDocumentText, HiOutlineMail, HiOutlineCheckCircle,
  HiOutlinePaperAirplane, HiOutlineCollection, HiOutlineRefresh, HiOutlineChatAlt2,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import LogoAvatar from '../components/LogoAvatar';
import FeedbackDialog from '../components/FeedbackDialog';
import ExamHelpButton from '../components/ExamHelpGuide';
import { listExams, deleteExam, publishExam, getExamAirlines, updateExam, sendExamInvites, reassignExamInvites, getExamInvites, removeExamCandidate, getExamAssignments, addQuickParticipant, keepQuickParticipant } from '../api';
import { useAuth } from '../context/AuthContext';
import QuestionBankList from './QuestionBank';
import { DateTimeInputCard } from './ExamBuilder';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useConfirm } from '@/hooks/use-confirm';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const STATUS_VARIANT = { draft: 'amber', published: 'emerald', archived: 'default' };

// ─── Send-invite modal — emails the passwordless take-link to participants ────
// Shows every participant grouped by airline WITH their email and current
// invite/attempt status, so the admin can review who's been sent/completed and
// send (or re-send) links to those who have an email.
const INVITE_BADGE = {
  sent:        { label: 'Sent',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  opened:      { label: 'Opened',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In Progress',cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  completed:   { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function SendInviteModal({ exam, onClose, onSent }) {
  const [groups, setGroups] = useState([]);
  const [inviteByPid, setInviteByPid] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [reassigningPid, setReassigningPid] = useState(null);
  const [removingPid, setRemovingPid] = useState(null);
  // Candidates an Assign skipped because they have no attempts left or already
  // passed — offered a Reassign in a popup ([{ id, name, passed }]).
  const [needsReassign, setNeedsReassign] = useState([]);
  const [reassigningAll, setReassigningAll] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  // "Add participant" — create someone on the go (kept permanently, or only
  // for this exam) and pre-select them for Assign.
  const { isAdmin } = useAuth();
  const emptyRow = () => ({ name: '', email: '' });
  const emptyAdd = { rows: [emptyRow()], airline_id: '', keep: true };
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [adding, setAdding] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const setRow = (i, patch) => setAddForm((f) => ({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  // Take one candidate off this exam: assignment, invite link and any result.
  const removeCandidate = async (pid, name, inv) => {
    const hasResult = !!inv?.attempt;
    const ok = await confirm(
      hasResult
        ? `Remove ${name} from this exam? Their result, answers and any uploaded certificate are deleted, and their exam link stops working. This cannot be undone.`
        : `Remove ${name} from this exam? Their exam link will stop working. You can assign them again later.`,
      { title: 'Remove candidate', confirmLabel: 'Remove' },
    );
    if (!ok) return;
    setRemovingPid(pid);
    try {
      await removeExamCandidate(exam.id, pid);
      toast.success(`${name} removed from the exam.`);
      setInviteByPid((prev) => { const n = { ...prev }; delete n[String(pid)]; return n; });
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove the candidate.');
    } finally {
      setRemovingPid(null);
    }
  };
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  // Validity window for the emailed link. 'none' = never expires; a number = days
  // from now; 'custom' = an explicit cutoff date/time.
  const [validityMode, setValidityMode] = useState('none');
  const [customExpiry, setCustomExpiry] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([getExamAirlines({ exam_id: exam.id, include_empty: 1 }), getExamInvites(exam.id)])
      .then(([airRes, invRes]) => {
        // The airline this exam is "for" goes first and starts open.
        const forId = exam.for_airline ? String(exam.for_airline) : '';
        setGroups(forId ? [...airRes.data].sort((a, b) => (String(b.airline._id) === forId) - (String(a.airline._id) === forId)) : airRes.data);
        if (forId) setExpanded((prev) => new Set(prev).add(airRes.data.find((g) => String(g.airline._id) === forId)?.airline._id));
        setInviteByPid(Object.fromEntries((invRes.data || []).map((i) => [String(i.participant_id), i])));
      })
      .catch(() => toast.error('Failed to load participants.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [exam.id]);

  const hasEmail = (p) => !!(p.email && p.email.trim());
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Resolve the "link valid for" dropdown into API opts. Returns null on a bad
  // custom date (after toasting).
  const resolveOpts = () => {
    if (validityMode === 'custom') {
      if (!customExpiry) { toast.error('Pick an expiry date.'); return null; }
      const d = new Date(customExpiry);
      if (isNaN(d.getTime()) || d.getTime() <= Date.now()) { toast.error('Expiry must be in the future.'); return null; }
      return { expires_at: d.toISOString() };
    }
    if (validityMode !== 'none') return { valid_days: Number(validityMode) };
    return {};
  };

  const reassign = async (pid, name) => {
    const opts = resolveOpts();
    if (opts === null) return false;
    setReassigningPid(pid);
    try {
      const res = await reassignExamInvites(exam.id, [pid], opts);
      const { sent = [], skipped = [] } = res.data || {};
      if (sent.length) toast.success(`${name} reassigned — a fresh exam link was emailed.`);
      else toast.error(`Reassign failed (${skipped[0]?.reason || 'unknown'}).`);
      load();
      onSent?.();
      return sent.length > 0;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign.');
      return false;
    } finally {
      setReassigningPid(null);
    }
  };

  // From the "no attempts left" popup: reassign one person, or everyone listed.
  const reassignFromPopup = async (person) => {
    if (await reassign(person.id, person.name)) setNeedsReassign((list) => list.filter((x) => x.id !== person.id));
  };
  const reassignAllFromPopup = async () => {
    const opts = resolveOpts();
    if (opts === null) return;
    setReassigningAll(true);
    try {
      const res = await reassignExamInvites(exam.id, needsReassign.map((x) => x.id), opts);
      const { sent = [], skipped = [] } = res.data || {};
      if (sent.length) toast.success(`${sent.length} reassigned — fresh exam link${sent.length > 1 ? 's' : ''} emailed.`);
      if (skipped.length) toast.error(`${skipped.length} not reassigned (${skipped[0].reason}).`);
      const done = new Set(sent.map((x) => String(x.id)));
      setNeedsReassign((list) => list.filter((x) => !done.has(String(x.id))));
      load();
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign.');
    } finally {
      setReassigningAll(false);
    }
  };

  const send = async () => {
    if (selected.size === 0) return;
    const opts = resolveOpts();
    if (opts === null) return;
    setSending(true);
    try {
      const res = await sendExamInvites(exam.id, [...selected], opts);
      const { sent = [], skipped = [] } = res.data || {};
      // No attempts left / already passed → offer a Reassign in a popup instead of a toast.
      const REASSIGN_CODES = ['no_attempts_left', 'already_passed'];
      const outOfAttempts = skipped.filter((x) => REASSIGN_CODES.includes(x.code));
      const otherSkips = skipped.filter((x) => !REASSIGN_CODES.includes(x.code));
      if (sent.length) toast.success(`${sent.length} participant${sent.length > 1 ? 's' : ''} assigned, exam link${sent.length > 1 ? 's' : ''} emailed.`);
      if (otherSkips.length) toast(`${otherSkips.length} skipped (${otherSkips[0].reason}${otherSkips.length > 1 ? ', …' : ''}).`, { icon: 'ℹ️' });
      if (outOfAttempts.length) setNeedsReassign(outOfAttempts.map((x) => ({ id: x.id, name: x.name, passed: x.code === 'already_passed' })));
      setSelected(new Set());
      load();
      onSent?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign.');
    } finally {
      setSending(false);
    }
  };

  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // "Name, email" / "Name <email>" / "Name<TAB>email" / just an email — one per line.
  const parsePasted = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const email = (line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/) || [''])[0];
    let name = line.replace(email, '').replace(/[<>,;\t]+/g, ' ').trim().replace(/\s+/g, ' ');
    if (!name && email) name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { name, email };
  });
  const applyPaste = () => {
    const rows = parsePasted(pasteText);
    if (!rows.length) { toast.error('Paste one person per line: Name, email'); return; }
    setAddForm((f) => ({ ...f, rows: [...f.rows.filter((r) => r.name.trim() || r.email.trim()), ...rows] }));
    setPasteText('');
    setPasteOpen(false);
  };

  const submitAdd = async (e) => {
    e?.preventDefault();
    const rows = addForm.rows.filter((r) => r.name.trim() || r.email.trim());
    const airlineId = addForm.airline_id || (!isAdmin && groups.length === 1 ? String(groups[0].airline._id) : '');
    if (!rows.length) { toast.error('Add at least one participant.'); return; }
    const bad = rows.findIndex((r) => !r.name.trim() || !EMAIL_OK.test(r.email.trim()));
    if (bad >= 0) { toast.error(`Row ${bad + 1}: enter a name and a valid email.`); return; }
    if (!airlineId) { toast.error(isAdmin ? 'Choose an airline, or "No airline".' : 'Choose the airline.'); return; }
    setAdding(true);
    try {
      const res = await addQuickParticipant(exam.id, { people: rows.map((r) => ({ name: r.name.trim(), email: r.email.trim() })), airline_id: airlineId, keep: addForm.keep });
      const { results = [], created = 0, reused = 0, failed = 0 } = res.data;
      const added = results.filter((r) => r.participant);
      const parts = [];
      if (created) parts.push(`${created} added${addForm.keep ? '' : ' for this exam only'}`);
      if (reused) parts.push(`${reused} already existed`);
      if (added.length) toast.success(`${parts.join(', ')} — selected. Click Assign to email the exam link${added.length > 1 ? 's' : ''}.`, { duration: 6000 });
      if (failed) toast.error(`${failed} not added: ${results.filter((r) => r.error).map((r) => `${r.email || r.name} (${r.error})`).join(', ')}`, { duration: 8000 });
      setSelected((prev) => { const n = new Set(prev); added.forEach((r) => n.add(r.participant._id)); return n; });
      setExpanded((prev) => { const n = new Set(prev); added.forEach((r) => n.add(r.participant.airline_id)); return n; });
      // Keep the rows that failed so they can be fixed and re-sent.
      const failedEmails = new Set(results.filter((r) => r.error).map((r) => r.email));
      const leftover = rows.filter((r) => failedEmails.has(r.email.trim().toLowerCase()));
      setAddForm({ ...emptyAdd, rows: leftover.length ? leftover : [emptyRow()], airline_id: airlineId, keep: addForm.keep });
      if (!leftover.length) setAddOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add the participants.');
    } finally {
      setAdding(false);
    }
  };

  const keepPermanently = async (p) => {
    try {
      await keepQuickParticipant(exam.id, p._id);
      toast.success(`${p.participant_name} is now a permanent participant.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update the participant.');
    }
  };

  const filteredGroups = groups
    .map((g) => {
      const matchAir = g.airline.airlineName.toLowerCase().includes(search.toLowerCase());
      const parts = g.participants.filter((p) => matchAir || p.participant_name.toLowerCase().includes(search.toLowerCase()) || (p.email || '').toLowerCase().includes(search.toLowerCase()));
      return { ...g, participants: parts };
    })
    .filter((g) => g.participants.length > 0);

  const sendableInGroup = (parts) => parts.filter(hasEmail);

  // Departments rarely have their own logo — fall back to the parent airline's.
  const logoById = Object.fromEntries(groups.map((g) => [String(g.airline._id), g.airline.logo_url]));
  const logoFor = (a) => a.logo_url || (a.parent_airline && logoById[String(a.parent_airline)]) || null;
  const groupName = (a) => (a.is_department ? (a.department_name || a.name || a.airlineName) : a.airlineName) || '';
  const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="max-w-2xl w-[92vw] h-[85vh] max-h-[750px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100 bg-white space-y-0 text-left">
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0"><HiOutlineMail className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-snug line-clamp-2">
                Assign &ldquo;{exam.title}&rdquo; to participants
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Each assigned participant gets a personal, passwordless exam link by email. Participants without an email can't be assigned. Use <span className="font-semibold text-slate-700">Reassign</span> on someone who already finished — passed or failed — to let them take the exam again with a fresh link.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-2 -mt-1 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <button type="button" onClick={() => setAddOpen((o) => !o)}
              className={`h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 ${addOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
              <HiOutlineUserAdd className="w-4 h-4" /> Add participants
            </button>
            <div className="relative flex-1 min-w-0">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text" placeholder="Search participant, email or airline…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">Link valid for</span>
              <Select
                value={validityMode}
                onValueChange={(val) => setValidityMode(val)}
              >
                <SelectTrigger className="h-9 w-auto min-w-[130px] px-2.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200/90 rounded-xl outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs font-medium">No expiry</SelectItem>
                  <SelectItem value="1" className="text-xs font-medium">1 day</SelectItem>
                  <SelectItem value="3" className="text-xs font-medium">3 days</SelectItem>
                  <SelectItem value="7" className="text-xs font-medium">7 days</SelectItem>
                  <SelectItem value="14" className="text-xs font-medium">14 days</SelectItem>
                  <SelectItem value="30" className="text-xs font-medium">30 days</SelectItem>
                  <SelectItem value="custom" className="text-xs font-medium">Until a date…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {validityMode === 'custom' && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:justify-end">
              <input
                type="datetime-local"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                className="h-9 px-2.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200/90 rounded-xl outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          )}
          {validityMode !== 'none' && (
            <p className="mt-2 text-[11px] text-slate-400 sm:text-right">After this the exam link stops working.</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-2.5 bg-slate-50/60">
          {addOpen && (
            <form onSubmit={submitAdd} className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Add participants</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">They are selected straight away — click Assign to email their exam links.</p>
                </div>
                <button type="button" onClick={() => setPasteOpen((o) => !o)} className="text-[11px] font-bold text-blue-700 hover:text-blue-900 whitespace-nowrap">
                  {pasteOpen ? 'Hide paste box' : 'Paste a list'}
                </button>
              </div>

              {pasteOpen && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 space-y-2">
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} autoFocus
                    placeholder={'One person per line, e.g.\nJohn Smith, john@airline.com\nJane Doe <jane@airline.com>\nalex@airline.com'}
                    className="w-full px-3 py-2 bg-white border border-slate-200/90 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-y" />
                  <div className="flex justify-end">
                    <Button type="button" onClick={applyPaste} className="rounded-lg text-[11px] font-bold h-7 px-3 bg-slate-900 hover:bg-slate-800 text-white">Add to list</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {addForm.rows.map((r, i) => {
                  const emailBad = r.email.trim() && !EMAIL_OK.test(r.email.trim());
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-[11px] font-bold text-slate-400 tabular-nums text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Full name" maxLength={120} autoFocus={i === addForm.rows.length - 1 && !pasteOpen}
                          className="h-9 px-3 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
                        <input type="email" value={r.email} onChange={(e) => setRow(i, { email: e.target.value })} placeholder="Email address" maxLength={200}
                          className={`h-9 px-3 bg-slate-50 border rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${emailBad ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200/90'}`} />
                      </div>
                      <button type="button" aria-label="Remove row" disabled={addForm.rows.length === 1}
                        onClick={() => setAddForm((f) => ({ ...f, rows: f.rows.filter((_, j) => j !== i) }))}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 flex-shrink-0">
                        <HiOutlineX className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setAddForm((f) => ({ ...f, rows: [...f.rows, emptyRow()] }))} disabled={addForm.rows.length >= 50}
                  className="ml-7 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 disabled:opacity-40">
                  <HiOutlinePlusCircle className="w-4 h-4" /> Add another
                </button>
              </div>

              {(isAdmin || groups.length > 1) && (
                <Select value={addForm.airline_id} onValueChange={(v) => setAddForm((f) => ({ ...f, airline_id: v }))}>
                  <SelectTrigger className="h-9 px-3 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200/90 rounded-xl">
                    <SelectValue placeholder="Airline / department (or no airline)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {isAdmin && <SelectItem value="none" className="text-xs font-semibold">No airline (individual)</SelectItem>}
                    {[...groups].filter((g) => !g.airline.is_none).sort((a, b) => groupName(a.airline).localeCompare(groupName(b.airline))).map(({ airline }) => (
                      <SelectItem key={airline._id} value={String(airline._id)} className="text-xs font-medium">
                        {groupName(airline)}{airline.is_department ? ' · department' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  [true, 'Keep permanently', 'Saved to the participant list for future exams and certificates.'],
                  [false, 'Only for this exam', 'Not added to the participant list — used for this exam only.'],
                ].map(([keep, title, help]) => (
                  <button key={title} type="button" onClick={() => setAddForm((f) => ({ ...f, keep }))}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${addForm.keep === keep ? 'border-slate-900 bg-slate-900/[0.03] ring-1 ring-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${addForm.keep === keep ? 'border-slate-900' : 'border-slate-300'}`}>
                        {addForm.keep === keep && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                      </span>
                      {title}
                    </span>
                    <span className="block mt-1 pl-[22px] text-[11px] leading-snug text-slate-500">{help}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setAddOpen(false); setAddForm(emptyAdd); setPasteOpen(false); }} className="rounded-xl text-xs font-bold h-8">Cancel</Button>
                <Button type="submit" disabled={adding} className="rounded-xl text-xs font-bold h-8 bg-slate-900 hover:bg-slate-800 text-white">
                  {adding ? 'Adding…' : (() => { const n = addForm.rows.filter((r) => r.name.trim() || r.email.trim()).length; return n > 1 ? `Add ${n} & select` : 'Add & select'; })()}
                </Button>
              </div>
            </form>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading participants…</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <HiOutlineUserGroup className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No participants match your filter.</p>
            </div>
          ) : (
            filteredGroups.map(({ airline, participants }) => {
              const sendable = sendableInGroup(participants);
              const allSel = sendable.length > 0 && sendable.every((p) => selected.has(p._id));
              const isOpen = search.trim() !== '' || expanded.has(airline._id);
              return (
                <div key={airline._id} className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div onClick={() => toggleExpand(airline._id)} className="px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 select-none">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <HiChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90 text-slate-600' : ''}`} />
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center flex-shrink-0">
                        <LogoAvatar logoUrl={logoFor(airline)} name={groupName(airline)} initials={initialsOf(groupName(airline))} size="w-8 h-8" textSize="text-[10px]" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 truncate">{groupName(airline)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-bold">{participants.length}</span>
                    </div>
                    {sendable.length > 0 && (
                      <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setSelected((prev) => { const n = new Set(prev); allSel ? sendable.forEach((p) => n.delete(p._id)) : sendable.forEach((p) => n.add(p._id)); return n; }); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border select-none cursor-pointer ${allSel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                        {allSel ? 'Selected' : `Select ${sendable.length}`}
                      </div>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-slate-100 bg-white">
                        <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                          {participants.map((p) => {
                            const email = hasEmail(p);
                            const inv = inviteByPid[String(p._id)];
                            const badge = inv && INVITE_BADGE[inv.status];
                            const isChecked = selected.has(p._id);
                            const ini = p.participant_name ? p.participant_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'ST';
                            return (
                              <div key={p._id}
                                onClick={() => email && toggle(p._id)}
                                className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 rounded-xl border transition-all ${
                                  !email ? 'bg-slate-50/70 border-slate-100 opacity-70 cursor-not-allowed'
                                  : isChecked ? 'bg-slate-900/5 border-slate-900/30 cursor-pointer shadow-2xs'
                                  : 'bg-white border-slate-100 hover:bg-slate-50 cursor-pointer'}`}>
                                <div className="flex items-center gap-2.5 min-w-[12rem] flex-1">
                                  <Checkbox disabled={!email} checked={isChecked} onCheckedChange={() => email && toggle(p._id)} className="w-4 h-4 flex-shrink-0" />
                                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-extrabold text-slate-600 flex-shrink-0">{ini}</div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">{p.participant_name}</p>
                                    {email ? (
                                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1"><HiOutlineMail className="w-3 h-3" />{p.email}</p>
                                    ) : (
                                      <p className="text-[11px] text-rose-500 font-semibold truncate">No email on file</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-1.5 flex-wrap ml-auto">
                                  {p.temporary && (
                                    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-bold border bg-violet-50 text-violet-700 border-violet-200" title="Added for this exam only — not in the participant list">
                                      This exam only
                                      <button type="button" onClick={(e) => { e.stopPropagation(); keepPermanently(p); }}
                                        className="px-1.5 rounded-full bg-white border border-violet-200 hover:bg-violet-100">Keep</button>
                                    </span>
                                  )}
                                  {inv?.expires_at && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      new Date(inv.expires_at) < new Date()
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}>
                                      {new Date(inv.expires_at) < new Date() ? 'Expired' : `Until ${new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                                    </span>
                                  )}
                                  {badge && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>{badge.label}</span>
                                  )}
                                  {inv?.attempt && inv.attempt.percentage != null && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${inv.attempt.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                      {inv.attempt.percentage}%
                                    </span>
                                  )}
                                  {inv?.attempts_allowed != null && (
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border tabular-nums ${inv.needs_reassign ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                      title={`${inv.attempts_used} of ${inv.attempts_allowed} attempts used${inv.bonus_attempts > 0 ? ` (${inv.bonus_attempts} extra granted by reassign)` : ''}`}
                                    >
                                      Attempts {inv.attempts_used}/{inv.attempts_allowed}
                                    </span>
                                  )}
                                  {inv?.needs_reassign && (inv.passed_in_cycle ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300" title="Already passed — Assign won't send anything. Use Reassign to let them take the exam again.">
                                      Passed · reassign to retake
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-300" title="All attempts used — Assign won't send anything. Use Reassign to give a new attempt.">
                                      No attempts left
                                    </span>
                                  ))}
                                  {email && inv && (inv.status === 'completed' || inv.attempt || inv.attempts_used > 0) && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); reassign(p._id, p.participant_name); }}
                                      disabled={reassigningPid === p._id}
                                      title="Email a fresh link and let this participant take the exam again"
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 ${inv.needs_reassign ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                    >
                                      <HiOutlineRefresh className={`w-3 h-3 ${reassigningPid === p._id ? 'animate-spin' : ''}`} />
                                      {reassigningPid === p._id ? 'Reassigning…' : 'Reassign'}
                                    </button>
                                  )}
                                  {inv && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); removeCandidate(p._id, p.participant_name, inv); }}
                                      disabled={removingPid === p._id}
                                      title="Remove this candidate from the exam"
                                      className="p-1 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                                    >
                                      <HiOutlineTrash className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">
            {selected.size > 0 ? <span className="text-slate-900 font-bold">{selected.size} selected</span> : 'No participants selected'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-bold">Close</Button>
            <Button variant="primary" onClick={send} disabled={sending || selected.size === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold px-4 py-2 shadow-2xs flex items-center gap-1.5">
              <HiOutlinePaperAirplane className="w-4 h-4 rotate-45" />
              {sending ? 'Assigning…' : `Assign (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
        {ConfirmDialog}
      </DialogContent>

      {/* Assign skipped people who have used every attempt — offer to reassign them. */}
      <Dialog open={needsReassign.length > 0} onOpenChange={(open) => { if (!open && !reassigningAll && !reassigningPid) setNeedsReassign([]); }}>
        {/* Closes only via its buttons / Esc — a button disabling itself while it
            works moves focus, which Radix would otherwise treat as "clicked outside". */}
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden"
          onInteractOutside={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
          <DialogHeader className="px-6 pt-6 pb-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-black text-slate-900">
              <HiOutlineRefresh className="w-5 h-5 text-amber-600" />
              {needsReassign.length === 1
                ? (needsReassign[0].passed ? 'Already passed' : 'No attempts left')
                : `${needsReassign.length} candidates need a reassign`}
            </DialogTitle>
            <p className="text-xs leading-relaxed text-slate-500">
              {needsReassign.length === 1 ? 'This candidate has' : 'These candidates have'} already passed or used all {exam.max_attempts} attempt{exam.max_attempts === 1 ? '' : 's'}, so assigning again doesn't send anything.
              {' '}<span className="font-semibold text-slate-700">Reassign</span> lets them take the exam again — passed or not — and emails a fresh link (the old link stops working). Their earlier results are kept.
            </p>
          </DialogHeader>
          <div className="px-6 pb-2 max-h-64 overflow-y-auto space-y-2">
            {needsReassign.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 truncate">{person.name}</span>
                  <span className={`block text-[11px] font-semibold ${person.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {person.passed ? 'Already passed' : 'No attempts left'}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => reassignFromPopup(person)}
                  disabled={reassigningAll || reassigningPid === person.id}
                  className="rounded-xl text-xs font-bold border-amber-300 text-amber-700 hover:bg-amber-50 flex items-center gap-1.5 flex-shrink-0">
                  <HiOutlineRefresh className={`w-3.5 h-3.5 ${reassigningPid === person.id ? 'animate-spin' : ''}`} />
                  {reassigningPid === person.id ? 'Reassigning…' : 'Reassign'}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setNeedsReassign([])} disabled={reassigningAll || !!reassigningPid} className="rounded-xl text-xs font-bold">Not now</Button>
            {needsReassign.length > 1 && (
              <Button onClick={reassignAllFromPopup} disabled={reassigningAll || !!reassigningPid}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold px-4">
                {reassigningAll ? 'Reassigning…' : `Reassign all (${needsReassign.length})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ─── Assigned-participants list — opened from the card's "N Assigned" chip ────
function attemptBadge(attempt, reassigned) {
  if (!attempt) return reassigned
    ? { label: 'Reassigned · not started', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    : { label: 'Not started', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (attempt.status === 'in_progress') return { label: 'In progress', cls: 'bg-violet-50 text-violet-700 border-violet-200' };
  if (attempt.passed === true) return { label: `Passed${attempt.percentage != null ? ` · ${Math.round(attempt.percentage)}%` : ''}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (attempt.passed === false) return { label: `Failed${attempt.percentage != null ? ` · ${Math.round(attempt.percentage)}%` : ''}`, cls: 'bg-rose-50 text-rose-700 border-rose-200' };
  return { label: 'Awaiting grading', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
}

function AssignedListModal({ exam, canReassign, onClose, onChanged }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [reassigningPid, setReassigningPid] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => getExamAssignments(exam.id)
    .then((res) => setRows(res.data || []))
    .catch(() => { toast.error('Failed to load assigned participants'); setRows([]); });
  useEffect(() => { load(); }, [exam.id]);

  // Let someone who finished — passed or failed — take the exam again.
  const reassign = async (r) => {
    const passed = r.attempt?.passed === true;
    const ok = await confirm(
      `${passed ? `${r.name} has already passed.` : `Let ${r.name} take the exam again?`} Reassign emails them a fresh exam link (the old one stops working) and gives them a new attempt. Their earlier result is kept.`,
      { title: 'Reassign exam', confirmLabel: 'Reassign' },
    );
    if (!ok) return;
    setReassigningPid(r.participant_id);
    try {
      const res = await reassignExamInvites(exam.id, [r.participant_id]);
      const { sent = [], skipped = [] } = res.data || {};
      if (sent.length) toast.success(`${r.name} reassigned — a fresh exam link was emailed.`);
      else toast.error(`Reassign failed (${skipped[0]?.reason || 'unknown'}).`);
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign.');
    } finally {
      setReassigningPid(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = (rows || []).filter((r) => !q
    || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.airline.toLowerCase().includes(q));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[92vw] max-h-[80vh] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-100 space-y-0 text-left">
          <DialogTitle className="text-base font-bold text-slate-900 leading-snug pr-6">Assigned participants</DialogTitle>
          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
            {exam.title}{rows ? ` · ${rows.length} ${rows.length === 1 ? 'person' : 'people'}` : ''}
          </p>
          {rows && rows.length > 6 && (
            <div className="relative mt-3">
              <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or airline"
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {!rows ? (
            <div className="py-10 flex justify-center">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {rows.length === 0 ? 'Nobody is assigned to this exam yet.' : 'No matches.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((r) => {
                const badge = attemptBadge(r.attempt, r.reassigned);
                const finished = r.attempt && r.attempt.status !== 'in_progress';
                return (
                  <li key={r.participant_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {[r.airline, r.email].filter(Boolean).join(' · ') || '—'}
                        {r.assigned_at && ` · assigned ${new Date(r.assigned_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {canReassign && finished && r.email && (
                      <SimpleTooltip label="Email a fresh link so they can take the exam again">
                        <button
                          type="button"
                          onClick={() => reassign(r)}
                          disabled={reassigningPid === r.participant_id}
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                        >
                          <HiOutlineRefresh className={`w-3 h-3 ${reassigningPid === r.participant_id ? 'animate-spin' : ''}`} />
                          {reassigningPid === r.participant_id ? 'Reassigning…' : 'Reassign'}
                        </button>
                      </SimpleTooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}

export default function ExamSystem() {
  const navigate = useNavigate();
  const { isAdmin, isDepartment, admin, can } = useAuth();
  const selfId = String(admin?._id || admin?.id || '');
  const base = isAdmin ? '/admin/exams' : '/airline/exams';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = !isAdmin ? 'exams'
    : tabParam === 'question-bank' ? 'question-bank'
    : tabParam === 'airline-exams' ? 'airline-exams'
    : 'exams';

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendTarget, setSendTarget] = useState(null);
  const [assignedTarget, setAssignedTarget] = useState(null);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  // Height of the sticky page header — the search / filter bars stick just
  // below it (via --sticky-top), here and in the embedded question bank list.
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [bankShowCreate, setBankShowCreate] = useState(false);
  const [examSearch, setExamSearch] = useHistoryState('examSearch', '');
  const [statusFilter, setStatusFilter] = useHistoryState('statusFilter', 'all');
  const [ownerFilter, setOwnerFilter] = useHistoryState('ownerFilter', 'all'); // airline-exams tab: filter by airline/department
  const { confirm, ConfirmDialog } = useConfirm();

  const setActiveTab = (tab) => {
    if (tab === 'exams') setSearchParams({});
    else setSearchParams({ tab });
  };

  // Airlines manage only the exams they own here; exams merely assigned to them
  // live in the "Exam Results" view.
  // Deleted exams come too: they're hidden unless the status filter is
  // "Deleted", where their cards only open Results.
  const load = () => listExams({ include_deleted: 1 })
    .then((res) => setExams(isAdmin ? res.data : res.data.filter((e) => e.owner_airline)))
    .catch(() => toast.error('Failed to load exams.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handlePublish = async (exam) => {
    try {
      await publishExam(exam.id);
      toast.success('Exam published.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to publish exam.');
    }
  };

  const handleDelete = async (exam) => {
    const ok = await confirm(
      `Delete "${exam.title}"? It is removed from this list and can no longer be edited, assigned or taken, and any open exam links stop working. Its results are kept for reports and dashboards. Choose "Deleted" in the status filter to see it again.`,
      { title: 'Delete exam', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    try {
      await deleteExam(exam.id);
      toast.success('Exam deleted. Its results are kept.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete exam.');
    }
  };

  // Admin view splits exams into airline-created vs IFOA-created; airline view
  // only ever has its own exams so it renders as one list.
  // "Deleted" filter shows only deleted exams; every other view hides them.
  const showDeleted = statusFilter === 'deleted';
  const shown = exams.filter((e) => !!e.deleted_at === showDeleted);
  const airlineExams = shown.filter((e) => e.owner_airline);
  const ifoaExams = shown.filter((e) => !e.owner_airline);
  // Tab counts never include deleted exams.
  const liveExams = exams.filter((e) => !e.deleted_at);
  const liveCount = { ifoa: liveExams.filter((e) => !e.owner_airline).length, airline: liveExams.filter((e) => e.owner_airline).length };

  // Readable owner label used by the airline-exams tab filter.
  const ownerLabel = (e) =>
    `${e.owner_airline_name || 'Airline'}${e.owner_department_name ? ` · ${e.owner_department_name}` : ''}`;
  const ownerOptions = [...new Set(airlineExams.map(ownerLabel))].sort();

  const applyExamFilters = (list) => {
    const q = examSearch.trim().toLowerCase();
    return list.filter((e) => {
      if (statusFilter !== 'all' && statusFilter !== 'deleted' && e.status !== statusFilter) return false;
      if (activeTab === 'airline-exams' && ownerFilter !== 'all' && ownerLabel(e) !== ownerFilter) return false;
      if (!q) return true;
      return (e.title || '').toLowerCase().includes(q)
        || (e.description || '').toLowerCase().includes(q)
        || (e.owner_airline_name || '').toLowerCase().includes(q)
        || (e.owner_department_name || '').toLowerCase().includes(q)
        || (e.for_airline_name || '').toLowerCase().includes(q);
    });
  };
  const anyExamFilterActive = examSearch.trim() || statusFilter !== 'all' || (activeTab === 'airline-exams' && ownerFilter !== 'all');

  const renderCard = (exam) => {
    const airlineOwned = !!exam.owner_airline;
    // A department may only manage exams it authored itself; the parent airline's
    // own exams and sibling departments' exams are read-only here.
    const canManage = isAdmin
      ? !airlineOwned
      : isDepartment
        ? String(exam.owner_department || '') === selfId
        : airlineOwned;
    // Each action also needs its own power — anything missing is not shown.
    const deleted = !!exam.deleted_at;
    const canAuthor = canManage && can('exams.author') && !deleted;
    // A department may also assign its parent airline's exams to its own team.
    const canAssign = !deleted && can('exams.assign') && (canManage || (isDepartment && airlineOwned));
    const showPublish = canAuthor && exam.status === 'draft';
    const showAssign  = canAssign && exam.status !== 'draft';
    // Customer Training Feedback — IFOA (admin-owned) exams only, never airline-created ones.
    const showFeedback = !deleted && isAdmin && !airlineOwned && !exam.owner_department && exam.status !== 'draft'
      && ['exams.assign', 'exams.grade', 'exams.author'].some(can);
    return (
      <Card
        key={exam.id}
        className="group p-5 sm:p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between"
      >
        <div className="space-y-3.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform mt-0.5">
                <HiOutlineAcademicCap className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors" title={exam.title}>
                  {exam.title}
                </h2>
                <div className="text-[11px] font-medium text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>{exam.question_count ?? exam.questions?.length ?? 0} Questions · {exam.duration_minutes} Mins</span>
                  {isAdmin && exam.for_airline_name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 truncate max-w-full"
                      title={`This exam is for ${exam.for_airline_name}`}>
                      <FaPlaneDeparture className="w-2.5 h-2.5 flex-shrink-0" /> For {exam.for_airline_name}
                    </span>
                  )}
                  {isAdmin && airlineOwned && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80 truncate max-w-full"
                      title={`Created by ${exam.owner_airline_name || 'Airline'}${exam.owner_department_name ? ` · ${exam.owner_department_name}` : ''}`}
                    >
                      {exam.owner_airline_name || 'Airline'}
                      {exam.owner_department_name ? ` · ${exam.owner_department_name}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {deleted ? (
                <SimpleTooltip label={`Deleted ${new Date(exam.deleted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} — results are kept`}>
                  <span className="font-bold text-[10px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Deleted</span>
                </SimpleTooltip>
              ) : (
                <Badge
                  variant={STATUS_VARIANT[exam.status]}
                  className="capitalize font-bold text-[10px] px-2.5 py-0.5 rounded-full"
                >
                  {exam.status}
                </Badge>
              )}
              {canAuthor && (
                <SimpleTooltip label="Delete exam">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    onClick={() => handleDelete(exam)}
                  >
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                  </Button>
                </SimpleTooltip>
              )}
            </div>
          </div>

          {/* Description with fixed min-height for perfect card alignment */}
          <div className="h-9 flex items-center">
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
              {exam.description || <span className="italic text-slate-300">No description provided</span>}
            </p>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-0.5">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <HiOutlineClock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">Pass ≥ {exam.pass_percentage}%</span>
            </div>
            {exam.assignments?.length ? (
              <SimpleTooltip label="See who is assigned">
                <button
                  type="button"
                  onClick={() => setAssignedTarget({ exam, canReassign: showAssign })}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60 text-left hover:bg-blue-50/70 hover:border-blue-200 hover:text-blue-700 transition-colors"
                >
                  <HiOutlineUserGroup className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate flex-1">{exam.assignments.length} Assigned</span>
                  <HiChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                </button>
              </SimpleTooltip>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
                <HiOutlineUserGroup className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">0 Assigned</span>
              </div>
            )}
          </div>
        </div>

        {/* Structured 2-Row Action Bar */}
        <div className="pt-3.5 mt-3.5 border-t border-slate-100/90 space-y-2">
          {(canAuthor || showAssign) && (
          <div className={`grid gap-2 ${canAuthor && (showPublish || showAssign) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {canAuthor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`${base}/${exam.id}/edit`)}
              className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1"
            >
              <HiOutlinePencil className="w-3.5 h-3.5 text-slate-400" /> Edit
            </Button>
            )}

            {showPublish ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1"
                onClick={() => handlePublish(exam)}
              >
                <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Publish
              </Button>
            ) : showAssign && (
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl border-blue-200/80 bg-blue-50/60 text-blue-700 hover:bg-blue-100/80 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1"
                onClick={() => setSendTarget(exam)}
              >
                <HiOutlineUserAdd className="w-3.5 h-3.5 text-blue-600" /> Assign
              </Button>
            )}
          </div>
          )}

          <div className={`grid gap-2 ${showFeedback ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`${base}/${exam.id}/attempts`)}
            className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1"
          >
            <HiOutlineClipboardCheck className="w-3.5 h-3.5 text-slate-400" /> Results
          </Button>
          {showFeedback && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFeedbackTarget(exam)}
              className="w-full rounded-xl border-emerald-200/80 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100/70 text-xs font-bold shadow-2xs h-8 flex items-center justify-center gap-1"
            >
              <HiOutlineChatAlt2 className="w-3.5 h-3.5 text-emerald-600" /> Feedback
            </Button>
          )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="w-full min-h-full pb-20 flex flex-col" style={{ '--sticky-top': `${headerH}px` }}>
      {/* Flush Full-Width Sticky Page Header */}
      <div ref={headerRef} className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="w-full flex items-center justify-between gap-x-4 gap-y-2.5 flex-wrap lg:flex-nowrap">
          <div className="flex items-center gap-x-3 gap-y-2 min-w-0 max-w-full flex-wrap">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex-shrink-0">Exam System</h1>
            
            {/* Executive Tab Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 sm:ml-2 max-w-full overflow-x-auto [&>button]:flex-shrink-0 [&>button]:whitespace-nowrap">
              <button
                type="button"
                onClick={() => setActiveTab('exams')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  activeTab === 'exams'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HiOutlineAcademicCap className="w-4 h-4 text-blue-600" />
                <span>{isAdmin ? 'IFOA Exams' : 'Exams'}</span>
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                  {isAdmin ? liveCount.ifoa : liveExams.length}
                </span>
              </button>

              {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('question-bank')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                  activeTab === 'question-bank'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HiOutlineCollection className="w-4 h-4 text-indigo-600" />
                <span>Question Bank</span>
              </button>
              )}

              {isAdmin && (
              <>
                <div className="h-4 w-px bg-slate-300 mx-2 self-center" />
                <button
                  type="button"
                  onClick={() => setActiveTab('airline-exams')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                    activeTab === 'airline-exams'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FaPlaneDeparture className="w-4 h-4 text-slate-500" />
                  <span>Airline Exams</span>
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 text-[10px]">
                    {liveCount.airline}
                  </span>
                </button>
              </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
          <ExamHelpButton guide="system" className="h-9 w-9" />
          {activeTab === 'exams' ? can('exams.author') && (
            <Button onClick={() => navigate(`${base}/new`)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
              <HiOutlinePlusCircle className="w-4 h-4" /> New Exam
            </Button>
          ) : activeTab === 'question-bank' ? (
            <Button onClick={() => setBankShowCreate((s) => !s)} className="bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-2xs flex items-center gap-1.5 px-4 py-2 flex-shrink-0">
              <HiOutlinePlusCircle className="w-4 h-4" /> New Bank
            </Button>
          ) : null}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="w-full p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {activeTab !== 'question-bank' && !loading && (
          // Sticky: search + filters stay at the top while the exam cards scroll
          // underneath (same as the question bank search).
          <div className="sticky top-[var(--sticky-top,0px)] z-10 -mt-2 py-2 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                placeholder="Search exams by title, description or owner…"
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {examSearch && (
                <button type="button" onClick={() => setExamSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] sm:w-36 h-9 text-xs font-semibold bg-white rounded-xl flex-shrink-0 border-slate-200 shadow-2xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>

            {activeTab === 'airline-exams' && ownerOptions.length > 1 && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[150px] sm:w-44 h-9 text-xs font-semibold bg-white rounded-xl flex-shrink-0 border-slate-200 shadow-2xs">
                  <SelectValue placeholder="All airlines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All airlines</SelectItem>
                  {ownerOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {anyExamFilterActive && (
              <button type="button"
                onClick={() => { setExamSearch(''); setStatusFilter('all'); setOwnerFilter('all'); }}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors whitespace-nowrap">
                Reset
              </button>
            )}
          </div>
        )}

        {activeTab === 'question-bank' ? (
          <QuestionBankList embedded showCreateState={bankShowCreate} setShowCreateState={setBankShowCreate} />
        ) : loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading exams…</span>
          </div>
        ) : (() => {
          const base = activeTab === 'airline-exams' ? airlineExams : (isAdmin ? ifoaExams : shown);
          const list = applyExamFilters(base);
          if (base.length === 0) {
            return (
              <Card className="p-12 text-center text-sm font-medium text-slate-400">
                {showDeleted
                  ? 'No deleted exams.'
                  : activeTab === 'airline-exams'
                  ? 'No airline-created exams yet. Airlines with exam access build their own here.'
                  : 'No exams yet. Create your first exam to get started.'}
              </Card>
            );
          }
          if (list.length === 0) {
            return (
              <Card className="p-12 text-center text-sm font-medium text-slate-400">
                No exams match your search / filter.
              </Card>
            );
          }
          return (
            <>
              {anyExamFilterActive && (
                <p className="text-xs text-slate-400 font-medium mb-3">Showing {list.length} of {base.length}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {list.map(renderCard)}
              </div>
            </>
          );
        })()}

      {feedbackTarget && (
        <FeedbackDialog exam={feedbackTarget} onClose={() => setFeedbackTarget(null)} />
      )}
      {assignedTarget && (
        <AssignedListModal exam={assignedTarget.exam} canReassign={assignedTarget.canReassign} onClose={() => setAssignedTarget(null)} onChanged={load} />
      )}
      {sendTarget && (
        <SendInviteModal exam={sendTarget} onClose={() => setSendTarget(null)} onSent={load} />
      )}
      {ConfirmDialog}
    </div>
  </div>
);
}
