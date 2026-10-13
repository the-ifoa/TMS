import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Target, BadgeCheck, ClipboardList, Users, TrendingUp, Crosshair, ArrowRight } from 'lucide-react';
import { getTeamPerformance } from '../api';
import { useAuth } from '../context/AuthContext';

// Dashboard KPI: how the whole team does in exams, by syllabus section — the team
// version of the per-participant performance view. Airline dashboards only;
// renders nothing until there is at least one finished attempt.
// One brand colour (the slate-900 of the New Enrollment button / active nav),
// shown as a shade scale: darkest = strong (75%+), mid = developing (50–74%),
// lightest = focus area (<50%).
const LEVELS = {
  strong:     { name: 'Strong',     bar: 'bg-slate-900', chip: 'bg-slate-900 text-white ring-slate-900',    dot: 'bg-slate-900' },
  developing: { name: 'Developing', bar: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700 ring-slate-300', dot: 'bg-slate-500' },
  focus:      { name: 'Focus',      bar: 'bg-slate-300', chip: 'bg-white text-slate-600 ring-slate-300',    dot: 'bg-slate-300' },
};
const level = (pct) => (pct >= 75 ? LEVELS.strong : pct >= 50 ? LEVELS.developing : LEVELS.focus);
const SHADOW = 'shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_-16px_rgba(15,23,42,0.20)]';

// Ring gauge on the dark hero band (value 0–100, null = empty ring).
function Ring({ id, value }) {
  const r = 26, c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90 flex-shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="#0f172a" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset 900ms ease' }} />
    </svg>
  );
}

function GaugeStat({ id, label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-slate-50 border border-slate-100 p-4">
      <div className="relative">
        <Ring id={id} value={value} />
        <span className="absolute inset-0 flex items-center justify-center"><Icon className="w-5 h-5 text-slate-700" /></span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tracking-tight leading-tight mt-0.5">
          {value != null ? value : '—'}{value != null && <span className="text-base font-medium text-slate-400">%</span>}
        </p>
      </div>
    </div>
  );
}

function CountStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-slate-50 border border-slate-100 p-4">
      <span className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5 text-white" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tracking-tight leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function Panel({ strong, icon: Icon, title, empty, items }) {
  const tone = strong
    ? { box: 'bg-slate-50 border-slate-200', icon: 'bg-slate-900 text-white', head: 'text-slate-900', chip: LEVELS.strong.chip }
    : { box: 'bg-slate-50 border-slate-200', icon: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300', head: 'text-slate-900', chip: LEVELS.focus.chip };
  return (
    <div className={`rounded-2xl border p-4 ${tone.box}`}>
      <p className={`text-sm font-semibold flex items-center gap-2.5 ${tone.head}`}>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${tone.icon}`}><Icon className="w-4 h-4" /></span>
        {title}
      </p>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((s, i) => (
            <li key={s.key} className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-100">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-sm font-medium text-slate-700 truncate">{s.label}</span>
              </span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ring-inset ${tone.chip}`}>{s.accuracy}%</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500 mt-3">{empty}</p>}
    </div>
  );
}

export default function TeamPerformanceCard({ item }) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (isAdmin) return; // airline dashboards only — admins don't get this card
    getTeamPerformance().then((res) => setData(res.data)).catch(() => setData(null));
  }, [isAdmin]);

  if (isAdmin || !data || !data.overall.attempts) return null;
  const { overall } = data;
  const sections = data.section_breakdown
    .filter((s) => s.accuracy != null && s.total >= 1)
    .map((s) => ({ ...s, key: s.section || '__general', label: s.section || 'General' }))
    .sort((a, b) => b.accuracy - a.accuracy);
  const strengths = sections.filter((s) => s.accuracy >= 75).slice(0, 3);
  const focus = [...sections].reverse().filter((s) => s.accuracy < 75).slice(0, 3);

  return (
    <motion.div variants={item} className={`rounded-2xl overflow-hidden bg-white border border-slate-100 ${SHADOW}`}>
      {/* Header + KPI tiles */}
      <div className="px-5 sm:px-6 pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Team Performance</h2>
            <p className="text-xs text-slate-500 mt-0.5">Average across all finished exam attempts</p>
          </div>
          <Link to="/airline/exams/manage"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            View exams <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <GaugeStat id="g-avg" icon={Target} label="Average score" value={overall.avg_percentage} />
          <GaugeStat id="g-pass" icon={BadgeCheck} label="Pass rate" value={overall.pass_rate} />
          <CountStat icon={ClipboardList} label="Attempts" value={overall.attempts} />
          <CountStat icon={Users} label="Participants" value={overall.participants} />
        </div>
      </div>

      {/* Breakdown */}
      {sections.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 px-5 sm:px-6 pb-5 sm:pb-6">
          <div className="lg:col-span-3 rounded-2xl bg-white border border-slate-200/80 p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
              <p className="text-sm font-semibold text-slate-900">Accuracy by section</p>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                {Object.values(LEVELS).map((l, i) => (
                  <span key={l.name} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${l.dot}`} />{l.name} {['75%+', '50–74%', '<50%'][i]}</span>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {sections.slice(0, 8).map((s) => {
                const l = level(s.accuracy);
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-sm font-medium text-slate-800 truncate">{s.label}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-slate-400">{s.correct}/{s.total} correct</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ring-1 ring-inset ${l.chip}`}>{s.accuracy}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${l.bar}`} style={{ width: `${Math.max(3, Math.min(100, s.accuracy))}%`, transition: 'width 800ms ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Panel strong icon={TrendingUp} title="Strengths" empty="No section at 75% or above yet." items={strengths} />
            <Panel icon={Crosshair} title="Focus areas" empty="Every section is at 75% or above." items={focus} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
