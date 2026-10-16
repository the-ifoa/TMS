import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane, HiOutlineSearch, HiOutlineDownload, HiOutlineChevronRight, HiOutlineChatAlt2,
  HiOutlineArrowLeft, HiOutlineTrash, HiOutlineRefresh,
} from 'react-icons/hi';
import { getExamFeedback, sendExamFeedback, deleteExamFeedback } from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// ─── Customer Training Feedback — admin dialog for one IFOA exam ──────────────
// "Send" emails the feedback form to assigned participants; "Responses" shows
// the per-statement averages, every submitted form, and a CSV export.

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
const SCALE_FILL = { 1: '#b91c1c', 2: '#f87171', 3: '#a8a29e', 4: '#60a5fa', 5: '#1d4ed8' };
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
      <span className={`font-bold text-slate-900 tabular-nums ${size === 'lg' ? 'text-base' : 'text-sm'}`}>{fmtAvg(avg)}</span>
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600 whitespace-nowrap">
        <Swatch value={band} className="!w-2 !h-2" /> {scale.find((x) => x.value === band)?.label}
      </span>
    </span>
  );
}

// How the answers to one statement split across the scale: one segment per
// rating (Poor → Excellent, left to right), width = share of responses.
function DistributionBar({ distribution, scale }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (!total) return <div className="h-2.5 rounded bg-slate-100" />;
  return (
    <div className="flex h-2.5 gap-[2px]" role="img"
      aria-label={scale.map((sc, i) => `${sc.label}: ${distribution[i]}`).join(', ')}>
      {scale.map((sc, i) => {
        const n = distribution[i];
        if (!n) return null;
        const pct = Math.round((n / total) * 100);
        return (
          <div key={sc.value} className="group relative h-full rounded-[4px] cursor-default transition-opacity hover:opacity-80"
            style={{ width: `${(n / total) * 100}%`, background: SCALE_FILL[sc.value] }}>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white shadow-lg z-10">
              {sc.label}: {n} response{n === 1 ? '' : 's'} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Mean over every individual rating (not a mean of means), so each answer counts once.
function weightedAverage(statements) {
  let sum = 0; let n = 0;
  statements.forEach((s) => { s.distribution.forEach((c, i) => { sum += c * (i + 1); n += c; }); });
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

const sectionTitle = (t) => t.replace(/:$/, '').replace(/\.\.\.$/, '');

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(examTitle, form, responses) {
  const statements = form.sections.flatMap((s) => s.statements);
  const label = (v) => form.scale.find((x) => x.value === v)?.label || '';
  const header = ['Participant', 'Email', 'Company', 'Training title', 'Instructor', 'Submitted', ...statements.map((s) => s.text), 'Comments'];
  const rows = responses.map((r) => [
    r.participant_name, r.participant_email, r.company, r.training_title, r.instructor_name, fmtDate(r.submitted_at),
    ...statements.map((s) => { const v = r.ratings.find((x) => x.key === s.key)?.value; return v ? `${v} - ${label(v)}` : ''; }),
    r.comments,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Training_Feedback_${examTitle.replace(/[^a-zA-Z0-9]+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{sectionTitle(section.title)}</h3>
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

  // onClose is a new function on every parent render — keep it out of load's deps.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const load = useCallback(() => {
    getExamFeedback(exam.id)
      .then((res) => setData(res.data))
      .catch((err) => { toast.error(err.response?.data?.error || 'Failed to load feedback'); onCloseRef.current(); });
  }, [exam.id]);

  useEffect(() => { load(); }, [load]);

  const eligible = (r) => !!r.email && r.feedback?.status !== 'submitted';
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.rows || []).filter((r) => !q
    || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.airline.toLowerCase().includes(q)), [data, q]);
  const selectable = rows.filter(eligible);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.participant_id));

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    selectable.forEach((r) => (allSelected ? n.delete(r.participant_id) : n.add(r.participant_id)));
    return n;
  });

  const send = async () => {
    setSending(true);
    try {
      const res = await sendExamFeedback(exam.id, [...selected]);
      const { sent, skipped } = res.data;
      if (sent.length) toast.success(`Feedback form sent to ${sent.length} participant${sent.length === 1 ? '' : 's'}.`);
      if (skipped.length) toast.error(`${skipped.length} not sent: ${skipped.map((s) => `${s.name || 'participant'} (${s.reason})`).join(', ')}`, { duration: 8000 });
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send feedback forms');
    } finally {
      setSending(false);
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
              <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 flex items-center gap-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={selectable.length === 0} aria-label="Select all" />
                <div className="relative flex-1">
                  <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or airline"
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-1">
                {data.rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">Nobody is assigned to this exam yet. Assign participants first, then send them the feedback form.</p>
                ) : rows.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">No matches.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const badge = statusBadge(r.feedback);
                      const ok = eligible(r);
                      return (
                        <li key={r.participant_id}>
                          <label className={`flex items-center gap-3 px-3 py-2.5 ${ok ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                            <Checkbox checked={selected.has(r.participant_id)} onCheckedChange={() => toggle(r.participant_id)} disabled={!ok} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{[r.airline, r.email || 'no email on file'].filter(Boolean).join(' · ')}</p>
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
                      <Button variant="outline" size="sm" onClick={() => downloadCsv(exam.title, data.form, data.responses)}
                        className="rounded-lg text-xs font-bold h-7 px-2.5 flex items-center gap-1.5 bg-white">
                        <HiOutlineDownload className="w-3.5 h-3.5" /> CSV
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      Each bar shows how participants answered (hover a segment for counts). The number is the average out of 5.
                    </p>
                  </div>

                  {/* One card per form section */}
                  {data.form.sections.map((section) => {
                    const stats = summary.statements.filter((s) => section.statements.some((st) => st.key === s.key));
                    return (
                      <section key={section.key} className="rounded-xl border border-slate-200 overflow-hidden">
                        <header className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-200">
                          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{sectionTitle(section.title)}</h3>
                          <ScoreBadge avg={weightedAverage(stats)} scale={data.form.scale} />
                        </header>
                        <ul className="divide-y divide-slate-100">
                          {stats.map((s) => (
                            <li key={s.key} className="px-4 py-3">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <p className="text-xs text-slate-700 leading-snug">{s.text}</p>
                                <ScoreBadge avg={s.average} scale={data.form.scale} />
                              </div>
                              <DistributionBar distribution={s.distribution} scale={data.form.scale} />
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
