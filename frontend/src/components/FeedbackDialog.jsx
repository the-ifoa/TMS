import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane, HiOutlineSearch, HiOutlineChevronRight, HiOutlineChatAlt2,
  HiOutlineArrowLeft, HiOutlineTrash, HiOutlineRefresh,
} from 'react-icons/hi';
import { getExamFeedback, sendExamFeedback, deleteExamFeedback, bulkDeleteExamFeedback, getExamAirlines } from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ScoreBadge, BandChip, DistBar, ScaleLegend, RatingRow, RATING_ROW, fmtAvg,
  weightedAverage, sumDistributions, sectionTitle,
} from './feedback/RatingUi';
import FeedbackReportActions from './feedback/FeedbackReportActions';

// ─── Customer Training Feedback — admin dialog for one IFOA exam ──────────────
// "Send" emails the feedback form to assigned participants; "Responses" shows
// the per-statement averages, every submitted form, and a PDF review report.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function statusBadge(fb) {
  if (!fb) return { label: 'Not sent', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (fb.status === 'submitted') return { label: `Submitted ${fmtDate(fb.submitted_at)}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (fb.status === 'opened') return { label: 'Opened', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: fb.sent_count > 1 ? `Sent ×${fb.sent_count}` : 'Sent', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
}

// Mean of one participant's own ratings.
function ownAverage(r) {
  const values = r.ratings.map((x) => x.value).filter((v) => Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// One row in the "Participants" list — click to open their answers. With
// canManage, a checkbox (for bulk delete) and a quick delete button.
function ResponseRow({ r, form, onOpen, canManage, checked, onToggle, onDelete, busy }) {
  return (
    <li className="flex items-center gap-1 rounded-xl hover:bg-slate-50 transition-colors">
      {canManage && (
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select ${r.participant_name}`}
          className="w-4 h-4 ml-3 flex-shrink-0" />
      )}
      <button type="button" onClick={onOpen}
        className="min-w-0 flex-1 flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {(r.participant_name || '?').trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800 truncate">{r.participant_name}</span>
          <span className="block text-[11px] text-slate-400 truncate">
            {[r.company || r.airline_name, fmtDate(r.submitted_at)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ScoreBadge avg={ownAverage(r)} scale={form.scale} />
        <HiOutlineChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
      </button>
      {canManage && (
        <button type="button" disabled={busy} onClick={onDelete} title="Delete response" aria-label={`Delete ${r.participant_name}'s response`}
          className="mr-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 flex-shrink-0">
          <HiOutlineTrash className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

// One participant's full answers, with delete / delete-and-resend.
export function ResponseDetail({ r, form, onBack, onDelete, busy, canManage, backLabel = 'All participants', allowResend = true }) {
  const facts = [
    ['Email', r.participant_email],
    ['Company', r.company || r.airline_name],
    ['Training', r.training_title],
    ['Instructor', r.instructor_name],
    ['Submitted', fmtDate(r.submitted_at)],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
            <HiOutlineArrowLeft className="w-4 h-4" /> {backLabel}
          </button>
        ) : <span />}
        {canManage && (
          <div className="flex items-center gap-2">
            {allowResend && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onDelete({ resend: true })}
                className="rounded-lg text-xs font-bold h-8 px-2.5 flex items-center gap-1.5">
                <HiOutlineRefresh className="w-3.5 h-3.5" /> Delete &amp; resend form
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDelete({ resend: false })}
              className="rounded-lg text-xs font-bold h-8 px-2.5 flex items-center gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700">
              <HiOutlineTrash className="w-3.5 h-3.5" /> Delete response
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-slate-900 truncate">{r.participant_name}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-400 font-semibold">{k}</dt>
                  <dd className="text-slate-700 truncate">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Their rating</p>
            <ScoreBadge avg={ownAverage(r)} scale={form.scale} size="lg" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
        {form.sections.map((section) => (
          <section key={section.key}>
            <header className="px-4 py-2 bg-slate-50/80">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{sectionTitle(section.title)}</h3>
            </header>
            <ul className="divide-y divide-slate-100">
              {section.statements.map((st) => {
                const v = r.ratings.find((x) => x.key === st.key)?.value;
                return (
                  <li key={st.key} className="sm:grid sm:grid-cols-[minmax(0,1fr)_2.25rem_7rem] sm:items-center sm:gap-4 px-4 py-2.5">
                    <p className="text-[13px] text-slate-700 leading-snug">{st.text}</p>
                    <div className="mt-1.5 sm:mt-0 flex items-center gap-3 sm:contents">
                      <span className="text-[13px] font-bold text-slate-900 tabular-nums sm:text-right">{v ?? '—'}</span>
                      {v ? <BandChip avg={v} scale={form.scale} /> : <span />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 overflow-hidden">
        <header className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Comments &amp; suggestions</h3>
        </header>
        <p className="px-4 py-3 text-xs text-slate-700 whitespace-pre-line">{r.comments || <span className="text-slate-400">No comments.</span>}</p>
      </section>
    </div>
  );
}

// Airline / department display name in the grouped participant list.
const groupName = (a) => (a.is_department ? (a.department_name || a.name || a.airlineName) : a.airlineName) || '';

// initialResponseId (e.g. from a dashboard comment) opens straight on that response.
export default function FeedbackDialog({ exam, onClose, initialResponseId = null }) {
  const { can } = useAuth();
  const canSend = can('exams.assign');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(canSend && !initialResponseId ? 'send' : 'responses');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState(initialResponseId ? 'people' : 'summary'); // responses tab: summary | people
  const [openId, setOpenId] = useState(initialResponseId);  // response shown in detail
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(() => new Set()); // responses ticked for bulk delete
  const { confirm, ConfirmDialog } = useConfirm();
  // Send tab: every participant, grouped by airline (same list as Assign).
  const [groups, setGroups] = useState(null);
  const [scope, setScope] = useState('all'); // all | assigned
  const [expanded, setExpanded] = useState(() => new Set());

  // onClose is a new function on every parent render — keep it out of load's deps.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const load = useCallback(() => {
    getExamFeedback(exam.id)
      .then((res) => setData(res.data))
      .catch((err) => { toast.error(err.response?.data?.error || 'Failed to load feedback'); onCloseRef.current(); });
  }, [exam.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canSend) return;
    getExamAirlines({ exam_id: exam.id })
      .then((res) => setGroups(res.data))
      .catch(() => setGroups([]));
  }, [exam.id, canSend]);

  const eligible = (r) => !!r.email && r.feedback?.status !== 'submitted';
  const q = search.trim().toLowerCase();

  // Feedback status + "assigned" per participant, from the feedback endpoint.
  const statusByPid = useMemo(() => Object.fromEntries((data?.rows || []).map((r) => [r.participant_id, r])), [data]);
  const allGroups = useMemo(() => (groups || []).map((g) => ({
    id: String(g.airline._id),
    name: groupName(g.airline),
    people: g.participants.map((p) => {
      const st = statusByPid[String(p._id)];
      return {
        participant_id: String(p._id), name: p.participant_name || 'Unnamed', email: p.email || '',
        airline: groupName(g.airline), feedback: st?.feedback || null, assigned: !!st?.assigned,
      };
    }),
  })), [groups, statusByPid]);
  const assignedCount = allGroups.reduce((t, g) => t + g.people.filter((p) => p.assigned).length, 0);
  const totalCount = allGroups.reduce((t, g) => t + g.people.length, 0);
  const shownGroups = useMemo(() => allGroups
    .map((g) => ({
      ...g,
      people: g.people.filter((p) => (scope === 'all' || p.assigned)
        && (!q || g.name.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))),
    }))
    .filter((g) => g.people.length > 0), [allGroups, scope, q]);
  const selectable = shownGroups.flatMap((g) => g.people.filter(eligible));
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.participant_id));

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (ids, on) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const toggleAll = () => setMany(selectable.map((r) => r.participant_id), !allSelected);
  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Sent in batches so a big "select all" doesn't hit one long request.
  const send = async () => {
    setSending(true);
    const ids = [...selected];
    let sentTotal = 0;
    const skippedAll = [];
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const res = await sendExamFeedback(exam.id, ids.slice(i, i + 100));
        sentTotal += res.data.sent.length;
        skippedAll.push(...res.data.skipped);
      }
      if (sentTotal) toast.success(`Feedback form sent to ${sentTotal} participant${sentTotal === 1 ? '' : 's'}.`);
      if (skippedAll.length) toast.error(`${skippedAll.length} not sent: ${skippedAll.slice(0, 5).map((s) => `${s.name || 'participant'} (${s.reason})`).join(', ')}${skippedAll.length > 5 ? ', …' : ''}`, { duration: 8000 });
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to send feedback forms${sentTotal ? ` (${sentTotal} were sent before the error)` : ''}.`);
    } finally {
      setSending(false);
      load();
    }
  };

  // Re-send the form to one participant who hasn't answered yet.
  const resendOne = async (row) => {
    setBusy(true);
    try {
      const res = await sendExamFeedback(exam.id, [row.participant_id]);
      if (res.data.sent.length) toast.success(`Feedback form re-sent to ${row.name}.`);
      else toast.error(`Not sent: ${res.data.skipped[0]?.reason || 'unknown error'}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend the form');
    } finally {
      setBusy(false);
    }
  };

  const removeResponse = async (r, { resend }) => {
    const ok = await confirm(
      resend
        ? `Delete ${r.participant_name}'s answers and email them a new feedback form?\n\nTheir old link stops working. This cannot be undone.`
        : `Delete ${r.participant_name}'s feedback response?\n\nTheir answers are removed from the results and their link stops working. You can send them the form again later. This cannot be undone.`,
      { title: resend ? 'Delete & resend form' : 'Delete response', confirmLabel: resend ? 'Delete & resend' : 'Delete' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteExamFeedback(exam.id, r.id, { resend });
      if (!resend) toast.success('Response deleted.');
      else if (res.data.resent) toast.success(`Response deleted and a new form sent to ${r.participant_name}.`);
      else toast.error(`Response deleted, but the form was not sent: ${res.data.skipped?.[0]?.reason || 'unknown error'}`, { duration: 8000 });
      setOpenId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete the response');
    } finally {
      setBusy(false);
    }
  };

  const togglePicked = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeMany = async (ids) => {
    const ok = await confirm(
      `Delete ${ids.length} feedback response${ids.length === 1 ? '' : 's'}?\n\nTheir answers are removed from the results and their links stop working. You can send them the form again later. This cannot be undone.`,
      { title: 'Delete responses', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await bulkDeleteExamFeedback(exam.id, ids);
      toast.success(`${res.data.deleted} response${res.data.deleted === 1 ? '' : 's'} deleted.`);
      setPicked(new Set());
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete the responses');
    } finally {
      setBusy(false);
    }
  };

  const summary = data?.summary;
  const opened = openId && data?.responses.find((r) => r.id === openId);
  const sentCount = (data?.rows || []).filter((r) => r.feedback).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[94vw] h-[85vh] max-h-[780px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-slate-100 space-y-0 text-left">
          <DialogTitle className="text-base font-bold text-slate-900 leading-snug pr-6 flex items-center gap-2">
            <HiOutlineChatAlt2 className="w-5 h-5 text-slate-400" /> Training feedback
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{exam.title}</p>
          <div className="flex gap-1 mt-3 -mb-px">
            {canSend && (
              <button type="button" onClick={() => setTab('send')}
                className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${tab === 'send' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                Send form
              </button>
            )}
            <button type="button" onClick={() => setTab('responses')}
              className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${tab === 'responses' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Responses{summary ? ` (${summary.submitted})` : ''}
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {!data ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : tab === 'send' ? (
            <>
              <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 space-y-2.5">
                <div className="flex items-center gap-3">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={selectable.length === 0} aria-label="Select everyone shown" />
                  <div className="relative flex-1">
                    <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or airline"
                      className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/70">
                    {[['all', `All participants (${totalCount})`], ['assigned', `Assigned to this exam (${assignedCount})`]].map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setScope(key)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${scope === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-slate-400">
                    {selectable.length ? `${selectable.length} can be sent the form` : ''}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50/60">
                {groups == null ? (
                  <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>
                ) : shownGroups.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    {q ? 'No matches.' : scope === 'assigned' ? 'Nobody is assigned to this exam yet. Switch to "All participants" to send the form to anyone.' : 'No participants yet.'}
                  </p>
                ) : shownGroups.map((g) => {
                  const sendable = g.people.filter(eligible);
                  const groupAll = sendable.length > 0 && sendable.every((p) => selected.has(p.participant_id));
                  const open = !!q || expanded.has(g.id);
                  return (
                    <div key={g.id} className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
                      <div onClick={() => toggleExpand(g.id)} className="px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer flex items-center gap-3 select-none">
                        <HiOutlineChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-90 text-slate-600' : ''}`} />
                        <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {g.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                        </span>
                        <span className="text-sm font-bold text-slate-800 truncate">{g.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-bold">{g.people.length}</span>
                        {sendable.length > 0 && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setMany(sendable.map((p) => p.participant_id), !groupAll); }}
                            className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-semibold border ${groupAll ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                            {groupAll ? 'Selected' : `Select ${sendable.length}`}
                          </button>
                        )}
                      </div>
                      {open && (
                        <ul className="border-t border-slate-100 divide-y divide-slate-100">
                          {g.people.map((r) => {
                            const badge = statusBadge(r.feedback);
                            const ok = eligible(r);
                            return (
                              <li key={r.participant_id}>
                                <label className={`flex items-center gap-3 px-3.5 py-2.5 ${ok ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                                  <Checkbox checked={selected.has(r.participant_id)} onCheckedChange={() => toggle(r.participant_id)} disabled={!ok} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{r.email || 'no email on file'}{r.assigned ? ' · assigned to this exam' : ''}</p>
                                  </div>
                                  <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>{badge.label}</span>
                                  {r.feedback && r.feedback.status !== 'submitted' && r.email && (
                                    <button type="button" disabled={busy}
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); resendOne(r); }}
                                      className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-50">
                                      <HiOutlineRefresh className="w-3.5 h-3.5" /> Resend
                                    </button>
                                  )}
                                  {r.feedback?.status === 'submitted' && (
                                    <button type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTab('responses'); setView('people'); setOpenId(r.feedback.id); }}
                                      className="flex-shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-500 hover:text-slate-900">
                                      View <HiOutlineChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              <DialogFooter className="flex-shrink-0 px-6 py-3.5 border-t border-slate-100 flex flex-row items-center justify-between sm:justify-between gap-3">
                <span className="text-xs text-slate-500">{sentCount} sent · {summary.submitted} submitted</span>
                <Button onClick={send} disabled={sending || selected.size === 0}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-9 flex items-center gap-1.5">
                  <HiOutlinePaperAirplane className="w-4 h-4 rotate-45" />
                  {sending ? 'Sending…' : `Send form (${selected.size})`}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {summary.submitted === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No feedback submitted yet.</p>
              ) : (
                <>
                  {/* Summary vs. per-participant view */}
                  {!opened && (
                    <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/70">
                      {[['summary', 'Summary'], ['people', `Participants (${data.responses.length})`]].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setView(key)}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${view === key ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {opened ? (
                    <ResponseDetail r={opened} form={data.form} busy={busy} canManage={canSend}
                      onBack={() => setOpenId(null)} onDelete={(opts) => removeResponse(opened, opts)} />
                  ) : view === 'people' ? (
                    <>
                      {canSend && (() => {
                        const ids = data.responses.map((r) => r.id);
                        const chosen = ids.filter((id) => picked.has(id));
                        const all = chosen.length === ids.length;
                        return (
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                              <Checkbox checked={all ? true : chosen.length ? 'indeterminate' : false}
                                onCheckedChange={() => setPicked(all ? new Set() : new Set(ids))} className="w-4 h-4" />
                              {chosen.length ? `${chosen.length} selected` : 'Select all'}
                            </label>
                            <Button variant="outline" size="sm" disabled={busy || !chosen.length} onClick={() => removeMany(chosen)}
                              className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                              <HiOutlineTrash className="w-3.5 h-3.5" /> Delete{chosen.length ? ` (${chosen.length})` : ''}
                            </Button>
                          </div>
                        );
                      })()}
                      <ul className="space-y-0.5 -mx-3">
                        {data.responses.map((r) => (
                          <ResponseRow key={r.id} r={r} form={data.form} onOpen={() => setOpenId(r.id)}
                            canManage={canSend} busy={busy} checked={picked.has(r.id)} onToggle={() => togglePicked(r.id)}
                            onDelete={() => removeResponse(r, { resend: false })} />
                        ))}
                      </ul>
                    </>
                  ) : (
                  <>
                  {/* Headline numbers — one slim strip */}
                  {(() => {
                    const overall = weightedAverage(summary.statements);
                    const rate = sentCount ? Math.round((summary.submitted / sentCount) * 100) : null;
                    return (
                      <div className="rounded-xl border border-slate-200 grid grid-cols-3 divide-x divide-slate-200">
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall rating</p>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-xl font-black text-slate-900 tabular-nums leading-none">{fmtAvg(overall)}</span>
                            <span className="text-[11px] font-semibold text-slate-400">/ 5</span>
                          </div>
                          {overall != null && <BandChip avg={overall} scale={data.form.scale} className="mt-1.5" />}
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responses</p>
                          <p className="mt-1 text-xl font-black text-slate-900 tabular-nums leading-none">{summary.submitted}</p>
                          <p className="mt-1.5 text-[11px] text-slate-500">of {sentCount} form{sentCount === 1 ? '' : 's'} sent</p>
                        </div>
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response rate</p>
                          <p className="mt-1 text-xl font-black text-slate-900 tabular-nums leading-none">{rate != null ? `${rate}%` : '—'}</p>
                          <p className="mt-1.5 text-[11px] text-slate-500">completed the survey</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <ScaleLegend scale={data.form.scale} />
                    <FeedbackReportActions exam={exam} form={data.form} responses={data.responses} sentCount={sentCount} />
                  </div>

                  {/* Every statement in one table: same columns for every row */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className={`hidden ${RATING_ROW} px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400`}>
                      <span>Statement</span><span>Answers</span><span className="text-right">Avg</span><span>Rating</span>
                    </div>
                    {data.form.sections.map((section) => {
                      const stats = summary.statements.filter((s) => section.statements.some((st) => st.key === s.key));
                      return (
                        <section key={section.key} className="border-b border-slate-200 last:border-b-0">
                          <header className={`${RATING_ROW} px-4 py-2 bg-slate-50/60 border-b border-slate-100`}>
                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">{sectionTitle(section.title)}</h3>
                            <div className="hidden sm:contents">
                              <DistBar distribution={sumDistributions(stats.map((x) => x.distribution))} scale={data.form.scale} className="w-full" />
                              <span className="text-[13px] font-black text-slate-900 tabular-nums text-right">{fmtAvg(weightedAverage(stats))}</span>
                              <BandChip avg={weightedAverage(stats)} scale={data.form.scale} className="justify-self-start" />
                            </div>
                          </header>
                          <div className="divide-y divide-slate-100">
                            {stats.map((st) => (
                              <RatingRow key={st.key} text={st.text} average={st.average} distribution={st.distribution} scale={data.form.scale} />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400">Avg is the mean of every answer out of 5. Hover the answers bar to see how many people chose each rating.</p>

                  </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}
