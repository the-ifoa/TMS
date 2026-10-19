import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineClock,
  HiOutlineChartBar,
  HiOutlineUsers,
  HiOutlineLogout,
  HiOutlineQuestionMarkCircle,
  HiOutlineFlag,
  HiOutlineLockClosed,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import { Gamepad2 } from 'lucide-react';
import { resolveLivePin, getLivePublic, joinLiveGame, getLivePlayerState, answerLive, reactLive } from '../../api';
import {
  Backdrop,
  AVATARS,
  REACTIONS,
  REACTION_ICONS,
  TYPE_LABEL,
  Confetti,
  ordinal,
  Avatar,
  CoverBadge,
  ReactionIcon,
  Medal,
  IconTrophy,
  IconFlame,
  IconBolt,
  useServerOffset,
  useTicker,
  usePoll,
} from '../../components/live/liveUi';

// ─── Live quiz — player (phone / desktop) ─────────────────────────────────────

const tokenKey = (code) => `liveplayer:${code}`;
const readToken = (code) => {
  try {
    return localStorage.getItem(tokenKey(code)) || '';
  } catch {
    return '';
  }
};
const saveToken = (code, t) => {
  try {
    localStorage.setItem(tokenKey(code), t);
  } catch {
    /* ignore */
  }
};
const dropToken = (code) => {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {
    /* ignore */
  }
};

function Center({ children }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center text-center px-4 sm:px-6 py-6 gap-4 w-full max-w-lg mx-auto [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
      {children}
    </div>
  );
}

// ── PIN Entry Screen ─────────────────────────────────────────────────────────
function PinEntry() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length !== 6) {
      toast.error('The game PIN has 6 digits.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await resolveLivePin(clean);
      navigate(`/play/${data.code}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No game found with that PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <Center>
        <div className="w-16 h-16 rounded-2xl bg-white/[0.1] border border-white/15 text-white flex items-center justify-center shadow-xl">
          <Gamepad2 strokeWidth={1.75} className="w-8 h-8 text-blue-300" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Join Quiz Arena</h1>
          <p className="text-xs text-white/60 font-medium mt-1">Enter the 6-digit PIN shown on the main screen</p>
        </div>

        <div className="w-full bg-white/[0.08] backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-7 shadow-2xl mt-2">
          <form onSubmit={go} className="space-y-4">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000 000"
              aria-label="Game PIN"
              className="w-full text-center text-3xl sm:text-4xl font-black tracking-[0.25em] py-4 rounded-2xl bg-white/[0.07] border border-white/20 focus:border-white focus:bg-white/[0.12] text-white outline-none placeholder:tracking-normal placeholder:text-white/20 transition-all"
            />
            <button
              type="submit"
              disabled={busy || pin.length !== 6}
              className="w-full py-3.5 rounded-2xl text-base font-black text-slate-900 bg-white hover:bg-slate-100 shadow-xl active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Connecting…' : 'Enter game'}
            </button>
          </form>
        </div>
      </Center>
    </Backdrop>
  );
}

// ── Join Form (Pick Avatar & Nickname) ────────────────────────────────────────
function JoinForm({ code, info, onJoined }) {
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [busy, setBusy] = useState(false);

  const join = async (e) => {
    e.preventDefault();
    if (nickname.trim().length < 2) {
      toast.error('Pick a nickname with at least 2 characters.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await joinLiveGame(code, { nickname: nickname.trim(), avatar });
      saveToken(code, data.token);
      onJoined(data.token);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not join game.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-4 py-6 max-w-md w-full mx-auto [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
      <div className="mb-2"><CoverBadge cover={info.cover} size="lg" /></div>
      <h1 className="text-2xl font-black text-white text-center tracking-tight">{info.title}</h1>
      <p className="text-xs text-white/60 font-medium mt-0.5">Customize your player profile</p>

      <div className="w-full bg-white/[0.08] backdrop-blur-xl border border-white/15 rounded-3xl p-6 shadow-2xl mt-5">
        <form onSubmit={join} className="space-y-4">
          <div className="flex flex-col items-center">
            <motion.span
              key={avatar}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Avatar id={avatar} size={72} ring />
            </motion.span>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Choose Avatar</p>
          </div>

          <div className="grid grid-cols-7 gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded-2xl bg-black/20 border border-white/5">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                aria-label={`Avatar ${a}`}
                aria-pressed={avatar === a}
                className={`h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  avatar === a ? 'bg-white/25 ring-2 ring-white scale-105' : 'hover:bg-white/10'
                }`}
              >
                <Avatar id={a} size={28} />
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
              Player Nickname
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 24))}
              placeholder="Enter your name"
              autoFocus
              maxLength={24}
              className="w-full text-center text-lg font-bold py-3 px-4 rounded-xl bg-white/[0.07] border border-white/20 focus:border-white focus:bg-white/[0.12] text-white outline-none placeholder:text-white/30 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !nickname.trim()}
            className="w-full py-3.5 rounded-2xl text-base font-black text-slate-900 bg-white hover:bg-slate-100 shadow-xl active:scale-95 disabled:opacity-40 transition-all cursor-pointer mt-2"
          >
            {busy ? 'Joining…' : 'Join game'}
          </button>
        </form>
      </div>

      {info.players?.length > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 mt-4">
          <HiOutlineUsers className="w-4 h-4 text-blue-400" /> {info.players.length} {info.players.length === 1 ? 'player' : 'players'} already in the lobby
        </p>
      )}
    </div>
  );
}

// ── Reaction Bar ─────────────────────────────────────────────────────────────
function ReactionBar({ code, token }) {
  const [sent, setSent] = useState(null);
  const send = async (s) => {
    setSent(s + Date.now());
    try {
      await reactLive(code, token, s);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {REACTIONS.map((r) => (
        <motion.button
          key={r}
          type="button"
          whileTap={{ scale: 1.35 }}
          onClick={() => send(r)}
          aria-label={REACTION_ICONS[r][2]}
          className="w-11 h-11 rounded-2xl bg-white/[0.1] hover:bg-white/[0.18] border border-white/10 flex items-center justify-center shadow-md cursor-pointer transition-colors"
        >
          <ReactionIcon id={r} size={20} />
        </motion.button>
      ))}
      <AnimatePresence>
        {sent && <motion.span key={sent} className="sr-only" exit={{ opacity: 0 }}>sent</motion.span>}
      </AnimatePresence>
    </div>
  );
}

// ── Top Player Header ────────────────────────────────────────────────────────
function Header({ v }) {
  const inGame = v.current_index >= 0 && v.status !== 'lobby' && v.status !== 'finished';
  return (
    <header className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-4 py-2.5 bg-slate-950/60 backdrop-blur-md border-b border-white/10 z-20">
      <div className="justify-self-start inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/[0.08] border border-white/10 text-white font-bold text-xs min-w-0 max-w-full">
        <Avatar id={v.me.avatar} size={24} />
        <span className="truncate">{v.me.nickname}</span>
      </div>

      <span className="text-[11px] font-semibold text-white/60 tabular-nums whitespace-nowrap">
        {inGame ? `Question ${v.current_index + 1} of ${v.total}` : ''}
      </span>

      <div className="justify-self-end inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-slate-900 font-black text-xs shadow-xs tabular-nums whitespace-nowrap">
        <IconTrophy className="w-3 h-3 text-amber-500" />
        <span>{v.me.score.toLocaleString()} pts</span>
      </div>
    </header>
  );
}

// ── Answer Pad (Touch Option Cards) ──────────────────────────────────────────
function AnswerPad({ v, now, onAnswer, busy }) {
  const q = v.question;
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked([]), [v.current_index]);
  const multi = q.type === 'multi';
  const ends = new Date(v.question_ends_at).getTime();
  const left = Math.max(0, ends - now);

  const tap = (i) => {
    if (busy) return;
    if (!multi) {
      onAnswer([i]);
      return;
    }
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col max-w-lg w-full mx-auto px-4 py-3 sm:py-4 gap-3">
      {/* Timer and Prompt Box */}
      <div className="flex-shrink min-h-0 flex flex-col bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-2xl p-3.5 sm:p-4 max-h-[42%]">
        <div className="h-2 rounded-full bg-white/20 overflow-hidden mb-3">
          <div
            className="h-full bg-white transition-[width] duration-100 ease-linear rounded-full"
            style={{ width: `${(left / (q.time_limit * 1000)) * 100}%` }}
          />
        </div>
        <p className={`flex-shrink min-h-[2.5rem] overflow-y-auto text-center font-black text-white leading-snug ${q.prompt.length > 110 ? 'text-sm sm:text-lg' : 'text-base sm:text-xl'}`}>{q.prompt}</p>
        {q.image_url && (
          <div className="flex-1 min-h-0 mt-2.5 flex justify-center">
            <img src={q.image_url} alt="" className="max-h-full max-w-full rounded-xl object-contain border border-white/10" />
          </div>
        )}
        <div className="flex-shrink-0 flex items-center justify-center gap-2 mt-2">
          <span className="text-center text-xs font-bold text-white/70">
            {TYPE_LABEL[q.type]}
            {q.points === 'double' ? ' · 2× Points' : ''}
          </span>
        </div>
      </div>

      {/* Answer Options Grid */}
      <div
        className={`flex-1 min-h-0 grid gap-2.5 sm:gap-3 ${
          q.options.length > 4 ? 'grid-cols-2 grid-rows-3' : 'grid-cols-2 grid-rows-2'
        }`}
      >
        {q.options.map((o, i) => {
          const letter = String.fromCharCode(65 + i);
          const on = picked.includes(i);
          return (
            <motion.button
              key={i}
              type="button"
              onClick={() => tap(i)}
              disabled={busy}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: on ? 0.96 : 1, opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.94 }}
              className={`relative min-h-0 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-1.5 sm:gap-2 p-3 sm:p-4 text-white transition-all cursor-pointer border ${
                on
                  ? 'bg-blue-600 border-white ring-4 ring-blue-500/50 shadow-blue-500/30'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] border-white/15'
              }`}
            >
              <span
                className={`${q.options.length > 4 ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-lg font-black flex items-center justify-center flex-shrink-0 transition-all ${
                  on ? 'bg-white text-blue-600' : 'bg-white/15 text-white'
                }`}
              >
                {letter}
              </span>
              <span className={`font-bold text-center leading-tight ${o.text.length > 28 ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}>
                {o.text}
              </span>
              {on && (
                <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-xs">
                  <HiOutlineCheck className="w-3.5 h-3.5 stroke-[3]" />
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {multi && (
        <button
          type="button"
          disabled={busy || !picked.length}
          onClick={() => onAnswer(picked)}
          className="flex-shrink-0 w-full py-3.5 rounded-2xl text-base font-black bg-white text-slate-900 shadow-xl active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
        >
          Submit Answer {picked.length ? `(${picked.length})` : ''}
        </button>
      )}
    </div>
  );
}

// ── Reveal Card (Clean modern results card) ──────────────────────────────────
function RevealCard({ v }) {
  const a = v.my_answer;
  const poll = v.question.type === 'poll';

  if (poll) {
    return (
      <Center>
        <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg mb-2">
          <HiOutlineChartBar className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-black text-white">{a ? 'Thanks for voting!' : 'Poll closed'}</h2>
        <p className="text-xs text-white/70 font-medium">Check the main screen to see the room’s results.</p>
      </Center>
    );
  }

  const right = a?.correct;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-4 py-6 max-w-md w-full mx-auto [&>*:first-child]:mt-auto [&>*:last-child]:mb-auto">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220 }}
        className="w-full bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl text-center flex flex-col items-center gap-4"
      >
        {/* Top Status Icon */}
        {right ? (
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg">
            <HiOutlineCheck className="w-9 h-9 stroke-[3]" />
          </div>
        ) : a ? (
          <div className="w-16 h-16 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg">
            <HiOutlineX className="w-9 h-9 stroke-[3]" />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg">
            <HiOutlineClock className="w-9 h-9 stroke-[2.5]" />
          </div>
        )}

        {/* Heading */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {right ? 'Correct!' : a ? 'Not this time' : "Time's up!"}
          </h2>
          <p className="text-xs text-white/60 font-medium mt-1">
            {right
              ? 'Great job! You scored points on this question.'
              : a
              ? 'Keep your focus, next question is coming up soon.'
              : 'You did not submit an answer in time.'}
          </p>
        </div>

        {/* Score & Streak Badges if Correct */}
        {right && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <span className="px-5 py-2 rounded-2xl bg-white text-emerald-800 text-2xl font-black shadow-lg">
              +{a.points.toLocaleString()} pts
            </span>
            {v.me.streak >= 2 && (
              <span className="px-3.5 py-2 rounded-2xl bg-orange-500/20 border border-orange-400/40 text-orange-300 text-sm font-bold flex items-center gap-1.5 shadow-xs">
                <IconFlame className="w-4 h-4 text-orange-400" /> {v.me.streak} in a row!
              </span>
            )}
          </div>
        )}

        {/* Correct Answer Display if Wrong */}
        {!right && (
          <div className="w-full p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-left mt-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-2">
              Correct Answer{v.question.correct.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-2">
              {v.question.correct.map((idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-white text-xs sm:text-sm font-bold"
                >
                  <span className="w-6 h-6 rounded-md bg-emerald-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1 truncate">{v.question.options[idx]?.text}</span>
                  <HiOutlineCheck className="w-4 h-4 text-emerald-400 stroke-[3] flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rank & Score Standing */}
        {v.me.rank && (
          <div className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-xs font-bold text-white/90 mt-1">
            <span>Current Standing:</span>
            <span className="text-sm font-black text-white flex items-center gap-1.5">
              {v.me.rank <= 3 && <Medal rank={v.me.rank} size={18} />}
              {ordinal(v.me.rank)} place ({v.me.score.toLocaleString()} pts)
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Final Game Summary ────────────────────────────────────────────────────────
function FinalCard({ v }) {
  const st = v.me.stats || {};
  const top3 = v.me.rank <= 3;

  return (
    <Center>
      {v.me.rank === 1 && <Confetti />}
      {top3 && v.me.rank !== 1 && <Confetti count={50} />}

      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160 }}
        className="w-24 h-24 rounded-3xl bg-white shadow-2xl flex items-center justify-center mb-1"
      >
        {v.me.rank === 1 ? (
          <IconTrophy className="w-12 h-12 text-amber-500" />
        ) : v.me.rank <= 3 ? (
          <Medal rank={v.me.rank} size={48} />
        ) : (
          <HiOutlineFlag className="w-12 h-12 text-blue-600" />
        )}
      </motion.div>

      <div>
        <p className="text-4xl font-black text-white">{v.me.rank === 1 ? 'You won!' : `${ordinal(v.me.rank)} place`}</p>
        <p className="text-xl font-black text-white/80 tabular-nums mt-0.5">{v.me.score.toLocaleString()} points</p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 w-full max-w-sm">
        {[
          [HiOutlineCheckCircle, `${st.correct ?? 0}/${st.out_of ?? 0}`, 'correct'],
          [IconBolt, st.avg_time_s != null ? `${st.avg_time_s}s` : '—', 'avg time'],
          [IconFlame, st.best_streak ?? 0, 'best streak'],
        ].map(([Icon, val, l]) => (
          <div key={l} className="rounded-2xl bg-white/[0.08] border border-white/10 py-3 flex flex-col items-center">
            <Icon className="w-4 h-4 text-blue-400" />
            <p className="mt-1 text-base font-black text-white tabular-nums">{val}</p>
            <p className="text-[10px] font-bold text-white/60 uppercase">{l}</p>
          </div>
        ))}
      </div>

      <ul className="mt-3 w-full max-w-sm space-y-2">
        {(v.leaderboard || []).map((p) => (
          <li
            key={p.rank}
            className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ${
              p.is_me ? 'bg-white text-slate-900 shadow-md' : 'bg-white/[0.08] border border-white/5 text-white'
            }`}
          >
            <Medal rank={p.rank} size={20} />
            <Avatar id={p.avatar} size={28} />
            <span className="flex-1 text-left font-bold truncate text-sm">{p.nickname}</span>
            <span className="font-black tabular-nums text-sm">{p.score.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-bold text-white/60 mt-2">Thanks for playing!</p>
    </Center>
  );
}

// ── Playing State Coordinator ────────────────────────────────────────────────
function Playing({ code, token, onLost, onGone }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const offset = useServerOffset(v?.server_now);
  useTicker(v?.status === 'question', 100);
  const now = Date.now() + offset;

  const refresh = useCallback(async () => {
    try {
      const { data } = await getLivePlayerState(code, token);
      setV(data);
    } catch (err) {
      if (err.response?.status === 401) onLost();
      // The host deleted the game while it was being played.
      else if (err.response?.status === 404) onGone();
    }
  }, [code, token, onLost, onGone]);
  usePoll(refresh, 1000, [code, token]);

  const answer = async (choices) => {
    setBusy(true);
    try {
      await answerLive(code, token, { index: v.current_index, choices });
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Answer could not be saved.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!v) {
    return (
      <Center>
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </Center>
    );
  }

  if (v.me.kicked) {
    return (
      <Center>
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center mb-2">
          <HiOutlineLogout className="w-8 h-8" />
        </div>
        <p className="text-2xl font-black text-white">The host removed you from this game.</p>
      </Center>
    );
  }

  const startsAt = new Date(v.question_starts_at).getTime();
  const stage = v.status === 'question' ? (now < startsAt ? 'ready' : v.my_answer ? 'waiting' : 'answer') : v.status;

  return (
    <>
      <Header v={v} />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${stage}-${v.current_index}`}
          className="flex-1 min-h-0 flex flex-col"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
        >
          {stage === 'lobby' && (
            <Center>
              <motion.span
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Avatar id={v.me.avatar} size={100} ring />
              </motion.span>
              <h2 className="text-3xl font-black text-white mt-1">You&apos;re in!</h2>
              <p className="text-white/70 font-medium text-xs max-w-xs leading-relaxed">
                See your nickname on the projector screen? Waiting for the host to start the game…
              </p>
              <div className="mt-4">
                <ReactionBar code={code} token={token} />
              </div>
            </Center>
          )}

          {stage === 'ready' && (
            <Center>
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">
                Question {v.current_index + 1} of {v.total}
              </p>
              <motion.p
                key={Math.ceil((startsAt - now) / 1000)}
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-8xl font-black tabular-nums text-white my-3"
              >
                {Math.max(1, Math.ceil((startsAt - now) / 1000))}
              </motion.p>
              <p className="text-lg font-bold text-white/90">{v.question?.prompt}</p>
            </Center>
          )}

          {stage === 'answer' && <AnswerPad v={v} now={now} onAnswer={answer} busy={busy} />}

          {stage === 'waiting' && (
            <Center>
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/40 text-blue-300 flex items-center justify-center shadow-lg mb-2">
                <HiOutlineLockClosed className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-white">Answer locked in!</h2>
              <p className="text-xs text-white/70 font-medium">Waiting for other players to submit…</p>
            </Center>
          )}

          {stage === 'reveal' && <RevealCard v={v} />}

          {stage === 'leaderboard' && (
            <Center>
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Your Rank</p>
              <motion.p
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
                className="inline-flex items-center gap-3 text-6xl font-black text-white mt-1"
              >
                {v.me.rank <= 3 && <Medal rank={v.me.rank} size={50} />}
                <span>{ordinal(v.me.rank)}</span>
              </motion.p>
              <p className="text-lg font-bold text-white/80 tabular-nums">{v.me.score.toLocaleString()} points</p>

              <ul className="mt-4 w-full max-w-sm space-y-2">
                {(v.leaderboard || []).map((p) => (
                  <li
                    key={p.rank}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ${
                      p.is_me
                        ? 'bg-white text-slate-900 shadow-md'
                        : 'bg-white/[0.08] border border-white/5 text-white'
                    }`}
                  >
                    <span className="w-6 font-black text-xs">{p.rank}</span>
                    <Avatar id={p.avatar} size={28} />
                    <span className="flex-1 text-left font-bold text-sm truncate">{p.nickname}</span>
                    <span className="font-black tabular-nums text-sm">{p.score.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <ReactionBar code={code} token={token} />
              </div>
            </Center>
          )}

          {stage === 'finished' && <FinalCard v={v} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// ── Main Page Export ──────────────────────────────────────────────────────────
export default function PlayLive() {
  const { code } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState(() => (code ? readToken(code) : ''));

  useEffect(() => {
    if (!code) return;
    getLivePublic(code)
      .then((r) => setInfo(r.data))
      .catch((err) => setError(err.response?.data?.error || 'This game link is not valid.'));
  }, [code]);

  const lost = useCallback(() => {
    dropToken(code);
    setToken('');
  }, [code]);
  const gone = useCallback(() => {
    dropToken(code);
    setError('The host closed this game.');
  }, [code]);

  if (!code) return <PinEntry />;
  if (error) {
    return (
      <Backdrop>
        <Center>
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center mb-2">
            <HiOutlineQuestionMarkCircle className="w-8 h-8" />
          </div>
          <p className="text-2xl font-black text-white">{error}</p>
        </Center>
      </Backdrop>
    );
  }
  if (!info) {
    return (
      <Backdrop>
        <Center>
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </Center>
      </Backdrop>
    );
  }
  if (!token) {
    if (info.status === 'finished' || info.expired) {
      return (
        <Backdrop>
          <Center>
            <div className="w-16 h-16 rounded-2xl bg-white/[0.1] border border-white/15 text-white flex items-center justify-center mb-2">
              <HiOutlineFlag className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-2xl font-black text-white">This game has ended.</p>
          </Center>
        </Backdrop>
      );
    }
    return (
      <Backdrop>
        <JoinForm code={code} info={info} onJoined={setToken} />
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <Playing code={code} token={token} onLost={lost} onGone={gone} />
    </Backdrop>
  );
}
