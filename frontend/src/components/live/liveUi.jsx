import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, PlaneTakeoff, PlaneLanding, Radar, TowerControl, Route, CloudSun, Gauge, Fuel, Headset,
  Rocket, Globe, Trophy, Zap, Compass,
  Navigation, Orbit, Bot, Flame, Cat, Dog, Fish, Bird, Turtle, Rabbit, Squirrel, Snail, Bug, Origami, Feather,
  Ghost, Gem, Crown, Star, Mountain, Anchor, PawPrint, Snowflake, Leaf, Sun, Award, Laugh, Heart, PartyPopper,
  ThumbsUp, Medal as MedalIcon,
} from 'lucide-react';

// Line icons throughout (Lucide), drawn at one stroke weight so every icon on
// the host screen and the phone looks like part of the same set.
const STROKE = 1.75;
const line = (Icon, strokeWidth = STROKE) => {
  const Line = (props) => <Icon strokeWidth={strokeWidth} {...props} />;
  Line.displayName = `Line${Icon.displayName || ''}`;
  return Line;
};

// ─── Shared pieces for the live quiz (host screen, player phone, editor) ──────

// Answer tiles: each has its own colour AND shape, so identity never relies on
// colour alone. Deep shades keep white text readable (≥4.5:1).
export const TILES = [
  { color: '#e11d48', shape: 'triangle', name: 'Red' },
  { color: '#2563eb', shape: 'diamond', name: 'Blue' },
  { color: '#b45309', shape: 'circle', name: 'Gold' },
  { color: '#15803d', shape: 'square', name: 'Green' },
  { color: '#7c3aed', shape: 'star', name: 'Purple' },
  { color: '#0e7490', shape: 'hexagon', name: 'Teal' },
];

export function Shape({ shape, className = 'w-6 h-6' }) {
  const paths = {
    triangle: <polygon points="12,3 22,21 2,21" />,
    diamond: <polygon points="12,2 22,12 12,22 2,12" />,
    circle: <circle cx="12" cy="12" r="10" />,
    square: <rect x="3" y="3" width="18" height="18" rx="2" />,
    star: <polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6" />,
    hexagon: <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />,
  };
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">{paths[shape]}</svg>;
}

// ── Icons (no emoji) ──────────────────────────────────────────────────────────
// Game cover icons, all aviation. Stored as the key: [icon, colour, name].
// Colours are one muted aviation palette (navy, sky, teal, slate…) so the
// covers look like a set rather than a rainbow.
export const COVER_SET = {
  plane:   [Plane, '#1d4ed8', 'Aircraft'],
  takeoff: [PlaneTakeoff, '#0369a1', 'Takeoff'],
  landing: [PlaneLanding, '#0f766e', 'Landing'],
  radar:   [Radar, '#047857', 'Radar'],
  tower:   [TowerControl, '#4338ca', 'Control tower'],
  compass: [Compass, '#b45309', 'Navigation'],
  route:   [Route, '#6d28d9', 'Flight route'],
  weather: [CloudSun, '#0e7490', 'Weather'],
  gauge:   [Gauge, '#be123c', 'Instruments'],
  globe:   [Globe, '#1e3a8a', 'International'],
  fuel:    [Fuel, '#c2410c', 'Fuel'],
  headset: [Headset, '#334155', 'ATC / Radio'],
};
// Games saved with the earlier, general icons show the closest aviation one.
const COVER_ALIAS = {
  rocket: 'takeoff', brain: 'headset', target: 'radar', trophy: 'plane', bolt: 'weather',
  satellite: 'tower', book: 'route', cap: 'headset', flag: 'landing',
};
const coverOf = (cover) => COVER_SET[cover] || COVER_SET[COVER_ALIAS[cover]] || COVER_SET.plane;
export const COVERS = Object.keys(COVER_SET);
export const COVER_ICONS = Object.fromEntries(COVERS.map((k) => [k, COVER_SET[k][0]]));
export const coverColor = (cover) => coverOf(cover)[1];
export const coverName = (cover) => coverOf(cover)[2];
export function CoverIcon({ cover, className = 'w-5 h-5', strokeWidth = STROKE }) {
  const Icon = coverOf(cover)[0];
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

// The cover icon on its colour — the game's badge next to its title.
// solid: white icon on the colour; otherwise a soft tint with the icon in colour.
export function CoverBadge({ cover, size = 'sm', solid = true, className = '' }) {
  const box = { xs: 'w-5 h-5 rounded-md', sm: 'w-7 h-7 rounded-lg', bar: 'w-8 h-8 rounded-lg', md: 'w-10 h-10 rounded-2xl', lg: 'w-14 h-14 rounded-2xl' }[size];
  const icon = { xs: 'w-3 h-3', sm: 'w-4 h-4', bar: 'w-[18px] h-[18px]', md: 'w-5 h-5', lg: 'w-7 h-7' }[size];
  const c = coverColor(cover);
  const style = solid
    ? { background: c, color: '#fff', boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 12px -4px ${c}80` }
    : { background: `${c}14`, color: c, boxShadow: `inset 0 0 0 1px ${c}33` };
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${box} ${className}`} style={style}>
      <CoverIcon cover={cover} className={icon} strokeWidth={2} />
    </span>
  );
}

// Player avatars: a white line icon on a coloured disc. Stored as the key, so
// the keys stay as they were when the icons changed.
export const AVATAR_ICONS = {
  plane: [Plane, '#2563eb'], rocket: [Rocket, '#e11d48'], heli: [Navigation, '#0e7490'], astro: [Orbit, '#4f46e5'],
  robot: [Bot, '#475569'], dragon: [Flame, '#c2410c'], cat: [Cat, '#b45309'], dog: [Dog, '#9a3412'],
  fish: [Fish, '#0891b2'], kiwi: [Bird, '#4d7c0f'], hippo: [Turtle, '#15803d'], frog: [Rabbit, '#7c3aed'],
  otter: [Squirrel, '#92400e'], horse: [Snail, '#be123c'], crow: [Bug, '#1e293b'], dove: [Origami, '#0284c7'],
  feather: [Feather, '#be185d'], ghost: [Ghost, '#64748b'], gem: [Gem, '#9333ea'], crown: [Crown, '#a16207'],
  star: [Star, '#b45309'], mountain: [Mountain, '#57534e'], anchor: [Anchor, '#1d4ed8'], paw: [PawPrint, '#c2410c'],
  snow: [Snowflake, '#0369a1'], leaf: [Leaf, '#047857'], sun: [Sun, '#ca8a04'], bolt: [Zap, '#d97706'],
};
export const AVATARS = Object.keys(AVATAR_ICONS);
export function Avatar({ id, size = 40, ring = false }) {
  const entry = AVATAR_ICONS[id];
  const style = { width: size, height: size, background: entry ? entry[1] : '#e2e8f0' };
  const Icon = entry?.[0];
  return (
    <span className={`inline-flex items-center justify-center rounded-full flex-shrink-0 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] ${ring ? 'ring-2 ring-white/80' : ''}`} style={style} aria-hidden="true">
      {Icon ? <Icon strokeWidth={size >= 56 ? 1.75 : 2} style={{ width: size * 0.5, height: size * 0.5 }} /> : <span style={{ fontSize: size * 0.55 }}>{id}</span>}
    </span>
  );
}

// Reactions players can send during the lobby and leaderboard. Keys are what
// the server accepts (liveController STICKERS).
export const REACTION_ICONS = {
  clap: [Award, '#f59e0b', 'Bravo'], fire: [Flame, '#f97316', 'Fire'], laugh: [Laugh, '#eab308', 'Laugh'],
  wow: [Zap, '#06b6d4', 'Wow'], heart: [Heart, '#ec4899', 'Love'], party: [PartyPopper, '#8b5cf6', 'Party'],
  rocket: [Rocket, '#3b82f6', 'Rocket'], thumbs: [ThumbsUp, '#22c55e', 'Thumbs up'],
};
export const REACTIONS = Object.keys(REACTION_ICONS);
export function ReactionIcon({ id, size = 22 }) {
  const [Icon, color] = REACTION_ICONS[id] || [Heart, '#ec4899'];
  return <Icon strokeWidth={2} style={{ width: size, height: size, color }} aria-hidden="true" />;
}

// 1st / 2nd / 3rd medal icon.
const MEDAL_COLORS = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };
export function Medal({ rank, size = 24 }) {
  if (!MEDAL_COLORS[rank]) return null;
  return <MedalIcon strokeWidth={STROKE} style={{ width: size, height: size, color: MEDAL_COLORS[rank] }} aria-label={`${rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : 'Bronze'} medal`} />;
}
export const IconTrophy = line(Trophy);
export const IconFlame = line(Flame);
export const IconBolt = line(Zap);
export const IconCrown = line(Crown);

// ── Teams ─────────────────────────────────────────────────────────────────────
// Fixed team keys from the server (services/liveQuiz.js TEAM_KEYS), each with
// a dot, a tinted chip and a solid fill. Full class strings so Tailwind keeps them.
export const TEAM_STYLE = {
  red:    { dot: 'bg-rose-500',    chip: 'bg-rose-500/15 border-rose-400/40 text-rose-200',          solid: 'bg-rose-500',    bar: 'bg-rose-400' },
  blue:   { dot: 'bg-blue-500',    chip: 'bg-blue-500/15 border-blue-400/40 text-blue-200',          solid: 'bg-blue-500',    bar: 'bg-blue-400' },
  green:  { dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200', solid: 'bg-emerald-500', bar: 'bg-emerald-400' },
  amber:  { dot: 'bg-amber-400',   chip: 'bg-amber-500/15 border-amber-400/40 text-amber-200',       solid: 'bg-amber-500',   bar: 'bg-amber-400' },
  violet: { dot: 'bg-violet-500',  chip: 'bg-violet-500/15 border-violet-400/40 text-violet-200',    solid: 'bg-violet-500',  bar: 'bg-violet-400' },
  pink:   { dot: 'bg-pink-500',    chip: 'bg-pink-500/15 border-pink-400/40 text-pink-200',          solid: 'bg-pink-500',    bar: 'bg-pink-400' },
};
export const teamStyle = (key) => TEAM_STYLE[key] || { dot: 'bg-white/40', chip: 'bg-white/10 border-white/15 text-white/80', solid: 'bg-white/30', bar: 'bg-white/40' };

// Small coloured pill with the team's name.
export function TeamChip({ team, className = '' }) {
  if (!team) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${teamStyle(team.key).chip} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${teamStyle(team.key).dot}`} />{team.name}
    </span>
  );
}

// Team standings as bars: average points per member, ranked.
export function TeamStandings({ standings, highlight, compact = false }) {
  if (!standings?.length) return null;
  const max = Math.max(1, ...standings.map((t) => t.score));
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {standings.map((t) => (
        <li key={t.key} className={`relative overflow-hidden rounded-2xl border ${t.key === highlight ? 'border-white/60 ring-2 ring-white/30' : 'border-white/10'} bg-white/[0.06]`}>
          <motion.div aria-hidden className={`absolute inset-y-0 left-0 opacity-25 ${teamStyle(t.key).bar}`}
            initial={{ width: 0 }} animate={{ width: `${(t.score / max) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          <div className={`relative flex items-center gap-3 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
            <span className="w-6 text-sm font-black text-white/80 tabular-nums">{t.rank}</span>
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${teamStyle(t.key).dot}`} />
            <span className={`flex-1 min-w-0 truncate font-black text-white ${compact ? 'text-sm' : 'text-base sm:text-xl'}`}>{t.name}</span>
            <span className="text-[11px] font-semibold text-white/60 whitespace-nowrap">{t.members} {t.members === 1 ? 'player' : 'players'}</span>
            {t.last_points > 0 && <span className="hidden sm:inline px-2 py-0.5 rounded-lg bg-emerald-500 text-white text-[11px] font-black tabular-nums">+{t.last_points}</span>}
            <span className={`text-right font-black tabular-nums text-white ${compact ? 'text-sm' : 'text-lg sm:text-2xl'}`}>{t.score.toLocaleString()}<span className="ml-1 text-[10px] font-bold text-white/50">avg</span></span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const TYPE_LABEL = { quiz: 'Quiz', true_false: 'True or false', multi: 'Pick all that apply', poll: 'Poll' };

// Dark studio backdrop for the host screen and the player's phone. Exactly one
// window tall: the header never scrolls away, and each screen fits the space
// left (anything too tall scrolls inside its own box, never the page).
export function Backdrop({ children, className = '' }) {
  return (
    <div className={`relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-white ${className}`}>
      {/* Subtle modern ambient lighting (no dots) */}
      <div aria-hidden className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-blue-600/10 blur-[130px] pointer-events-none" />
      <div aria-hidden className="absolute -bottom-40 -right-24 w-[36rem] h-[36rem] rounded-full bg-indigo-600/10 blur-[140px] pointer-events-none" />
      <div className="relative z-10 h-full flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}

// ── Time ──────────────────────────────────────────────────────────────────────
// Offset between the server clock and this device, from each state payload.
export function useServerOffset(serverNow) {
  const ref = useRef(0);
  if (serverNow) ref.current = new Date(serverNow).getTime() - Date.now();
  return ref.current;
}

// Re-renders every `ms` while `on`.
export function useTicker(on, ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

// Polls `fn` every `ms`, never two at once, paused while the tab is hidden.
export function usePoll(fn, ms, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let stop = false;
    let timer;
    const loop = async () => {
      if (stop) return;
      if (!document.hidden) { try { await fnRef.current(); } catch { /* next tick retries */ } }
      if (!stop) timer = setTimeout(loop, ms);
    };
    loop();
    return () => { stop = true; clearTimeout(timer); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// Countdown ring: seconds left in the middle, turns red for the last 5.
export function CountdownRing({ msLeft, totalMs, size = 96 }) {
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const frac = totalMs ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const urgent = secs <= 5;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={urgent ? '#fb7185' : '#ffffff'} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 120ms linear' }} />
      </svg>
      <motion.span key={secs} initial={{ scale: urgent ? 1.4 : 1.15, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}
        className="absolute inset-0 flex items-center justify-center font-black tabular-nums" style={{ fontSize: size * 0.36 }}>
        {secs}
      </motion.span>
    </div>
  );
}

// ── Celebration ───────────────────────────────────────────────────────────────
// One confetti burst of paper bits falling across the screen.
export function Confetti({ count = 110 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 2.6 + Math.random() * 2.2,
    rotate: (Math.random() - 0.5) * 900,
    drift: (Math.random() - 0.5) * 160,
    size: 6 + Math.random() * 8,
    color: ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'][i % 7],
    round: i % 3 === 0,
  })), [count]);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.div key={p.id} className="absolute top-0"
          style={{ left: `${p.left}%` }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}>
          <span className={`block ${p.round ? 'rounded-full' : 'rounded-[2px]'}`} style={{ width: p.size, height: p.round ? p.size : p.size * 0.6, background: p.color }} />
        </motion.div>
      ))}
    </div>
  );
}

// Sticker reactions floating up the side of the host screen.
export function FloatingReactions({ reactions }) {
  const [shown, setShown] = useState([]);
  const seen = useRef(new Set());
  useEffect(() => {
    const fresh = (reactions || []).filter((r) => {
      const key = `${r.nickname}|${r.sticker}|${r.at}`;
      if (seen.current.has(key)) return false;
      seen.current.add(key);
      return Date.now() - new Date(r.at).getTime() < 15000; // only recent ones
    }).map((r) => ({ ...r, key: `${r.nickname}|${r.at}|${Math.random()}`, x: 6 + Math.random() * 14 }));
    if (fresh.length) setShown((s) => [...s, ...fresh].slice(-25));
  }, [reactions]);
  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 w-1/4 z-40 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {shown.map((r) => (
          <motion.div key={r.key} className="absolute bottom-0 flex flex-col items-center"
            style={{ right: `${r.x}%` }}
            initial={{ y: 40, opacity: 0, scale: 0.6 }}
            animate={{ y: '-85vh', opacity: [0, 1, 1, 0], scale: [0.6, 1.2, 1, 1] }}
            transition={{ duration: 4.5, ease: 'easeOut' }}
            onAnimationComplete={() => setShown((s) => s.filter((x) => x.key !== r.key))}>
            <span className="w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center"><ReactionIcon id={r.sticker} size={28} /></span>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-black/30 text-[11px] font-bold text-white">{r.nickname}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// "1st" / "2nd" / "3rd" / "4th"…
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
