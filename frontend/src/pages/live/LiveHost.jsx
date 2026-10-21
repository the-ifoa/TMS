import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlineArrowsExpand,
  HiOutlineClipboardCopy,
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineFlag,
  HiOutlineUsers,
  HiOutlineX,
  HiOutlinePlay,
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineUserGroup,
  HiOutlineSwitchHorizontal,
  HiOutlineShare,
  HiOutlineDownload,
} from 'react-icons/hi';
import { Crown } from 'lucide-react';
import { getLiveHostState, liveHostAction, startLiveSession } from '../../api';
import { useConfirm } from '@/hooks/use-confirm';
import {
  Backdrop,
  TYPE_LABEL,
  CountdownRing,
  Confetti,
  FloatingReactions,
  Medal,
  ordinal,
  Avatar,
  CoverBadge,
  IconTrophy,
  IconFlame,
  TeamChip,
  TeamStandings,
  teamStyle,
  useServerOffset,
  useTicker,
  usePoll,
} from '../../components/live/liveUi';

// ─── Live Quiz Host Screen (Executive, modern projector display) ───────────────

const joinBase = () => `${window.location.origin}/play`;

function TopBar({ s, onAction, onExit }) {
  const fullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();

  return (
    <header className="flex-shrink-0 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-3 border-b border-white/10 bg-slate-950/60 backdrop-blur-md z-20">
      <button
        type="button"
        onClick={onExit}
        aria-label="Exit Game"
        className="inline-flex items-center gap-2 p-2 sm:px-3.5 sm:py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-xs font-bold text-white transition-all shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Exit Game</span>
      </button>

      <div className="hidden sm:flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-semibold text-white">
        <CoverBadge cover={s.cover} />
        <span className="truncate max-w-xs tracking-tight">{s.title}</span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {s.status !== 'finished' && (
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-xs font-bold tabular-nums whitespace-nowrap">
            <span className="text-white/60 font-semibold text-[10px] uppercase tracking-wider">PIN</span>
            <span className="text-sm font-black text-white">{s.pin.replace(/(\d{3})(\d{3})/, '$1 $2')}</span>
          </div>
        )}
        {s.status !== 'finished' && (
          <button
            type="button"
            onClick={() => onAction(s.locked ? 'unlock' : 'lock')}
            title={s.locked ? 'Unlock lobby (allow new players)' : 'Lock lobby (stop new players)'}
            className="p-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white cursor-pointer transition-colors"
          >
            {s.locked ? <HiOutlineLockClosed className="w-4 h-4 text-amber-400" /> : <HiOutlineLockOpen className="w-4 h-4 text-white/80" />}
          </button>
        )}
        <button
          type="button"
          onClick={fullscreen}
          title="Toggle Fullscreen"
          className="p-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white cursor-pointer transition-colors"
        >
          <HiOutlineArrowsExpand className="w-4 h-4" />
        </button>
        {s.status !== 'finished' && s.status !== 'lobby' && (
          <button
            type="button"
            onClick={() => onAction('finish', null, 'End the game now and display final podium results?')}
            title="End game immediately"
            className="p-2 rounded-xl bg-white/[0.08] hover:bg-rose-500/80 border border-white/10 text-white cursor-pointer transition-colors"
          >
            <HiOutlineFlag className="w-4 h-4 text-rose-400 hover:text-white" />
          </button>
        )}
      </div>
    </header>
  );
}

// ── Shareable QR card ────────────────────────────────────────────────────────
// A PNG with the game title, QR code, PIN and link, drawn from a hidden
// high-resolution QR canvas — to post in a chat, email or Teams meeting.
function qrCardBlob(qrCanvas, { title, pin, link }) {
  const W = 900;
  const H = 1180;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0f172a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.beginPath();
  if (g.roundRect) g.roundRect(60, 60, W - 120, H - 120, 40);
  else g.rect(60, 60, W - 120, H - 120);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = '#64748b';
  g.font = '600 30px system-ui, sans-serif';
  g.fillText('QUIZ ARENA', W / 2, 140);
  g.fillStyle = '#0f172a';
  g.font = '800 46px system-ui, sans-serif';
  const t = title.length > 32 ? `${title.slice(0, 31)}…` : title;
  g.fillText(t, W / 2, 205);
  g.drawImage(qrCanvas, (W - 560) / 2, 250, 560, 560);
  g.fillStyle = '#64748b';
  g.font = '600 28px system-ui, sans-serif';
  g.fillText('Scan to join, or enter the PIN at', W / 2, 875);
  g.fillStyle = '#2563eb';
  g.font = '700 32px system-ui, sans-serif';
  g.fillText(link.replace(/^https?:\/\//, '').replace(/\/[^/]+$/, ''), W / 2, 920);
  g.fillStyle = '#0f172a';
  g.font = '900 96px system-ui, sans-serif';
  g.fillText(pin.replace(/(\d{3})(\d{3})/, '$1 $2'), W / 2, 1040);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

function ShareQrButtons({ s, link }) {
  const qrRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const fileName = `quiz-${s.pin}.png`;

  const makeFile = async () => {
    const blob = await qrCardBlob(qrRef.current, { title: s.title || 'Live quiz', pin: s.pin, link });
    return new File([blob], fileName, { type: 'image/png' });
  };
  const download = (file) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    setBusy(true);
    try {
      const file = await makeFile();
      const data = { files: [file], title: s.title, text: `Join "${s.title}" — PIN ${s.pin}: ${link}` };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
      } else {
        download(file);
        toast.success('Sharing isn\'t available in this browser, so the QR image was downloaded instead.');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Could not share the QR code.');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try { download(await makeFile()); } catch { toast.error('Could not create the QR image.'); }
  };

  const btn = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.18] text-xs font-bold text-white transition-all shadow-xs cursor-pointer border border-white/10 disabled:opacity-50';
  return (
    <>
      <QRCodeCanvas ref={qrRef} value={link} size={560} level="M" marginSize={0} style={{ display: 'none' }} aria-hidden />
      <button type="button" onClick={share} disabled={busy} className={btn}>
        <HiOutlineShare className="w-4 h-4 text-blue-300" /> {busy ? 'Preparing…' : 'Share QR'}
      </button>
      <button type="button" onClick={save} className={btn}>
        <HiOutlineDownload className="w-4 h-4 text-blue-300" /> Download QR
      </button>
    </>
  );
}

// ── Team setup (lobby) ───────────────────────────────────────────────────────
// Solo or 2–6 teams; players choose their team, or the game deals them out
// evenly. Names can be changed here until the game starts.
function TeamSetup({ s, onAction, busy }) {
  const count = s.teams.length;
  const set = (next) => onAction('teams', { count, pick: s.team_pick, ...next });
  const seg = (on) => `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${on ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white hover:bg-white/10'}`;

  return (
    <div className="flex-shrink-0 w-full flex flex-col items-center gap-2.5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/60"><HiOutlineUserGroup className="w-4 h-4" /> Teams</span>
        <div className="inline-flex p-1 rounded-xl bg-white/[0.06] border border-white/10" role="group" aria-label="Number of teams">
          {[0, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" disabled={busy} onClick={() => n !== count && set({ count: n })} className={seg(n === count)} aria-pressed={n === count}>
              {n === 0 ? 'Solo' : n}
            </button>
          ))}
        </div>
        {count > 0 && (
          <div className="inline-flex p-1 rounded-xl bg-white/[0.06] border border-white/10" role="group" aria-label="Who answers">
            {[['each', 'Everyone answers'], ['captain', 'Captain answers']].map(([k, label]) => (
              <button key={k} type="button" disabled={busy} onClick={() => k !== s.team_answer && set({ team_answer: k })} className={seg(s.team_answer === k)} aria-pressed={s.team_answer === k}>
                {label}
              </button>
            ))}
          </div>
        )}
        {count > 0 && (
          <div className="inline-flex p-1 rounded-xl bg-white/[0.06] border border-white/10" role="group" aria-label="How players get a team">
            {[['player', 'Players choose'], ['auto', 'Auto-balance']].map(([k, label]) => (
              <button key={k} type="button" disabled={busy} onClick={() => k !== s.team_pick && set({ pick: k })} className={seg(s.team_pick === k)} aria-pressed={s.team_pick === k}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {count > 0 && (
        <p className="text-[11px] text-white/50 text-center">
          {s.team_pick === 'player' ? 'Players pick a team on their phone. Anyone without one is placed in the smallest team at the start.' : 'Players are spread evenly across the teams.'}{' '}
          {s.team_answer === 'captain'
            ? 'Each team talks it over and only its captain answers. Click the crown next to a player to make them captain.'
            : 'The team score is the average of its players\' points.'}
        </p>
      )}
    </div>
  );
}

// Lobby player chip: click to remove; in team mode an arrow moves them on.
function PlayerChip({ p, s, onAction }) {
  const keys = s.teams.map((t) => t.key);
  const nextTeam = keys.length ? keys[(keys.indexOf(p.team) + 1) % keys.length] : null;
  return (
    <motion.span
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 20 }}
      className="inline-flex items-center rounded-full bg-white/[0.08] border border-white/10 backdrop-blur-md text-sm font-bold text-white"
    >
      <button
        type="button"
        title="Click to remove player"
        onClick={() => onAction('kick', { player_id: p.id }, `Remove ${p.nickname} from the game?`)}
        className="group inline-flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-full hover:bg-rose-500/80 transition-all cursor-pointer"
      >
        <span className="group-hover:hidden"><Avatar id={p.avatar} size={32} /></span>
        <span className="hidden group-hover:inline-flex w-8 h-8 rounded-full bg-white/20 items-center justify-center"><HiOutlineX className="w-4 h-4 text-white" /></span>
        <span>{p.nickname}</span>
      </button>
      {s.team_answer === 'captain' && p.team && (
        <button
          type="button"
          title={p.captain ? 'Team captain' : 'Make team captain'}
          aria-label={p.captain ? `${p.nickname} is captain` : `Make ${p.nickname} captain`}
          aria-pressed={p.captain}
          onClick={() => !p.captain && onAction('captain', { player_id: p.id })}
          className={`p-1.5 rounded-full cursor-pointer ${p.captain ? 'text-amber-300' : 'text-white/30 hover:text-amber-200 hover:bg-white/15'}`}
        >
          <Crown className="w-3.5 h-3.5" strokeWidth={2.25} fill={p.captain ? 'currentColor' : 'none'} />
        </button>
      )}
      {nextTeam && keys.length > 1 && (
        <button
          type="button"
          title={`Move to ${s.teams.find((t) => t.key === nextTeam)?.name}`}
          aria-label={`Move ${p.nickname} to ${s.teams.find((t) => t.key === nextTeam)?.name}`}
          onClick={() => onAction('move', { player_id: p.id, team: nextTeam })}
          className="mr-1.5 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/15 cursor-pointer"
        >
          <HiOutlineSwitchHorizontal className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.span>
  );
}

// Team name, editable in the lobby (saved on Enter / leaving the field).
function TeamName({ t, s, onAction, busy }) {
  const [name, setName] = useState(t.name);
  useEffect(() => setName(t.name), [t.name]);
  const save = () => {
    const clean = name.trim();
    if (!clean || clean === t.name) { setName(t.name); return; }
    onAction('teams', { count: s.teams.length, pick: s.team_pick, names: { [t.key]: clean } });
  };
  return (
    <input
      value={name}
      disabled={busy}
      maxLength={20}
      aria-label="Team name"
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(t.name); e.currentTarget.blur(); } }}
      className="flex-1 min-w-0 bg-transparent text-base font-black text-white outline-none rounded-lg px-1.5 py-0.5 hover:bg-white/[0.06] focus:bg-white/10 focus:ring-1 focus:ring-white/30"
    />
  );
}

function Lobby({ s, onAction, busy }) {
  const link = `${joinBase()}/${s.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied to clipboard.');
    } catch {
      toast.error('Copy failed.');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center px-4 py-4 sm:py-6 gap-4 sm:gap-5 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex-shrink-0 w-full bg-white/[0.06] backdrop-blur-xl border border-white/10 text-white rounded-3xl shadow-2xl p-5 sm:p-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 sm:gap-8 items-center"
      >
        <div className="text-center md:text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">Join on your phone or laptop at</p>
          <p className="text-xl sm:text-3xl font-black text-blue-400 mt-1 break-all tracking-tight">
            {joinBase().replace(/^https?:\/\//, '')}
          </p>

          <p className="mt-3 sm:mt-5 text-xs font-bold uppercase tracking-wider text-white/60">Game PIN</p>
          <motion.p
            className="text-[clamp(2.75rem,9vh,6rem)] leading-none mt-1 font-black tracking-wider sm:tracking-widest tabular-nums text-white whitespace-nowrap"
            initial={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            {s.pin.replace(/(\d{3})(\d{3})/, '$1 $2')}
          </motion.p>

          <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.18] text-xs font-bold text-white transition-all shadow-xs cursor-pointer border border-white/10"
            >
              <HiOutlineClipboardCopy className="w-4 h-4 text-blue-300" /> Copy invite link
            </button>
            <ShareQrButtons s={s} link={link} />
          </div>
        </div>

        <div className="hidden min-[400px]:flex mx-auto p-3 sm:p-4 rounded-2xl bg-white text-slate-900 shadow-2xl flex-col items-center">
          <QRCodeSVG value={link} size={180} level="M" className="w-[clamp(96px,19vh,180px)] h-auto" />
          <p className="mt-2 text-center text-xs font-black text-slate-700">Scan to join</p>
        </div>
      </motion.div>

      <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/[0.08] border border-white/10 text-base font-black text-white tabular-nums shadow-xs">
          <HiOutlineUsers className="w-5 h-5 text-blue-400" /> {s.players.length} player{s.players.length === 1 ? '' : 's'} ready
        </span>
        <button
          type="button"
          disabled={busy || !s.players.length}
          onClick={() => onAction('start')}
          className="inline-flex items-center gap-2 px-7 sm:px-9 py-2.5 sm:py-3 text-base sm:text-lg font-black rounded-2xl bg-white text-slate-900 shadow-2xl hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
        >
          <HiOutlinePlay className="w-5 h-5 text-blue-600" /> Start game
        </button>
      </div>

      {s.locked && (
        <p className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-400/20 px-3 py-1 rounded-full">
          <HiOutlineLockClosed className="w-3.5 h-3.5" /> Lobby locked. No new players can join.
        </p>
      )}

      <TeamSetup s={s} onAction={onAction} busy={busy} />

      {/* Players list — one column per team in team mode */}
      {s.teams.length > 0 && (
        <div className={`flex-1 min-h-0 w-full overflow-y-auto p-1 grid gap-3 grid-cols-1 sm:grid-cols-2 ${s.teams.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
          {s.teams.map((t) => {
            const members = s.players.filter((p) => p.team === t.key);
            return (
              <div key={t.key} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 flex flex-col gap-2.5 min-h-[6rem]">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${teamStyle(t.key).dot}`} />
                  <TeamName t={t} onAction={onAction} s={s} busy={busy} />
                  <span className="text-xs font-bold text-white/60 tabular-nums">{members.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence>
                    {members.map((p) => <PlayerChip key={p.id} p={p} s={s} onAction={onAction} />)}
                  </AnimatePresence>
                  {!members.length && <p className="text-xs text-white/40">No players yet</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className={`flex-1 min-h-0 w-full flex flex-wrap content-start justify-center gap-2.5 overflow-y-auto p-1 ${s.teams.length ? 'hidden' : ''}`}>
        {!s.players.length && (
          <motion.p
            className="text-white/60 font-bold text-base mt-2"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Waiting for players to join…
          </motion.p>
        )}
        <AnimatePresence>
          {!s.teams.length && s.players.map((p) => <PlayerChip key={p.id} p={p} s={s} onAction={onAction} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Answer tiles on the big screen ───────────────────────────────────────────
// Compact rows (letter · answer · votes) so four to six answers always fit
// under the question. After the reveal the right answer turns green and each
// row fills with its share of the votes.
function OptionTiles({ q, reveal, counts }) {
  const totalVotes = (counts || []).reduce((a, b) => a + b, 0);
  return (
    <div className={`w-full grid gap-2.5 sm:gap-3 ${q.options.length > 4 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
      {q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        const right = reveal && q.type !== 'poll' && q.correct.includes(i);
        const dim = reveal && q.type !== 'poll' && !right;
        const count = counts?.[i] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: dim ? 0.5 : 1, y: 0 }}
            transition={{ delay: reveal ? 0 : i * 0.04 }}
            className={`relative overflow-hidden rounded-2xl border flex items-center gap-3 sm:gap-4 px-3.5 sm:px-5 py-3 sm:py-[clamp(0.75rem,2vh,1.25rem)] ${
              right ? 'bg-emerald-500/15 border-emerald-400/70' : 'bg-white/[0.06] border-white/10'
            }`}
          >
            {reveal && (
              <motion.div
                aria-hidden
                className={`absolute inset-y-0 left-0 ${right ? 'bg-emerald-400/15' : 'bg-white/[0.05]'}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            )}
            <span className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl font-black text-sm sm:text-base flex items-center justify-center flex-shrink-0 ${right ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/90'}`}>
              {right ? <HiOutlineCheck className="w-5 h-5 stroke-[3]" /> : letter}
            </span>
            <p className="relative flex-1 min-w-0 text-base sm:text-xl lg:text-2xl font-bold leading-snug tracking-tight text-white line-clamp-2">{o.text}</p>
            {reveal && (
              <span className="relative flex-shrink-0 text-right tabular-nums leading-none">
                <span className="block text-lg sm:text-2xl font-black text-white">{pct}%</span>
                <span className="block mt-1 text-[10px] sm:text-xs font-semibold text-white/60">{count} {count === 1 ? 'vote' : 'votes'}</span>
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Question Stage & Live Results ─────────────────────────────────────────────
// One window tall: status strip, question, picture (takes the space left),
// answers, host buttons. Nothing pushes the page into scrolling.
function QuestionStage({ s, now, onAction, busy }) {
  const q = s.question;
  const starts = new Date(s.question_starts_at).getTime();
  const ends = new Date(s.question_ends_at).getTime();
  const ready = now < starts;
  const isQuestion = s.status === 'question';
  const reveal = s.status === 'reveal';
  const last = s.current_index + 1 >= s.total;
  const pill = 'px-3 py-1.5 rounded-lg bg-white/[0.07] border border-white/10 text-xs font-semibold text-white/90 whitespace-nowrap';
  // Captain mode counts teams, not players.
  const captains = s.team_answer === 'captain' && s.teams.length > 0;
  const playingTeams = new Set(s.players.map((p) => p.team).filter(Boolean));
  const answeredCount = captains ? new Set(s.players.filter((p) => p.answered).map((p) => p.team)).size : s.answered;
  const answeredOf = captains ? playingTeams.size : s.players.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-6xl mx-auto px-4 sm:px-8 py-3 sm:py-5 gap-3 sm:gap-4">
      {/* Status strip: where we are, answers in, time left */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className={pill}>Question {s.current_index + 1} / {s.total}</span>
          <span className={`${pill} hidden sm:inline`}>{TYPE_LABEL[q.type]}</span>
          {q.points === 'double' && <span className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold whitespace-nowrap">2× points</span>}
          {captains && <span className={`${pill} hidden md:inline-flex items-center gap-1.5`}><Crown className="w-3.5 h-3.5 text-amber-300" /> Captains answer</span>}
          {s.shuffle_options && q.type !== 'true_false' && <span className={`${pill} hidden md:inline`}>Answers are shuffled on each phone</span>}
        </div>
        {!(isQuestion && ready) && (
          <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
            <div className="text-right leading-none">
              <p className="text-2xl sm:text-3xl font-black tabular-nums text-white">
                {answeredCount}<span className="text-sm sm:text-base font-semibold text-white/50"> / {answeredOf}</span>
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/50">{captains ? 'Teams answered' : 'Answered'}</p>
            </div>
            {isQuestion ? (
              <CountdownRing msLeft={ends - now} totalMs={q.time_limit * 1000} size={60} />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-xs sm:text-sm font-bold whitespace-nowrap">
                <HiOutlineCheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                {q.type === 'poll' ? 'Poll results' : 'Answer revealed'}
              </span>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isQuestion && ready ? (
          <motion.div
            key="ready"
            className="flex-1 min-h-0 flex flex-col items-center justify-center text-center"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">Coming up next</p>
            <h2 className="mt-3 text-[clamp(1.75rem,3vw+1.5vh,3.25rem)] font-black max-w-4xl leading-tight text-white line-clamp-4">{q.prompt}</h2>
            <div className="mt-8 w-72 max-w-full h-2 rounded-full bg-white/15 overflow-hidden">
              <motion.div
                className="h-full bg-white"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: Math.max(0.2, (starts - now) / 1000), ease: 'linear' }}
              />
            </div>
            <p className="mt-3 text-xs font-bold text-white/70">Get ready to answer on your phone…</p>
          </motion.div>
        ) : (
          <motion.div
            key={`q-${s.current_index}-${s.status}`}
            className="flex-1 min-h-0 flex flex-col gap-3 sm:gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Question — fills the space when there is no picture */}
            <div className={`${q.image_url ? 'flex-shrink-0' : 'flex-1 min-h-0'} flex items-center justify-center rounded-3xl bg-white/[0.06] border border-white/10 px-5 sm:px-10 py-4 sm:py-6 text-center`}>
              <h2 className="text-[clamp(1.25rem,2.4vw+1vh,3.25rem)] font-black text-white leading-tight tracking-tight line-clamp-4">{q.prompt}</h2>
            </div>

            {q.image_url && (
              <div className="flex-1 min-h-[4rem] flex items-center justify-center">
                <img src={q.image_url} alt="" className="max-h-full max-w-full rounded-2xl shadow-xl object-contain border border-white/10" />
              </div>
            )}

            <div className="flex-shrink-0">
              <OptionTiles q={q} reveal={reveal} counts={s.distribution} />
            </div>

            {/* Host buttons */}
            <div className="flex-shrink-0 flex items-center justify-end gap-2.5 sm:gap-3 pt-3 border-t border-white/10">
              {isQuestion && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction('reveal')}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold text-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  Show answer early
                </button>
              )}
              {reveal && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction('next')}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold text-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  {last ? <><IconTrophy className="w-4 h-4" /> Final results</> : <>Skip<span className="hidden sm:inline"> to next question</span> <HiOutlineArrowRight className="w-4 h-4" /></>}
                </button>
              )}
              {reveal && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction('leaderboard')}
                  className="inline-flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-sm sm:text-base shadow-xl hover:bg-slate-100 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <HiOutlineChartBar className="w-5 h-5 text-slate-700" />
                  <span>Leaderboard</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Leaderboard (Executive Presentation Design) ──────────────────────────────
function Leaderboard({ s, onAction, busy }) {
  const top = s.players.slice(0, s.team_standings ? 3 : 5);
  const last = s.current_index + 1 >= s.total;
  const teamOf = (key) => s.teams.find((t) => t.key === key);

  // Keyboard shortcut: Space or Enter advances to next question
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        if (!busy) {
          e.preventDefault();
          onAction('next');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onAction]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-4 py-4 sm:py-6">
     <div className="my-auto w-full max-w-4xl mx-auto">
      {/* Executive Leaderboard Container */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full bg-white/[0.06] backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-[clamp(1.25rem,3.5vh,2.5rem)] shadow-2xl flex flex-col gap-[clamp(0.75rem,2.2vh,1.5rem)]"
      >
        {/* Header inside Container */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-[clamp(0.75rem,2vh,1.25rem)] border-b border-white/10">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shadow-lg flex-shrink-0">
              <IconTrophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight">Leaderboard</h2>
              <p className="text-xs text-white/60 font-medium mt-0.5">
                Progress after Question {s.current_index + 1} of {s.total}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] border border-white/10 text-xs font-bold text-white shadow-xs">
              {s.players.length} {s.players.length === 1 ? 'Player' : 'Players'}
            </span>
            <span className="px-3.5 py-1.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold shadow-xs">
              Live Scores
            </span>
          </div>
        </div>

        {s.team_standings && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Teams</p>
            <TeamStandings standings={s.team_standings} />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-white/60">Top players</p>
          </div>
        )}

        {/* Player Standings List */}
        <div className="space-y-[clamp(0.4rem,1.2vh,0.75rem)]">
          {top.map((p, i) => {
            const isFirst = i === 0;
            const isSecond = i === 1;
            const isThird = i === 2;

            return (
              <motion.div
                key={p.id}
                layout
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
                className={`flex items-center gap-2.5 sm:gap-4 rounded-2xl px-3 py-3 sm:px-5 sm:py-[clamp(0.5rem,1.6vh,1rem)] transition-all ${
                  isFirst
                    ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-white/[0.06] backdrop-blur-xl border border-amber-400/40 shadow-[0_0_25px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/25 text-white'
                    : isSecond
                    ? 'bg-white/[0.08] backdrop-blur-xl border border-slate-300/30 text-white'
                    : isThird
                    ? 'bg-white/[0.06] backdrop-blur-xl border border-amber-600/30 text-white'
                    : 'bg-white/[0.04] backdrop-blur-md border border-white/10 text-white/90'
                }`}
              >
                {/* Rank Badge */}
                <span
                  className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center flex-shrink-0 shadow-xs ${
                    isFirst
                      ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 font-extrabold'
                      : isSecond
                      ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-extrabold'
                      : isThird
                      ? 'bg-gradient-to-br from-orange-300 to-amber-600 text-slate-950 font-extrabold'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {i + 1}
                </span>

                {/* Player Avatar */}
                <span className="sm:hidden"><Avatar id={p.avatar} size={32} ring={isFirst} /></span>
                <span className="hidden sm:inline-flex"><Avatar id={p.avatar} size={42} ring={isFirst} /></span>

                {/* Nickname */}
                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-xl font-black text-white truncate tracking-tight">{p.nickname}</p>
                  {p.team && <TeamChip team={teamOf(p.team)} className="mt-0.5" />}
                  {isFirst && !p.team && <p className="hidden sm:block text-[11px] font-bold text-amber-400/90 uppercase tracking-wider">Tournament Leader</p>}
                  {p.last_points > 0 && <p className="sm:hidden text-[11px] font-bold text-emerald-400 tabular-nums">+{p.last_points} this round</p>}
                </div>

                {/* Points Gain Pill */}
                {p.last_points > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="hidden sm:inline-block px-3 py-1 rounded-xl bg-emerald-500 text-white text-xs font-black shadow-xs flex-shrink-0"
                  >
                    +{p.last_points}
                  </motion.span>
                )}

                {/* Total Score */}
                <div className="text-right flex-shrink-0">
                  <span
                    className={`text-xl sm:text-2xl font-black tabular-nums ${
                      isFirst ? 'text-amber-400' : 'text-white'
                    }`}
                  >
                    {p.score.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-bold text-white/50 block">pts</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-[clamp(0.75rem,2vh,1rem)] border-t border-white/10">
          <p className="text-xs font-medium text-white/50 hidden sm:block">
            Tip: Press <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white text-[11px] font-mono">Space</kbd> or click to proceed
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction('next')}
            className="w-full sm:w-auto ml-auto px-8 py-3.5 text-base font-black rounded-2xl bg-white text-slate-900 shadow-2xl hover:bg-slate-100 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            {last ? <><IconTrophy className="w-4 h-4" /><span>View Final Results</span></> : <><span>Next Question</span><HiOutlineArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </motion.div>
     </div>
    </div>
  );
}

// ── Podium Screen ────────────────────────────────────────────────────────────
function Podium({ s, onReplay }) {
  const r = s.results || [];
  const order = [r[1], r[0], r[2]].filter(Boolean);
  const height = { 1: 'h-[max(16vh,7rem)]', 2: 'h-[max(12vh,5.5rem)]', 3: 'h-[max(9vh,4.5rem)]' };
  const tone = { 1: 'from-amber-300 to-amber-500', 2: 'from-slate-200 to-slate-400', 3: 'from-orange-300 to-orange-500' };
  const winningTeam = s.team_standings?.find((t) => t.members > 0);
  const teamName = (key) => s.teams.find((t) => t.key === key)?.name || '';

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center px-4 pt-3 sm:pt-5 pb-4 gap-3 sm:gap-4 max-w-5xl mx-auto w-full">
      <Confetti />
      <motion.h2
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring' }}
        className="flex-shrink-0 inline-flex items-center gap-3 sm:gap-4 text-[clamp(1.5rem,3vw+1.5vh,3.5rem)] font-black text-center text-white leading-tight"
      >
        <IconTrophy className="w-[1em] h-[1em] text-amber-400 flex-shrink-0" />
        <span>{winningTeam ? `${winningTeam.name} wins!` : r[0] ? `${r[0].nickname} wins!` : 'Game finished'}</span>
      </motion.h2>

      {s.team_standings && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex-shrink-0 w-full max-w-3xl">
          <TeamStandings standings={s.team_standings} compact />
          {r[0] && <p className="mt-2 text-center text-xs font-semibold text-white/60">Top player: {r[0].nickname}</p>}
        </motion.div>
      )}

      <div className="flex-shrink-0 flex items-end justify-center gap-3 sm:gap-5 w-full max-w-3xl">
        {order.map((p) => {
          const delay = (3 - p.rank) * 0.4;
          return (
            <div key={p.id} className="w-[31%] max-w-[13rem] flex flex-col items-center text-center min-w-0">
              <motion.span
                className="block"
                initial={{ y: -150, opacity: 0 }}
                animate={{ y: [0, -8, 0], opacity: 1 }}
                transition={{
                  y: { delay: 1 + delay, duration: 1.2, repeat: Infinity, repeatDelay: 1 },
                  opacity: { delay: 0.5 + delay },
                }}
              >
                <Avatar id={p.avatar} size={p.rank === 1 ? 64 : 48} ring />
              </motion.span>
              <motion.div
                className="mt-3 w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 + delay }}
              >
                <p className="text-sm sm:text-lg font-bold text-white truncate tracking-tight">{p.nickname}</p>
                <p className="mt-0.5 text-sm font-semibold text-amber-300 tabular-nums">{p.score.toLocaleString()} pts</p>
                <p className="mt-1.5 hidden sm:flex items-center justify-center gap-x-3 gap-y-1 flex-wrap text-[11px] font-medium text-white/60 tabular-nums">
                  <span className="inline-flex items-center gap-1"><HiOutlineCheckCircle className="w-3.5 h-3.5" />{p.correct}/{p.out_of}</span>
                  <span className="inline-flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" />{p.avg_time_s ?? '—'}s</span>
                  <span className="inline-flex items-center gap-1"><IconFlame className="w-3.5 h-3.5" />{p.best_streak}</span>
                </p>
              </motion.div>
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.3 + delay, type: 'spring', stiffness: 90 }}
                style={{ originY: 1 }}
                className={`mt-3 w-full ${height[p.rank]} rounded-t-2xl bg-gradient-to-b ${tone[p.rank]} shadow-2xl flex flex-col items-center pt-2.5 text-slate-900 overflow-hidden`}
              >
                <span className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                  <Medal rank={p.rank} size={18} />
                </span>
                <span className="mt-1 text-xl sm:text-2xl font-black tracking-tight text-slate-900/80 leading-none">{ordinal(p.rank)}</span>
              </motion.div>
            </div>
          );
        })}
      </div>

      {r.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2 }}
          className="flex-1 min-h-[9rem] w-full max-w-3xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-900">Final standings</p>
              <p className="text-[11px] text-slate-500">{r.length} player{r.length === 1 ? '' : 's'} · {s.total} question{s.total === 1 ? '' : 's'}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onReplay}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs cursor-pointer whitespace-nowrap"
              >
                <HiOutlineRefresh className="w-4 h-4" /> Play again
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  {['Rank', 'Player', ...(s.teams.length ? ['Team'] : []), 'Score', 'Correct', 'Accuracy', 'Avg time', 'Streak'].map((h) => (
                    <th key={h} className={`px-2 sm:px-4 py-2.5 font-semibold ${h === 'Rank' ? 'w-10 sm:w-16 text-center' : h === 'Player' ? 'text-left' : 'text-right'} ${['Accuracy', 'Avg time', 'Streak'].includes(h) ? 'hidden sm:table-cell' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-2 sm:px-4 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-xs font-bold text-slate-600 tabular-nums">
                        {p.rank <= 3 ? <Medal rank={p.rank} size={16} /> : p.rank}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 font-semibold max-w-[8rem] sm:max-w-none">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar id={p.avatar} size={28} />
                        <span className="truncate">{p.nickname}</span>
                      </span>
                    </td>
                    {s.teams.length > 0 && (
                      <td className="px-2 sm:px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                          <span className={`w-2 h-2 rounded-full ${teamStyle(p.team).dot}`} />{teamName(p.team)}
                        </span>
                      </td>
                    )}
                    <td className="px-2 sm:px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">{p.score.toLocaleString()}</td>
                    <td className="px-2 sm:px-4 py-2.5 text-right tabular-nums">{p.correct}/{p.out_of}</td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums">{p.accuracy != null ? `${p.accuracy}%` : '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums">{p.avg_time_s != null ? `${p.avg_time_s}s` : '—'}</td>
                    <td className="hidden sm:table-cell px-4 py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">
                        <IconFlame className="w-3.5 h-3.5 text-orange-500" />{p.best_streak}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main Live Host Component ─────────────────────────────────────────────────
export default function LiveHost() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();
  const offset = useServerOffset(s?.server_now);
  useTicker(s?.status === 'question', 100);
  const now = Date.now() + offset;

  const refresh = useCallback(async () => {
    try {
      const { data } = await getLiveHostState(sessionId);
      setS(data);
      setError('');
    } catch (err) {
      if (err.response?.status === 404) setError('This game session was not found.');
    }
  }, [sessionId]);
  usePoll(refresh, 1000, [sessionId]);

  const onAction = async (action, extra, question) => {
    if (question && !(await confirm(question, { title: 'Are you sure?', confirmLabel: 'Yes' }))) return;
    setBusy(true);
    try {
      const { data } = await liveHostAction(sessionId, action, extra || {});
      setS(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  // Leaving a game that hasn't reached the podium: end it for everyone, or
  // keep it running so it can be resumed from Past games.
  const exitGame = async () => {
    if (s && s.status !== 'finished') {
      const end = await confirm(
        'Players are still in this game. End it now and they see the final results, or keep it running so you can resume it from Past games.',
        { title: 'Leave this game?', confirmLabel: 'End game', cancelLabel: 'Keep it running' },
      );
      if (end) await liveHostAction(sessionId, 'finish', {}).catch(() => {});
    }
    navigate('/admin/live');
  };

  const replay = async () => {
    try {
      const { data: g } = await getLiveHostState(sessionId);
      const gameId = g.game_id;
      if (!gameId) {
        navigate('/admin/live');
        return;
      }
      const { data } = await startLiveSession(gameId);
      navigate(`/admin/live/host/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not restart game.');
    }
  };

  if (error) {
    return (
      <Backdrop>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-2xl font-black text-white">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/live')}
            className="px-5 py-2.5 rounded-xl bg-white text-slate-900 font-bold"
          >
            Back to games
          </button>
        </div>
      </Backdrop>
    );
  }

  if (!s) {
    return (
      <Backdrop>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <TopBar s={s} onAction={onAction} onExit={exitGame} />
      <FloatingReactions reactions={s.reactions} />
      {s.status === 'lobby' && <Lobby s={s} onAction={onAction} busy={busy} />}
      {(s.status === 'question' || s.status === 'reveal') && s.question && (
        <QuestionStage s={s} now={now} onAction={onAction} busy={busy} />
      )}
      {s.status === 'leaderboard' && <Leaderboard s={s} onAction={onAction} busy={busy} />}
      {s.status === 'finished' && <Podium s={s} onReplay={replay} />}
      {ConfirmDialog}
    </Backdrop>
  );
}
