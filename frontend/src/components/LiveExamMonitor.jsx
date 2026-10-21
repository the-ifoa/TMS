import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineRefresh, HiOutlineSearch, HiOutlineDotsHorizontal } from 'react-icons/hi';
import { Radio, ShieldAlert, ShieldCheck, Send, TimerReset, Users, CircleCheck, Wifi, WifiLow, WifiOff, Activity } from 'lucide-react';
import { getExamLive, extendExamAttempt, extendExamAll, forceSubmitAttempt } from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// ─── Live exam monitor ────────────────────────────────────────────────────────
// Everyone taking the exam right now, refreshed every few seconds: progress,
// the question they're on, whether their browser is still checking in, time
// left and violations. Staff can add time (one candidate or everyone) or
// submit an attempt for a candidate. Second tab: who finished in the last 2 h.

const REFRESH_MS = 5000;
// The exam page checks in every autosave tick (~10 s by default).
const ACTIVE_S = 30;
const IDLE_S = 120;
const ADD_MINUTES = [5, 10, 15, 30];

const VIOLATION_LABEL = { fullscreen_exit: 'Left fullscreen', tab_switch: 'Switched tab', devtools_suspected: 'Developer tools' };
const REASON_LABEL = { violations: 'Too many violations', window_closed: 'Closed the window', exam_deleted: 'Exam deleted', admin: 'Submitted by staff' };

const clock = (secs) => {
  if (secs == null) return '—';
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
const ago = (secs) => (secs < 5 ? 'just now' : secs < 60 ? `${Math.round(secs)}s ago` : secs < 3600 ? `${Math.round(secs / 60)}m ago` : `${Math.round(secs / 3600)}h ago`);
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const PRESENCE = {
  active:  { label: 'Active',        pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', icon: Wifi },
  idle:    { label: 'Quiet',         pill: 'bg-amber-50 text-amber-700 ring-amber-600/15',       icon: WifiLow },
  offline: { label: 'Disconnected',  pill: 'bg-slate-100 text-slate-600 ring-slate-500/15',      icon: WifiOff },
};
const presenceOf = (secs) => (secs <= ACTIVE_S ? 'active' : secs <= IDLE_S ? 'idle' : 'offline');

const COLS = 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_2.5rem]';
const FINISHED_COLS = 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)]';

function Pill({ className = '', children }) {
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ring-1 ring-inset text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>;
}

function Stat({ label, value, icon: Icon, tone = 'text-slate-900' }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 truncate">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" strokeWidth={1.75} />}{label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${tone}`}>{value}</p>
    </div>
  );
}

// "Add time" choices, as menu items (used in the row menu and the header).
function AddTimeItems({ onAdd }) {
  const [custom, setCustom] = useState('');
  return (
    <>
      {ADD_MINUTES.map((m) => (
        <DropdownMenuItem key={m} onClick={() => onAdd(m)}>
          <TimerReset className="w-4 h-4 text-slate-400" strokeWidth={1.75} /> Add {m} minutes
        </DropdownMenuItem>
      ))}
      <form
        className="flex items-center gap-1.5 px-2 pt-1 pb-1.5"
        onSubmit={(e) => { e.preventDefault(); const m = Math.round(Number(custom)); if (m >= 1 && m <= 240) { onAdd(m); setCustom(''); } else toast.error('Enter 1 to 240 minutes.'); }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="number" min="1" max="240" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other (min)"
          aria-label="Other number of minutes"
          className="w-0 flex-1 h-8 px-2.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
        />
        <button type="submit" className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer hover:bg-slate-800">Add</button>
      </form>
    </>
  );
}

function Empty({ icon: Icon, title, text }) {
  return (
    <div className="py-16 flex flex-col items-center text-center px-6">
      <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><Icon className="w-5 h-5" strokeWidth={1.75} /></span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-[13px] text-slate-500 max-w-sm">{text}</p>
    </div>
  );
}

export default function LiveExamMonitor({ examId, canAct, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loadedAt, setLoadedAt] = useState(null);
  const [tab, setTab] = useState('active');
  const [query, setQuery] = useState('');
  const [, tick] = useState(0);
  const { confirm, ConfirmDialog } = useConfirm();
  const finishedBefore = useRef(null);
  const onChangedRef = useRef(onChanged); // parent passes a new function each render
  onChangedRef.current = onChanged;

  const load = useCallback(async () => {
    try {
      const { data: d } = await getExamLive(examId);
      setOffset(new Date(d.server_now).getTime() - Date.now());
      setData(d);
      setLoadedAt(Date.now());
      setError('');
      // A result arrived → let the results page refresh its list.
      if (finishedBefore.current != null && d.finished.length !== finishedBefore.current) onChangedRef.current?.();
      finishedBefore.current = d.finished.length;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the live view.');
    }
  }, [examId]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    const t = setInterval(() => tick((n) => n + 1), 1000); // countdowns
    return () => { clearInterval(id); clearInterval(t); };
  }, [load]);

  const now = Date.now() + offset;
  const timed = (data?.exam.duration_minutes || 0) > 0;
  const maxV = data?.exam.lockdown_enabled ? data.exam.max_violations : null;

  const addTime = async (row, minutes) => {
    setBusy(row ? row.id : 'all');
    try {
      if (row) {
        await extendExamAttempt(row.id, minutes);
        toast.success(`${minutes} minute${minutes === 1 ? '' : 's'} added for ${row.participant_name}.`);
      } else {
        const { data: r } = await extendExamAll(examId, minutes);
        toast.success(`${minutes} minute${minutes === 1 ? '' : 's'} added for ${r.updated} candidate${r.updated === 1 ? '' : 's'}.`);
      }
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add time.');
    } finally {
      setBusy(null);
    }
  };

  const submitFor = async (row) => {
    const ok = await confirm(
      `Submit ${row.participant_name}'s exam now?\n\nIt is marked with the answers saved so far (${row.answered} of ${row.total} answered). Their screen closes within about 10 seconds and shows that staff submitted it. This cannot be undone.`,
      { title: 'Submit this attempt', confirmLabel: 'Submit now' },
    );
    if (!ok) return;
    setBusy(row.id);
    try {
      const { data: r } = await forceSubmitAttempt(row.id);
      toast.success(r.percentage != null ? `Submitted: ${r.percentage}% (${r.passed ? 'pass' : 'fail'}).` : 'Submitted. Some answers need manual marking.');
      await load();
      onChangedRef.current?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not submit the attempt.');
    } finally {
      setBusy(null);
    }
  };

  const rows = (data?.active || []).map((a) => {
    const seen = Math.max(0, (now - new Date(a.last_seen_at).getTime()) / 1000);
    const total = a.deadline != null ? (a.deadline - new Date(a.started_at).getTime()) / 1000 : null;
    return { ...a, seen, presence: presenceOf(seen), left: a.deadline != null ? (a.deadline - now) / 1000 : null, totalTime: total };
  });
  const counts = rows.reduce((m, r) => ({ ...m, [r.presence]: (m[r.presence] || 0) + 1 }), {});
  const flagged = rows.filter((r) => r.violation_count > 0).length;
  const match = (name) => !query.trim() || (name || '').toLowerCase().includes(query.trim().toLowerCase());
  const shownActive = rows.filter((r) => match(r.participant_name));
  const shownFinished = (data?.finished || []).filter((f) => match(f.participant_name));
  const updatedAgo = loadedAt ? Math.max(0, Math.round((Date.now() - loadedAt) / 1000)) : null;

  const tabBtn = (key, label, n) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
    >
      {label}
      <span className={`min-w-[1.25rem] px-1 rounded-full text-[10px] tabular-nums ${tab === key ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>{n}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-6xl w-[96vw] h-[88vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0"><Radio className="w-5 h-5" strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-[15px] font-semibold text-slate-900 tracking-tight">Live monitor</DialogTitle>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <Activity className="w-3 h-3" strokeWidth={2.25} />
                  Live
                </span>
              </div>
              <p className="text-[13px] text-slate-500 truncate">{data?.exam.title || 'Loading…'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {updatedAgo != null && <span className="hidden md:inline text-[11px] text-slate-400 tabular-nums mr-1">Updated {updatedAgo < 2 ? 'just now' : `${updatedAgo}s ago`}</span>}
            <button type="button" onClick={load} aria-label="Refresh now" className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center cursor-pointer"><HiOutlineRefresh className="w-4 h-4" /></button>
            {canAct && timed && rows.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={busy === 'all'} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <TimerReset className="w-4 h-4" strokeWidth={1.75} /> <span className="hidden sm:inline">Add time for all</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Everyone taking it now</DropdownMenuLabel>
                  <AddTimeItems onAdd={(m) => addTime(null, m)} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center cursor-pointer"><HiOutlineX className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/40">
            <Stat label="Taking now" value={rows.length} icon={Users} />
            <Stat label="Active" value={counts.active || 0} icon={Wifi} />
            <Stat label="Disconnected" value={counts.offline || 0} icon={WifiOff} />
            <Stat label="With violations" value={flagged} icon={ShieldAlert} tone={flagged ? 'text-rose-600' : 'text-slate-900'} />
            <Stat label="Finished · 2 h" value={data?.finished.length || 0} icon={CircleCheck} />
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100">
            {tabBtn('active', 'In progress', rows.length)}
            {tabBtn('finished', 'Finished', data?.finished.length || 0)}
          </div>
          <label className="relative w-full sm:w-64">
            <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" aria-label="Search candidates"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 placeholder:text-slate-400" />
          </label>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {error && <p className="mx-6 mb-3 rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-200 px-4 py-2.5 text-sm text-rose-700">{error}</p>}
          {!data && !error && <div className="py-20 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>}

          {data && tab === 'active' && (
            !shownActive.length ? (
              <Empty icon={Users} title={rows.length ? 'No match' : 'Nobody is taking this exam right now'} text={rows.length ? 'No candidate in progress matches your search.' : 'Candidates appear here as soon as they start, and move to Finished when they submit.'} />
            ) : (
              <div className="mx-6 mb-6 rounded-xl border border-slate-200 overflow-hidden">
                <div className={`hidden lg:grid ${COLS} gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500`}>
                  <span>Candidate</span>
                  <span>Progress</span>
                  <span>Time left</span>
                  <span>Connection</span>
                  <span>Integrity</span>
                  <span className="sr-only">Actions</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {shownActive.map((r) => {
                    const pct = r.total ? Math.round((r.answered / r.total) * 100) : 0;
                    const urgent = r.left != null && r.left < 120;
                    const timePct = r.left != null && r.totalTime ? Math.max(0, Math.min(100, (r.left / r.totalTime) * 100)) : null;
                    const p = PRESENCE[r.presence];
                    return (
                      <li key={r.id} className={`grid grid-cols-1 sm:grid-cols-2 ${COLS} gap-x-4 gap-y-3 px-4 py-3.5 items-center hover:bg-slate-50/60 transition-colors`}>
                        {/* Candidate */}
                        <div className="flex items-center gap-3 min-w-0 sm:col-span-2 lg:col-span-1">
                          <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">{initials(r.participant_name)}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{r.participant_name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {[r.airline_name, r.attempt_number > 1 ? `Attempt ${r.attempt_number}` : '', `Started ${fmtTime(r.started_at)}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        {/* Progress */}
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{r.answered}<span className="text-slate-400 font-normal"> / {r.total}</span></span>
                            <span className="text-[11px] text-slate-500 tabular-nums">{pct}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-slate-900 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          {r.current_index != null && <p className="mt-1 text-[11px] text-slate-500">On question {r.current_index + 1}</p>}
                        </div>
                        {/* Time left */}
                        <div className="min-w-0">
                          {r.left == null ? (
                            <span className="text-xs text-slate-400">No limit</span>
                          ) : (
                            <>
                              <p className={`font-mono text-sm font-semibold tabular-nums ${urgent ? 'text-rose-600' : 'text-slate-900'}`}>{clock(r.left)}</p>
                              <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden max-w-[8rem]">
                                <div className={`h-full rounded-full ${urgent ? 'bg-rose-500' : 'bg-slate-400'}`} style={{ width: `${timePct}%` }} />
                              </div>
                              {r.extra_seconds > 0 && <p className="mt-1 text-[11px] text-blue-600 font-medium">+{Math.round(r.extra_seconds / 60)} min added</p>}
                            </>
                          )}
                        </div>
                        {/* Connection */}
                        <div className="min-w-0">
                          <Pill className={p.pill}><p.icon className="w-3 h-3" strokeWidth={2} />{p.label}</Pill>
                          <p className="mt-1 text-[11px] text-slate-400 tabular-nums">Seen {ago(r.seen)}</p>
                        </div>
                        {/* Integrity */}
                        <div className="min-w-0">
                          {r.violation_count > 0 ? (
                            <>
                              <Pill className="bg-rose-50 text-rose-700 ring-rose-600/15"><ShieldAlert className="w-3 h-3" />{r.violation_count}{maxV ? ` / ${maxV}` : ''} violation{r.violation_count === 1 ? '' : 's'}</Pill>
                              {r.last_violation && (
                                <p className="mt-1 text-[11px] text-slate-500 truncate">Last: {VIOLATION_LABEL[r.last_violation.type] || r.last_violation.type}, {fmtTime(r.last_violation.at)}</p>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.75} />Clean</span>
                          )}
                          {r.window_close_count > 0 && (
                            <p className="mt-1 text-[11px] text-slate-500">Reopened {r.window_close_count}×{data.exam.limit_window_closes ? ` of ${data.exam.max_window_closes}` : ''}</p>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex sm:justify-end">
                          {canAct && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" disabled={busy === r.id} aria-label={`Manage ${r.participant_name}'s attempt`}
                                  className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 inline-flex items-center justify-center cursor-pointer disabled:opacity-50">
                                  <HiOutlineDotsHorizontal className="w-5 h-5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {r.left != null && (
                                  <>
                                    <DropdownMenuLabel>Add time</DropdownMenuLabel>
                                    <AddTimeItems onAdd={(m) => addTime(r, m)} />
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem danger onClick={() => submitFor(r)}>
                                  <Send className="w-4 h-4" strokeWidth={1.75} /> Submit now
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}

          {data && tab === 'finished' && (
            !shownFinished.length ? (
              <Empty icon={CircleCheck} title={data.finished.length ? 'No match' : 'Nobody has finished yet'} text={data.finished.length ? 'No finished candidate matches your search.' : 'Candidates who submit in the next 2 hours show up here with their result.'} />
            ) : (
              <div className="mx-6 mb-6 rounded-xl border border-slate-200 overflow-hidden">
                <div className={`hidden lg:grid ${FINISHED_COLS} gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500`}>
                  <span>Candidate</span><span>Finished</span><span>Duration</span><span>Submitted</span><span className="text-right">Result</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {shownFinished.map((f) => (
                    <li key={f.id} className={`grid grid-cols-2 ${FINISHED_COLS} gap-x-4 gap-y-2 px-4 py-3 items-center`}>
                      <div className="flex items-center gap-3 min-w-0 col-span-2 lg:col-span-1">
                        <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">{initials(f.participant_name)}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{f.participant_name}</p>
                          {f.airline_name && <p className="text-xs text-slate-500 truncate">{f.airline_name}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 tabular-nums">{fmtTime(f.submitted_at)}</span>
                      <span className="text-xs text-slate-600 tabular-nums font-mono">{f.time_taken_seconds != null ? clock(f.time_taken_seconds) : '—'}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {f.auto_submit_reason
                          ? <Pill className="bg-amber-50 text-amber-800 ring-amber-600/15">{REASON_LABEL[f.auto_submit_reason] || 'Auto-submitted'}</Pill>
                          : <span className="text-xs text-slate-500">By candidate</span>}
                        {f.violation_count > 0 && <Pill className="bg-rose-50 text-rose-700 ring-rose-600/15">{f.violation_count} violation{f.violation_count === 1 ? '' : 's'}</Pill>}
                      </div>
                      <div className="lg:text-right">
                        {f.status === 'pending_review' ? (
                          <Pill className="bg-violet-50 text-violet-700 ring-violet-600/15">Needs marking</Pill>
                        ) : f.percentage != null ? (
                          <Pill className={f.passed ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15' : 'bg-rose-50 text-rose-700 ring-rose-600/15'}>
                            <span className="tabular-nums">{f.percentage}%</span> · {f.passed ? 'Pass' : 'Fail'}
                          </Pill>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
        <p className="flex-shrink-0 px-6 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
          Connection: Active = checked in within {ACTIVE_S}s · Quiet = within {IDLE_S / 60} min · Disconnected = longer (window closed or offline; the attempt still submits when time runs out).
        </p>
        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}
