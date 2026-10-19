import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlusCircle, HiOutlinePencil, HiOutlineTrash, HiOutlinePlay, HiOutlineClock,
  HiOutlineLightningBolt, HiOutlineCollection, HiOutlineX, HiOutlineQuestionMarkCircle, HiOutlineUserGroup,
  HiOutlineDeviceMobile, HiOutlineDesktopComputer, HiOutlineChartBar, HiChevronRight,
} from 'react-icons/hi';
import { listLiveGames, deleteLiveGame, startLiveSession, listLiveSessions, deleteLiveSession } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import ExamHelpButton from '../../components/ExamHelpGuide';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, CoverBadge } from '../../components/live/liveUi';

// ─── Live quiz games (IFOA admin) ─────────────────────────────────────────────
// Kahoot-style games: build once, host any number of times. "Host" opens the
// big-screen game with a PIN, link and QR that anyone can join from a phone.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATE_BADGE = {
  live: ['Live', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  unfinished: ['Not finished', 'bg-amber-50 text-amber-700 border-amber-200'],
  finished: ['Finished', 'bg-slate-50 text-slate-600 border-slate-200'],
};

function HistoryDialog({ game, onClose, onOpen, onChanged }) {
  const [rows, setRows] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();
  useEffect(() => {
    listLiveSessions(game.id).then((r) => setRows(r.data)).catch(() => { toast.error('Failed to load past games.'); setRows([]); });
  }, [game.id]);

  const remove = async (s) => {
    const msg = s.state === 'live'
      ? 'This game is still live. Deleting it ends it for everyone and removes its players and scores.'
      : 'This removes the game, its players and their scores. It cannot be undone.';
    if (!(await confirm(msg, { title: 'Delete this game?', confirmLabel: 'Delete' }))) return;
    setDeleting(s.id);
    try {
      await deleteLiveSession(s.id);
      setRows((list) => list.filter((x) => x.id !== s.id));
      onChanged?.();
      toast.success('Game deleted.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete the game.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-lg w-[94vw] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-slate-900">Past games</DialogTitle>
            <p className="text-[13px] text-slate-500 mt-0.5 truncate">{game.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!rows ? (
            <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>
          ) : !rows.length ? (
            <p className="py-10 text-center text-[13px] text-slate-400">This game hasn&apos;t been played yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((s) => {
                const state = s.state || (s.status === 'finished' ? 'finished' : 'live');
                const [label, tone] = STATE_BADGE[state];
                const headline = !s.winner ? (state === 'finished' ? 'No players' : 'No players yet')
                  : `${s.winner.nickname} ${state === 'finished' ? 'won' : 'leading'} · ${s.winner.score.toLocaleString()} pts`;
                return (
                  <li key={s.id} className="group flex items-center gap-1 pr-3 hover:bg-slate-50">
                    <button type="button" onClick={() => onOpen(s.id)} className="flex-1 min-w-0 text-left pl-6 py-3 flex items-center gap-3">
                      {s.winner ? <Avatar id={s.winner.avatar} size={36} /> : <span className="w-9 h-9 rounded-full bg-slate-100 flex-shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 truncate">{headline}</span>
                        <span className="block text-xs text-slate-500">{fmtDate(s.created_at)} · {s.players} player{s.players === 1 ? '' : 's'} · PIN {s.pin}</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${tone}`}>{label}</span>
                      {state !== 'finished' && (
                        <span className="hidden sm:inline text-[11px] font-semibold text-blue-600 whitespace-nowrap">Resume</span>
                      )}
                    </button>
                    <SimpleTooltip label="Delete this game">
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={deleting === s.id}
                        aria-label="Delete this game"
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </SimpleTooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {rows?.some((r) => r.state === 'unfinished') && (
          <p className="px-6 py-3 border-t border-slate-100 text-[11px] text-slate-500">
            <span className="font-semibold text-amber-700">Not finished</span> means the host left before the end. Open it to resume, or delete it.
          </p>
        )}
        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}

function HeroStat({ icon: Icon, label, short, value, sub }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 sm:p-5 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="hidden sm:flex w-8 h-8 rounded-lg bg-white/10 text-white items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
        <p className="text-[11px] sm:text-sm font-medium text-slate-300 sm:text-slate-200 truncate">
          {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
        </p>
      </div>
      <p className="mt-1.5 sm:mt-3 text-xl sm:text-[2rem] font-bold text-white tracking-tight leading-none whitespace-nowrap">{value}</p>
      <p className="hidden sm:block mt-2 text-[13px] text-slate-300 truncate">{sub}</p>
    </div>
  );
}

const STEPS = [
  { icon: HiOutlinePencil, title: 'Build', text: 'Write quick questions, or import them from an exam.' },
  { icon: HiOutlineDesktopComputer, title: 'Host', text: 'Show the game screen with its PIN and QR code.' },
  { icon: HiOutlineDeviceMobile, title: 'Play', text: 'People join from their phones and answer against the clock.' },
  { icon: HiOutlineChartBar, title: 'Results', text: 'Leaderboard after each question, podium at the end.' },
];

export default function LiveQuizzes() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canBuild = can('exams.author');
  const [games, setGames] = useState(null);
  const [starting, setStarting] = useState(null);
  const [history, setHistory] = useState(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => listLiveGames().then((r) => setGames(r.data)).catch(() => { toast.error('Failed to load games.'); setGames([]); });
  useEffect(() => { load(); }, []);

  const host = async (g) => {
    setStarting(g.id);
    try {
      const { data } = await startLiveSession(g.id);
      navigate(`/admin/live/host/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start the game.');
      setStarting(null);
    }
  };

  const remove = async (g) => {
    if (!(await confirm(`Delete "${g.title}"? Past results stay available.`, { title: 'Delete game', confirmLabel: 'Delete' }))) return;
    try { await deleteLiveGame(g.id); toast.success('Game deleted.'); load(); } catch (err) { toast.error(err.response?.data?.error || 'Delete failed.'); }
  };

  const totalPlays = (games || []).reduce((t, g) => t + g.plays, 0);
  const lastPlayed = (games || []).map((g) => g.last_played).filter(Boolean).sort().pop();
  const totalQuestions = (games || []).reduce((t, g) => t + g.question_count, 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Hero band — same look as the dashboard */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 sm:p-7 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[13px] font-medium text-slate-400 inline-flex items-center gap-1.5"><HiOutlineLightningBolt className="w-4 h-4" /> Quiz Arena</p>
            <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-white tracking-tight">Run a quiz live, together</h1>
            <p className="text-sm text-slate-300 mt-1">Players join from their phones with a PIN or QR code, answer against the clock, and the leaderboard ranks them as they go.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ExamHelpButton guide="live" className="h-10 w-10 border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white hover:border-white/25" />
            {canBuild && (
              <button type="button" onClick={() => navigate('/admin/live/new')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl transition-colors font-semibold text-sm shadow-sm flex-shrink-0">
                <HiOutlinePlusCircle className="w-5 h-5" /> New game
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 sm:mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <HeroStat icon={HiOutlineCollection} label="Games" value={games ? games.length : '—'} sub={`${totalQuestions} question${totalQuestions === 1 ? '' : 's'} in total`} />
          <HeroStat icon={HiOutlinePlay} label="Times played" short="Played" value={games ? totalPlays : '—'} sub="Across every game" />
          <HeroStat icon={HiOutlineClock} label="Last played" value={lastPlayed ? fmtDate(lastPlayed).replace(/ \d{4}$/, '') : '—'} sub={lastPlayed ? fmtDate(lastPlayed) : 'Not played yet'} />
        </div>
      </div>

      {!games ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : !games.length ? (
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 sm:p-8">
          <div className="text-center max-w-md mx-auto">
            <span className="mx-auto w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center"><HiOutlineLightningBolt className="w-6 h-6" /></span>
            <h2 className="mt-4 text-base font-semibold text-slate-900">No games yet</h2>
            <p className="mt-1 text-[13px] text-slate-500">{canBuild ? 'Create your first game. You can also pull questions from an existing exam.' : 'Ask someone with exam-authoring rights to create one.'}</p>
            {canBuild && (
              <Button onClick={() => navigate('/admin/live/new')} className="mt-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold h-10 px-5">
                <HiOutlinePlusCircle className="w-5 h-5" /> Create a game
              </Button>
            )}
          </div>
          <ol className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><s.icon className="w-4 h-4" /></span>
                  <span className="text-[11px] font-semibold text-slate-400">Step {i + 1}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {games.map((g) => (
            <article key={g.id} className="group p-5 sm:p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 flex flex-col justify-between">
              <div className="space-y-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <CoverBadge cover={g.cover} size="md" className="mt-0.5 group-hover:scale-105 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm sm:text-base font-extrabold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors" title={g.title}>{g.title}</h2>
                      <p className="text-[11px] font-medium text-slate-400 mt-1">
                        {g.question_count} Question{g.question_count === 1 ? '' : 's'} · ~{Math.max(1, Math.round(((g.total_seconds || 0) + g.question_count * 12) / 60))} Mins
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded-full border ${g.question_count ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {g.question_count ? 'Ready' : 'Draft'}
                    </span>
                    {canBuild && (
                      <SimpleTooltip label="Delete game">
                        <Button variant="ghost" size="icon" onClick={() => remove(g)}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </Button>
                      </SimpleTooltip>
                    )}
                  </div>
                </div>

                {/* Description, fixed height so cards line up */}
                <div className="h-9 flex items-center">
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {g.description || <span className="italic text-slate-300">No description provided</span>}
                  </p>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-0.5">
                  {g.plays ? (
                    <SimpleTooltip label="Past games and winners">
                      <button type="button" onClick={() => setHistory(g)}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60 text-left hover:bg-blue-50/70 hover:border-blue-200 hover:text-blue-700 transition-colors">
                        <HiOutlineUserGroup className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate flex-1">{g.plays} {g.plays === 1 ? 'Play' : 'Plays'}</span>
                        <HiChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      </button>
                    </SimpleTooltip>
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
                      <HiOutlineUserGroup className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">0 Plays</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
                    <HiOutlineClock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{g.last_played ? `Last ${fmtDate(g.last_played).replace(/ \d{4}$/, '')}` : 'Never played'}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3.5 mt-3.5 border-t border-slate-100/90">
                <div className={`grid gap-2 ${canBuild ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {canBuild && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/live/${g.id}/edit`)}
                      className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1">
                      <HiOutlinePencil className="w-3.5 h-3.5 text-slate-400" /> Edit
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setHistory(g)} disabled={!g.plays}
                    className="w-full rounded-xl border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-2xs h-8 flex items-center justify-center gap-1">
                    <HiOutlineChartBar className="w-3.5 h-3.5 text-slate-400" /> Results
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => host(g)} disabled={starting === g.id || !g.question_count}
                    className="w-full rounded-xl border-blue-200/80 bg-blue-50/60 text-blue-700 hover:bg-blue-100/80 font-bold text-xs shadow-2xs h-8 flex items-center justify-center gap-1">
                    <HiOutlinePlay className="w-3.5 h-3.5 text-blue-600" /> {starting === g.id ? 'Starting…' : 'Host'}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {history && <HistoryDialog game={history} onClose={() => setHistory(null)} onChanged={load} onOpen={(sid) => navigate(`/admin/live/host/${sid}`)} />}
      {ConfirmDialog}
    </div>
  );
}
