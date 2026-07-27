import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap, HiOutlineEye, HiOutlineSearch, HiOutlineMail,
  HiOutlineUsers, HiOutlineCalendar, HiChevronRight,
} from 'react-icons/hi';
import { getAirlineExamResults } from '../api';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

const INVITE_STATUS = {
  sent:        { label: 'Sent',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  opened:      { label: 'Opened',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In Progress', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  completed:   { label: 'Completed',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Airline exam view — students take exams via a personal emailed link; the
// airline just monitors. Results are grouped into "batches": one batch = the
// set of students the admin sent an exam to together in a single action.
export default function AirlineExams() {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState('newest');
  const [openBatch, setOpenBatch] = useState(null);

  useEffect(() => {
    getAirlineExamResults()
      .then((res) => setResults(res.data || []))
      .catch(() => toast.error('Failed to load results.'))
      .finally(() => setLoading(false));
  }, []);

  // Group invites into batches. Legacy invites with no batch_id fall back to
  // one bucket per exam + send-day so they still show up sensibly.
  const batches = useMemo(() => {
    const map = new Map();
    results.forEach((r) => {
      const key = r.batch_id || `${r.exam_id}::${(r.sent_at || r.created_at || '').slice(0, 10)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          exam_id: r.exam_id,
          exam_title: r.exam_title_snapshot,
          sent_at: r.sent_at || r.created_at,
          students: [],
        });
      }
      const b = map.get(key);
      b.students.push(r);
      if (new Date(r.sent_at || r.created_at) > new Date(b.sent_at)) b.sent_at = r.sent_at || r.created_at;
    });
    let arr = [...map.values()];
    arr.forEach((b) => {
      b.completed = b.students.filter((s) => s.status === 'completed').length;
    });
    arr.sort((a, b) => (sortDir === 'newest' ? new Date(b.sent_at) - new Date(a.sent_at) : new Date(a.sent_at) - new Date(b.sent_at)));
    return arr;
  }, [results, sortDir]);

  const filteredBatches = batches.filter((b) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return b.exam_title.toLowerCase().includes(q) || b.students.some((s) => (s.participant_name || '').toLowerCase().includes(q));
  });

  const totalCompleted = results.filter((r) => r.status === 'completed').length;
  const activeBatch = openBatch && batches.find((b) => b.key === openBatch);

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2 sm:py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-2xs flex-shrink-0">
              <HiOutlineAcademicCap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none truncate">Exam Results</h1>
              <p className="text-[11px] font-medium text-slate-400 mt-0.5 truncate hidden sm:block">
                Exams sent to your students, grouped by batch
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] sm:text-xs font-bold flex-shrink-0">
            {totalCompleted} Completed
          </span>
        </div>
      </div>

      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5 flex-1">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : results.length === 0 ? (
          <Card className="p-12 text-center rounded-2xl">
            <HiOutlineMail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">No exam invitations yet</p>
            <p className="text-xs text-slate-400 mt-1">Once IFOA emails exam links to your students, batches will appear here.</p>
          </Card>
        ) : (
          <>
            {/* Search + sort */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by exam or student name…"
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 shadow-2xs rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <Select value={sortDir} onValueChange={setSortDir}>
                <SelectTrigger className="w-full sm:w-48 rounded-xl text-xs bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Sent: Newest First</SelectItem>
                  <SelectItem value="oldest">Sent: Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Batch cards */}
            {filteredBatches.length === 0 ? (
              <Card className="p-10 text-center text-sm text-slate-400 font-medium rounded-2xl">No batches match your search.</Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBatches.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => setOpenBatch(b.key)}
                    className="group text-left bg-white border border-slate-200/90 rounded-2xl shadow-2xs hover:shadow-md hover:border-slate-300 transition-all p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                        <HiOutlineAcademicCap className="w-5 h-5" />
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex-shrink-0">
                        <HiOutlineUsers className="w-3.5 h-3.5 text-slate-500" />{b.students.length}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900 leading-snug break-words group-hover:text-blue-600 transition-colors line-clamp-2">
                        {b.exam_title}
                      </h2>
                      <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mt-1">
                        <HiOutlineCalendar className="w-3 h-3" /> Sent {fmtDate(b.sent_at)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${b.completed === b.students.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {b.completed} / {b.students.length} Completed
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        View <HiChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch detail modal */}
      <Dialog open={!!openBatch} onOpenChange={(o) => !o && setOpenBatch(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border border-slate-200/80 shadow-2xl bg-white">
          {activeBatch && (
            <>
              <DialogHeader className="flex-shrink-0 px-6 py-5 border-b border-slate-200/80 bg-white space-y-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <HiOutlineAcademicCap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 break-words leading-snug">{activeBatch.exam_title}</DialogTitle>
                    <p className="text-xs text-slate-500 font-medium">Batch sent {fmtDate(activeBatch.sent_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700">
                    <HiOutlineUsers className="w-3.5 h-3.5 text-slate-400" />{activeBatch.students.length} Students
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                    {activeBatch.completed} Completed
                  </span>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 bg-slate-50/60 space-y-2.5">
                {activeBatch.students.map((r) => {
                  const st = INVITE_STATUS[r.status] || INVITE_STATUS.sent;
                  const att = r.attempt;
                  const pending = att && att.status === 'pending_review';
                  return (
                    <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-9 h-9 border border-slate-200 shadow-2xs flex-shrink-0">
                          <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                            {r.participant_name ? r.participant_name.charAt(0).toUpperCase() : 'S'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{r.participant_name}</p>
                          <p className="text-[11px] text-slate-400 font-medium truncate">{r.participant_email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap pl-12 sm:pl-0">
                        {att && att.percentage != null && !pending && (
                          <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${att.passed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{att.percentage}%</span>
                        )}
                        {pending && <span className="text-xs font-bold px-2.5 py-1 rounded-xl border bg-amber-50 text-amber-700 border-amber-200">Awaiting Review</span>}
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${st.cls}`}>{st.label}</span>
                        {att && att.status !== 'in_progress' && (
                          <button type="button" onClick={() => navigate(`/airline/exams/${r.exam_id}/result/${att.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs">
                            <HiOutlineEye className="w-3.5 h-3.5 text-slate-500" /> View
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
