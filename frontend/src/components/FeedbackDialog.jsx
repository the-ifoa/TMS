import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane, HiOutlineSearch, HiOutlineDownload, HiOutlineChevronRight, HiOutlineChatAlt2,
  HiOutlineArrowLeft, HiOutlineTrash, HiOutlineRefresh,
} from 'react-icons/hi';
import { getExamFeedback, sendExamFeedback, deleteExamFeedback, getExamAirlines } from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

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

// Rating colours, one per answer on the form's 1–5 scale. Diverging: blue for
// the positive side, red for the negative side, grey for the neutral midpoint,
// so "how good" reads from hue + depth without a legend lookup. Never used for
// text — labels stay in ink with a swatch beside them.
// Clear but calm: the site's blue for the good side, rose for the poor side,
// grey in the middle. Bars are kept short so the statements stay the focus.
const SCALE_FILL = { 1: '#e11d48', 2: '#fda4af', 3: '#cbd5e1', 4: '#93c5fd', 5: '#2563eb' };
// Average → nearest scale point (4.5 and up reads as Excellent, and so on).
const bandOf = (avg) => Math.min(5, Math.max(1, Math.round(avg)));
const fmtAvg = (avg) => (avg == null ? '—' : avg.toFixed(1));

function Swatch({ value, className = '' }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-[3px] flex-shrink-0 ${className}`} style={{ background: SCALE_FILL[value] }} />;
}

// Average score + its scale label, e.g. "4.6  ■ Excellent".
function ScoreBadge({ avg, scale, size = 'sm' }) {
  if (avg == null) return <span className="text-xs text-slate-400">No ratings</span>;
  const band = bandOf(avg);
  return (
    <span className="inline-flex items-center gap-2 flex-shrink-0">
      <span className={`tabular-nums ${size === 'lg' ? 'text-base font-bold text-slate-900' : 'text-[13px] font-bold text-slate-700'}`}>{fmtAvg(avg)}</span>
      <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-medium text-slate-500 whitespace-nowrap">
        <Swatch value={band} className="!w-2 !h-2" /> {scale.find((x) => x.value === band)?.label}
      </span>
    </span>
  );
}

// Mean over every individual rating (not a mean of means), so each answer counts once.
function weightedAverage(statements) {
  let sum = 0; let n = 0;
  statements.forEach((s) => { s.distribution.forEach((c, i) => { sum += c * (i + 1); n += c; }); });
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

const sectionTitle = (t) => t.replace(/:$/, '').replace(/\.\.\.$/, '');

// The review report PDF (cover, summary, one page per review). Loaded on demand
// so jsPDF stays out of the main bundle.
async function downloadPdf(examTitle, form, responses, sentCount) {
  try {
    const { downloadFeedbackPdf } = await import('../utils/generateFeedbackPdf');
    downloadFeedbackPdf({ examTitle, form, responses, sentCount });
  } catch (err) {
    console.error('Feedback PDF failed:', err);
    toast.error('Could not create the PDF. Please try again.');
  }
}

// Mean of one participant's own ratings.
function ownAverage(r) {
  const values = r.ratings.map((x) => x.value).filter((v) => Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// One row in the "Participants" list — click to open their answers.
function ResponseRow({ r, form, onOpen }) {
  return (
    <li>
      <button type="button" onClick={onOpen}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 transition-colors">
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
    </li>
  );
}

// One participant's full answers, with delete / delete-and-resend.
function ResponseDetail({ r, form, onBack, onDelete, busy, canManage }) {
  const scaleLabel = (v) => form.scale.find((x) => x.value === v)?.label || '—';
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
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
          <HiOutlineArrowLeft className="w-4 h-4" /> All participants
        </button>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDelete({ resend: true })}
              className="rounded-lg text-xs font-bold h-8 px-2.5 flex items-center gap-1.5">
              <HiOutlineRefresh className="w-3.5 h-3.5" /> Delete &amp; resend form
            </Button>
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

      {form.sections.map((section) => (
        <section key={section.key} className="rounded-xl border border-slate-200 overflow-hidden">
          <header className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-200">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{sectionTitle(section.title)}</h3>
          </header>
          <ul className="divide-y divide-slate-100">
            {section.statements.map((st) => {
              const v = r.ratings.find((x) => x.key === st.key)?.value;
              return (
                <li key={st.key} className="flex items-start gap-4 px-4 py-2.5 text-xs">
                  <span className="flex-1 text-slate-700 leading-snug">{st.text}</span>
                  <span className="flex-shrink-0 w-36 inline-flex items-center justify-end gap-1.5 font-semibold text-slate-800">
                    {v ? <><Swatch value={v} /> <span className="tabular-nums">{v}</span> · {scaleLabel(v)}</> : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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

export default function FeedbackDialog({ exam, onClose }) {
  const { can } = useAuth();
  const canSend = can('exams.assign');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(canSend ? 'send' : 'responses');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState('summary'); // responses tab: summary | people
  const [openId, setOpenId] = useState(null);  // response shown in detail
  const [busy, setBusy] = useState(false);
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

  const summary = data?.summary;
  const opened = openId && data?.responses.find((r) => r.id === openId);
  const sentCount = (data?.rows || []).filter((r) => r.feedback).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[94vw] h-[85vh] max-h-[760px] flex flex-col p-0 overflow-hidden rounded-2xl border border-slate-200/80 shadow-2xl bg-white">
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
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
                    <ul className="space-y-0.5 -mx-3">
                      {data.responses.map((r) => <ResponseRow key={r.id} r={r} form={data.form} onOpen={() => setOpenId(r.id)} />)}
                    </ul>
                  ) : (
                  <>
                  {/* Headline numbers */}
                  {(() => {
                    const overall = weightedAverage(summary.statements);
                    const rate = sentCount ? Math.round((summary.submitted / sentCount) * 100) : null;
                    return (
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-xl border border-slate-200 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall rating</p>
                          <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums leading-none">{fmtAvg(overall)}<span className="text-xs font-semibold text-slate-400"> / 5</span></p>
                          {overall != null && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                              <Swatch value={bandOf(overall)} /> {data.form.scale.find((x) => x.value === bandOf(overall))?.label}
                            </p>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-200 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Responses</p>
                          <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums leading-none">{summary.submitted}</p>
                          <p className="mt-1.5 text-[11px] text-slate-500">of {sentCount} form{sentCount === 1 ? '' : 's'} sent</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response rate</p>
                          <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums leading-none">{rate != null ? `${rate}%` : '—'}</p>
                          <p className="mt-1.5 text-[11px] text-slate-500">completed the survey</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Legend: what each colour means */}
                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <ul className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                        {data.form.scale.map((sc) => (
                          <li key={sc.value} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                            <Swatch value={sc.value} /> <span className="text-slate-400 tabular-nums">{sc.value}</span> {sc.label}
                          </li>
                        ))}
                      </ul>
                      <Button variant="outline" size="sm" onClick={() => downloadPdf(exam.title, data.form, data.responses, sentCount)}
                        className="rounded-lg text-xs font-bold h-7 px-2.5 flex items-center gap-1.5 bg-white">
                        <HiOutlineDownload className="w-3.5 h-3.5" /> PDF
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      Scores are the average rating out of 5. Hover a score to see how participants answered.
                    </p>
                  </div>

                  {/* One card per form section */}
                  {data.form.sections.map((section) => {
                    const stats = summary.statements.filter((s) => section.statements.some((st) => st.key === s.key));
                    return (
                      <section key={section.key}>
                        <header className="flex items-center justify-between gap-3 mb-2 px-0.5">
                          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{sectionTitle(section.title)}</h3>
                          <span className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-400 flex-shrink-0">
                            <span className="hidden sm:inline">Section average</span> <ScoreBadge avg={weightedAverage(stats)} scale={data.form.scale} />
                          </span>
                        </header>
                        <ul className="space-y-2">
                          {stats.map((s) => (
                            <li key={s.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6">
                              <p className="flex-1 min-w-0 text-[14px] font-medium text-slate-900 leading-snug">{s.text}</p>
                              <div className="flex-shrink-0 cursor-default"
                                title={data.form.scale.map((sc, i) => `${sc.label}: ${s.distribution[i]}`).filter((_, i) => s.distribution[i]).join('\n')}>
                                <ScoreBadge avg={s.average} scale={data.form.scale} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}

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
