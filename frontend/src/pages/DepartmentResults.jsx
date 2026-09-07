import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  HiOutlineChartSquareBar, HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineSearch,
} from 'react-icons/hi';
import { getDepartmentExamResults } from '../api';

const pct = (n) => (n == null ? '—' : `${Math.round(n)}%`);

export default function DepartmentResults() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState({});

  useEffect(() => {
    getDepartmentExamResults()
      .then((res) => setRows(res.data || []))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load results'))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) =>
          [r.participant_name, r.exam_title_snapshot, r.department_label]
            .some((s) => (s || '').toLowerCase().includes(q)))
      : rows;
    const map = new Map();
    filtered.forEach((r) => {
      const key = r.department_label || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, search]);

  const stat = (list) => {
    const done = list.filter((r) => r.attempt && r.attempt.status !== 'in_progress');
    const passed = done.filter((r) => r.attempt.passed).length;
    const avg = done.length
      ? done.reduce((s, r) => s + (r.attempt.percentage || 0), 0) / done.length
      : null;
    return { total: list.length, done: done.length, passed, avg };
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col">
      <div className="w-full bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <h1 className="text-base sm:text-xl font-bold text-primary-800 tracking-tight flex items-center gap-2">
          <HiOutlineChartSquareBar className="w-5 h-5 text-accent-500" />
          Department Results
        </h1>
        <p className="text-xs text-primary-400 mt-0.5 hidden sm:block">
          Exam outcomes across every department in your airline.
        </p>
      </div>

      <div className="p-3 sm:p-6 space-y-4">
        <div className="relative max-w-md">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search participant, exam or department…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 py-16 text-center text-sm text-slate-400 font-medium">
            No exam results yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(([label, list]) => {
              const s = stat(list);
              const isOpen = open[label] ?? true;
              return (
                <div key={label} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <button
                    onClick={() => setOpen((p) => ({ ...p, [label]: !isOpen }))}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors text-left"
                  >
                    {isOpen
                      ? <HiOutlineChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      : <HiOutlineChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                    <span className="text-sm font-bold text-slate-800 flex-1 truncate">{label}</span>
                    <span className="text-[11px] font-semibold text-slate-500 hidden sm:flex items-center gap-3">
                      <span>{s.total} invited</span>
                      <span>{s.done} completed</span>
                      <span className="text-emerald-600">{s.passed} passed</span>
                      <span>avg {pct(s.avg)}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="text-left font-bold px-5 py-2.5">Participant</th>
                            <th className="text-left font-bold px-5 py-2.5">Exam</th>
                            <th className="text-left font-bold px-5 py-2.5">Status</th>
                            <th className="text-right font-bold px-5 py-2.5">Score</th>
                            <th className="text-right font-bold px-5 py-2.5">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.map((r) => (
                            <tr key={r._id || r.id} className="hover:bg-slate-50/60">
                              <td className="px-5 py-2.5 font-medium text-slate-800">{r.participant_name || '—'}</td>
                              <td className="px-5 py-2.5 text-slate-600">{r.exam_title_snapshot || '—'}</td>
                              <td className="px-5 py-2.5 text-slate-500 capitalize">{(r.status || '').replace('_', ' ')}</td>
                              <td className="px-5 py-2.5 text-right text-slate-700">
                                {r.attempt ? pct(r.attempt.percentage) : '—'}
                              </td>
                              <td className="px-5 py-2.5 text-right">
                                {!r.attempt || r.attempt.status === 'in_progress' ? (
                                  <span className="text-slate-400">—</span>
                                ) : r.attempt.passed ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">PASS</span>
                                ) : (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">FAIL</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
