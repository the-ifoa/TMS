import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlinePlay,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineLockClosed,
  HiOutlineArrowsExpand,
  HiOutlineShieldExclamation,
  HiOutlineExclamationCircle,
  HiOutlineCalendar,
  HiOutlineUsers,
  HiOutlineSearch,
  HiOutlineX,
} from 'react-icons/hi';
import { getAssignedExams, startExamAttempt, getAirlineExamResults } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function requestFullscreen(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  return fn ? fn.call(el) : Promise.reject(new Error('Fullscreen not supported'));
}

const STATUS_LABEL = {
  in_progress: 'In Progress',
  submitted: 'Completed',
  pending_review: 'Pending Review',
  graded: 'Completed',
};

const STATUS_VARIANT = {
  in_progress: 'amber',
  submitted: 'emerald',
  pending_review: 'blue',
  graded: 'emerald',
};

export default function AirlineExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startTarget, setStartTarget] = useState(null); // { exam, participantId }
  const [starting, setStarting] = useState(false);
  // Roster is only ever shown once a card is explicitly clicked — nothing
  // is expanded on load.
  const [rosterExam, setRosterExam] = useState(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [results, setResults] = useState([]);
  const [resultsSearch, setResultsSearch] = useState('');

  useEffect(() => {
    getAssignedExams()
      .then((res) => setExams(res.data))
      .catch(() => toast.error('Failed to load exams.'))
      .finally(() => setLoading(false));
    getAirlineExamResults()
      .then((res) => setResults(res.data || []))
      .catch(() => {}); // non-blocking
  }, []);

  const INVITE_STATUS = {
    sent:        { label: 'Sent',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    opened:      { label: 'Opened',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    in_progress: { label: 'In Progress', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    completed:   { label: 'Completed',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const filteredResults = results.filter((r) => {
    const q = resultsSearch.trim().toLowerCase();
    return !q || (r.participant_name || '').toLowerCase().includes(q) || (r.exam_title_snapshot || '').toLowerCase().includes(q);
  });

  // Attempt is only created once the candidate confirms inside the modal —
  // closing the modal (X / overlay / Cancel) creates nothing, so no
  // "in_progress" attempt is ever left stranded from just opening it.
  const confirmStart = async () => {
    if (!startTarget) return;
    const { exam, participantId } = startTarget;
    setStarting(true);
    if (exam.lockdown_enabled) {
      // Fire this synchronously off the click so the browser still counts it
      // as a user gesture, before the async attempt-creation call below.
      requestFullscreen(document.documentElement).catch(() => {});
    }
    try {
      const res = await startExamAttempt(exam.id, participantId);
      setStartTarget(null);
      navigate(`/airline/exams/${exam.id}/take/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start exam.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="w-full min-h-full pb-20 flex flex-col">
      {/* ── Flush Full-Width Sticky Top Header ── */}
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-6 lg:px-8 py-2 sm:py-2.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-2xs flex-shrink-0">
              <HiOutlineAcademicCap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-none truncate">
                Exam System
              </h1>
              <p className="text-[11px] font-medium text-slate-400 mt-0.5 truncate hidden sm:block">
                Online examinations assigned to your airline students
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] sm:text-xs font-bold">
              {exams.length} Assigned Exam{exams.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Content Body ── */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : exams.length === 0 ? (
          <Card className="p-12 text-center text-sm font-medium text-slate-500 rounded-2xl">
            No exams have been assigned to your students yet.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => {
              const assignments = exam.assignments || [];
              const completedCount = assignments.filter((a) => a.latest_attempt?.status === 'submitted' || a.latest_attempt?.status === 'graded').length;
              const created = formatDate(exam.created_at);

              return (
                <Card
                  key={exam.id}
                  onClick={() => setRosterExam(exam)}
                  className="group relative p-6 bg-white border border-slate-200/90 rounded-3xl shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    {/* Top Header Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                          <HiOutlineAcademicCap className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-base font-bold text-slate-900 break-words leading-snug group-hover:text-blue-600 transition-colors">
                            {exam.title}
                          </h2>
                          {created && (
                            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                              <HiOutlineCalendar className="w-3 h-3 text-slate-400" />
                              <span>{created}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-100/80 text-xs font-bold flex-shrink-0">
                        Pass ≥ {exam.pass_percentage}%
                      </span>
                    </div>

                    {/* Description */}
                    {exam.description ? (
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 min-h-[36px]">
                        {exam.description}
                      </p>
                    ) : (
                      <div className="min-h-[12px]" />
                    )}

                    {/* Organized Info Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 pt-1">
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <HiOutlineClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{exam.duration_minutes} Mins</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <HiOutlineAcademicCap className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="truncate">Max {exam.max_attempts} Attempt{exam.max_attempts !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Bar */}
                  <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
                        <HiOutlineUsers className="w-3.5 h-3.5 text-slate-500" />
                        <span>{assignments.length}</span>
                      </span>
                      {completedCount > 0 && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                          {completedCount} Done
                        </span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      <span>View Students</span>
                      <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Participant Results (emailed-exam results) ── */}
        {results.length > 0 && (
          <div className="space-y-3 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">Participant Results</h2>
                <p className="text-xs font-medium text-slate-400">Exam links sent to your participants and their scores.</p>
              </div>
              {results.length > 4 && (
                <div className="relative w-full sm:w-64">
                  <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text" value={resultsSearch} onChange={(e) => setResultsSearch(e.target.value)}
                    placeholder="Search participant or exam…"
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100 overflow-hidden">
              {filteredResults.length === 0 ? (
                <div className="p-8 text-center text-xs font-medium text-slate-400">No results match your search.</div>
              ) : filteredResults.map((r) => {
                const st = INVITE_STATUS[r.status] || INVITE_STATUS.sent;
                const att = r.attempt;
                const pending = att && att.status === 'pending_review';
                return (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-9 h-9 border border-slate-200 shadow-2xs flex-shrink-0">
                        <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                          {r.participant_name ? r.participant_name.charAt(0).toUpperCase() : 'S'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{r.participant_name}</p>
                        <p className="text-[11px] text-slate-400 font-medium truncate">{r.exam_title_snapshot}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {att && att.percentage != null && !pending && (
                        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${att.passed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {att.percentage}%
                        </span>
                      )}
                      {pending && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl border bg-amber-50 text-amber-700 border-amber-200">Awaiting Review</span>
                      )}
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
          </div>
        )}
      </div>

      {/* Roster / Student Attempts — Redesigned for clean, organized, modern UX */}
      <Dialog
        open={!!rosterExam}
        onOpenChange={(open) => {
          if (!open) {
            setRosterExam(null);
            setRosterSearch('');
          }
        }}
      >
        <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border border-slate-200/80 shadow-2xl bg-white">
          {rosterExam && (() => {
            const allAssignments = rosterExam.assignments || [];
            const searchQ = rosterSearch.trim().toLowerCase();
            const filteredAssignments = allAssignments.filter(a =>
              !searchQ || (a.participant_name && a.participant_name.toLowerCase().includes(searchQ))
            );

            return (
              <>
                {/* Modal Sticky Header */}
                <div className="flex-shrink-0 px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-200/80 bg-white sticky top-0 z-10 space-y-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                        <HiOutlineAcademicCap className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words leading-snug">
                          {rosterExam.title}
                        </DialogTitle>
                        <p className="text-xs text-slate-500 font-medium truncate">
                          Assigned candidate roster and examination attempts
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Chips Bar */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700">
                      <HiOutlineClock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rosterExam.duration_minutes} mins</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700">
                      Pass ≥ {rosterExam.pass_percentage}%
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700">
                      Max {rosterExam.max_attempts} attempt{rosterExam.max_attempts !== 1 ? 's' : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-2xs ml-auto">
                      <HiOutlineUsers className="w-3.5 h-3.5" />
                      <span>{allAssignments.length} Candidates</span>
                    </span>
                  </div>

                  {/* Search Input for Roster */}
                  {allAssignments.length > 3 && (
                    <div className="relative pt-1">
                      <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={rosterSearch}
                        onChange={(e) => setRosterSearch(e.target.value)}
                        placeholder="Search student by name…"
                        className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
                      />
                      {rosterSearch && (
                        <button
                          onClick={() => setRosterSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <HiOutlineX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Candidate Rows List Container */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 bg-slate-50/60 space-y-2.5">
                  {filteredAssignments.length === 0 ? (
                    <div className="p-10 text-center text-xs font-medium text-slate-400 bg-white rounded-2xl border border-slate-200/80">
                      {allAssignments.length === 0 ? 'No candidates assigned to this exam.' : 'No candidates match your search.'}
                    </div>
                  ) : (
                    filteredAssignments.map((a) => {
                      const attempt = a.latest_attempt;
                      const canStart =
                        !attempt || (attempt.status !== 'in_progress' && a.attempts_used < rosterExam.max_attempts);

                      return (
                        <div
                          key={a.participant_id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all gap-3"
                        >
                          {/* Student Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="w-9 h-9 border border-slate-200 shadow-2xs flex-shrink-0">
                              <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                                {a.participant_name ? a.participant_name.charAt(0).toUpperCase() : 'S'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {a.participant_name}
                              </p>
                              <p className="text-[11px] text-slate-400 font-medium truncate">
                                Attempts: <span className="font-semibold text-slate-700">{a.attempts_used} / {rosterExam.max_attempts}</span>
                              </p>
                            </div>
                          </div>

                          {/* Score, Status & Actions */}
                          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            {/* Score & Status Badges */}
                            <div className="flex items-center gap-2">
                              {attempt && attempt.percentage != null && (
                                <span
                                  className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${
                                    attempt.passed
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {attempt.percentage}%
                                </span>
                              )}

                              {attempt ? (
                                <span
                                  className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${
                                    attempt.status === 'submitted' || attempt.status === 'graded'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : attempt.status === 'in_progress'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  {STATUS_LABEL[attempt.status] || attempt.status}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
                                  Not Started
                                </span>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                              {attempt && attempt.status !== 'in_progress' && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/airline/exams/${rosterExam.id}/result/${attempt.id}`)}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
                                >
                                  <HiOutlineEye className="w-3.5 h-3.5 text-slate-500" />
                                  <span>View</span>
                                </button>
                              )}

                              {attempt?.status === 'in_progress' && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/airline/exams/${rosterExam.id}/take/${attempt.id}`)}
                                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                                >
                                  <HiOutlinePlay className="w-3.5 h-3.5" />
                                  <span>Resume</span>
                                </button>
                              )}

                              {canStart && (
                                <button
                                  type="button"
                                  onClick={() => setStartTarget({ exam: rosterExam, participantId: a.participant_id })}
                                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                                >
                                  <HiOutlinePlay className="w-3.5 h-3.5" />
                                  <span>{attempt ? 'Retake' : 'Start'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!startTarget} onOpenChange={(open) => !starting && !open && setStartTarget(null)}>
        <DialogContent className="max-w-md" hideClose={starting}>
          {startTarget && (
            <div className="p-7 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto">
                <HiOutlineLockClosed className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-lg font-bold text-slate-900">{startTarget.exam.title}</h1>
                <p className="text-sm text-slate-500">
                  {startTarget.exam.lockdown_enabled
                    ? 'This exam runs in a locked, fullscreen session.'
                    : `Duration ${startTarget.exam.duration_minutes} min · Pass ≥ ${startTarget.exam.pass_percentage}%`}
                </p>
              </div>
              {startTarget.exam.lockdown_enabled && (
                <div className="text-left bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-600">
                  <p className="flex items-start gap-2"><HiOutlineArrowsExpand className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" /> The exam opens in fullscreen and must stay there.</p>
                  <p className="flex items-start gap-2"><HiOutlineShieldExclamation className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /> Exiting fullscreen or switching tabs counts as a violation.</p>
                  <p className="flex items-start gap-2"><HiOutlineExclamationCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> After <strong>{startTarget.exam.max_violations}</strong> violations, your exam is auto-submitted as-is.</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStartTarget(null)} disabled={starting}>
                  Cancel
                </Button>
                <Button variant="primary" className="flex-1" onClick={confirmStart} disabled={starting}>
                  {startTarget.exam.lockdown_enabled ? <HiOutlineArrowsExpand className="w-4 h-4" /> : <HiOutlinePlay className="w-4 h-4" />}
                  {starting ? 'Starting…' : startTarget.exam.lockdown_enabled ? 'Start Exam in Fullscreen' : 'Start Exam'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
