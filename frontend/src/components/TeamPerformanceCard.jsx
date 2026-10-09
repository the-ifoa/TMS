import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { HiOutlineTrendingUp, HiOutlineTrendingDown } from 'react-icons/hi';
import { getTeamPerformance } from '../api';
import { useAuth } from '../context/AuthContext';

// Dashboard KPI: how the whole team does in exams, by syllabus section — the team
// version of the per-participant performance view. Green = strength, red = needs
// work. Renders nothing until there is at least one finished attempt.
const tone = (acc) => (acc >= 75
  ? { bar: 'bg-emerald-500', text: 'text-emerald-700' }
  : acc >= 50
    ? { bar: 'bg-amber-400', text: 'text-amber-700' }
    : { bar: 'bg-rose-500', text: 'text-rose-700' });

function Kpi({ label, value, suffix = '' }) {
  return (
    <div className="rounded-lg bg-slate-50/80 px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-extrabold text-slate-800 mt-1 tracking-tight">{value != null ? `${value}${suffix}` : '—'}</p>
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
  const sections = data.section_breakdown.filter((s) => s.accuracy != null && s.total >= 1);
  const label = (s) => s.section || 'General';
  const strengths = [...sections].reverse().filter((s) => s.accuracy >= 75).slice(0, 3);
  const weak = sections.filter((s) => s.accuracy < 75).slice(0, 3);

  return (
    <motion.div variants={item} className="bg-white rounded-xl border border-slate-200/70 p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Team Performance</h2>
          <p className="text-xs text-slate-400 mt-0.5">Average across all finished exam attempts</p>
        </div>
        <Link to="/airline/exams/manage" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View exams</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Average score" value={data.overall.avg_percentage} suffix="%" />
        <Kpi label="Pass rate" value={data.overall.pass_rate} suffix="%" />
        <Kpi label="Attempts" value={data.overall.attempts} />
        <Kpi label="Participants" value={data.overall.participants} />
      </div>

      {sections.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Accuracy by section</p>
            {[...sections].reverse().slice(0, 8).map((s) => {
              const t = tone(s.accuracy);
              return (
                <div key={s.section} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 truncate pr-3">{label(s)}</span>
                    <span className={`font-bold ${t.text}`}>{s.accuracy}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.min(100, s.accuracy)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 content-start">
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><HiOutlineTrendingUp className="w-4 h-4" /> Strengths</p>
              {strengths.length ? (
                <ul className="mt-2 space-y-1">
                  {strengths.map((s) => <li key={s.section} className="text-xs text-emerald-900 flex justify-between"><span className="truncate pr-2">{label(s)}</span><b>{s.accuracy}%</b></li>)}
                </ul>
              ) : <p className="text-xs text-emerald-800/70 mt-2">No section at 75% or above yet.</p>}
            </div>
            <div className="rounded-xl border border-rose-200/70 bg-rose-50/50 p-4">
              <p className="text-xs font-bold text-rose-800 flex items-center gap-1.5"><HiOutlineTrendingDown className="w-4 h-4" /> Needs improvement</p>
              {weak.length ? (
                <ul className="mt-2 space-y-1">
                  {weak.map((s) => <li key={s.section} className="text-xs text-rose-900 flex justify-between"><span className="truncate pr-2">{label(s)}</span><b>{s.accuracy}%</b></li>)}
                </ul>
              ) : <p className="text-xs text-rose-800/70 mt-2">Every section is at 75% or above.</p>}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
