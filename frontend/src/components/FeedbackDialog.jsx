import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane, HiOutlineSearch, HiOutlineDownload, HiOutlineChevronDown, HiOutlineChatAlt2,
} from 'react-icons/hi';
import { getExamFeedback, sendExamFeedback } from '../api';
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

// 1..5 average → colour band for the bar.
const barColour = (avg) => (avg >= 4.5 ? 'bg-emerald-500' : avg >= 3.5 ? 'bg-lime-500' : avg >= 2.5 ? 'bg-amber-400' : 'bg-rose-500');

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

function ResponseCard({ r, form }) {
  const [open, setOpen] = useState(false);
  const scaleLabel = (v) => form.scale.find((x) => x.value === v)?.label || '—';
  return (
    <li className="border border-slate-200 rounded-xl bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 truncate">{r.participant_name}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {[r.company, r.instructor_name && `Instructor: ${r.instructor_name}`, fmtDate(r.submitted_at)].filter(Boolean).join(' · ')}
          </p>
          {r.comments && !open && <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">“{r.comments}”</p>}
        </div>
        <HiOutlineChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">Training title:</span> {r.training_title}</p>
          {form.sections.map((s) => (
            <div key={s.key}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">{s.title.replace(/:$/, '').replace(/\.\.\.$/, '')}</p>
              <ul className="space-y-1">
                {s.statements.map((st) => {
                  const v = r.ratings.find((x) => x.key === st.key)?.value;
                  return (
                    <li key={st.key} className="flex items-start gap-3 text-xs">
                      <span className="flex-1 text-slate-600">{st.text}</span>
                      <span className="flex-shrink-0 font-semibold text-slate-800 w-28 text-right">{v ? `${v} · ${scaleLabel(v)}` : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Comments</p>
            <p className="text-xs text-slate-700 whitespace-pre-line">{r.comments || '—'}</p>
          </div>
        </div>
      )}
    </li>
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

  const summary = data?.summary;
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
                          <label className={`flex items-center gap-3 px-3 py-2.5 ${ok ? 'cursor-pointer hover:bg-slate-50' : 'opacity-70'}`}>
                            <Checkbox checked={selected.has(r.participant_id)} onCheckedChange={() => toggle(r.participant_id)} disabled={!ok} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">{[r.airline, r.email || 'no email on file'].filter(Boolean).join(' · ')}</p>
                            </div>
                            <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>{badge.label}</span>
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      <span className="font-bold text-slate-800">{summary.submitted}</span> response{summary.submitted === 1 ? '' : 's'} from {sentCount} sent · average out of 5
                    </p>
                    <Button variant="outline" size="sm" onClick={() => downloadCsv(exam.title, data.form, data.responses)}
                      className="rounded-xl text-xs font-bold h-8 flex items-center gap-1.5">
                      <HiOutlineDownload className="w-4 h-4" /> CSV
                    </Button>
                  </div>
                  {data.form.sections.map((section) => (
                    <div key={section.key}>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{section.title.replace(/:$/, '').replace(/\.\.\.$/, '')}</p>
                      <ul className="space-y-2.5">
                        {summary.statements.filter((s) => section.statements.some((st) => st.key === s.key)).map((s) => (
                          <li key={s.key}>
                            <div className="flex items-start gap-3">
                              <p className="flex-1 text-xs text-slate-600 leading-snug">{s.text}</p>
                              <span className="text-sm font-bold text-slate-900 w-10 text-right">{s.average ?? '—'}</span>
                            </div>
                            <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full ${barColour(s.average || 0)}`} style={{ width: `${((s.average || 0) / 5) * 100}%` }} />
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {data.form.scale.map((sc, i) => `${sc.label} ${s.distribution[i]}`).join(' · ')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Individual responses</p>
                    <ul className="space-y-2">
                      {data.responses.map((r) => <ResponseCard key={r.id} r={r} form={data.form} />)}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
