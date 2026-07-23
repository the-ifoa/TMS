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
} from 'react-icons/hi';
import { getAssignedExams, startExamAttempt } from '../api';
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

  useEffect(() => {
    getAssignedExams()
      .then((res) => setExams(res.data))
      .catch(() => toast.error('Failed to load exams.'))
      .finally(() => setLoading(false));
  }, []);

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
      <div className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9.5 h-9.5 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-2xs flex-shrink-0">
              <HiOutlineAcademicCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-none">
                Exam System
              </h1>
              <p className="text-xs font-medium text-slate-400 mt-1">
                Online examinations assigned to your airline students and candidates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-extrabold">
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
                  className="p-5 space-y-3 cursor-pointer border border-slate-200/80 rounded-2xl shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                        <HiOutlineAcademicCap className="w-5 h-5" />
                      </div>
                      <h2 className="text-base font-bold text-slate-900 truncate">{exam.title}</h2>
                    </div>
                  </div>

                  {exam.description && (
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{exam.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <HiOutlineClock className="w-3.5 h-3.5 text-slate-400" /> {exam.duration_minutes} min
                    </span>
                    <span className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">Pass ≥ {exam.pass_percentage}%</span>
                    <span className="bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">Max {exam.max_attempts} attempt{exam.max_attempts !== 1 ? 's' : ''}</span>
                    {created && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        <HiOutlineCalendar className="w-3.5 h-3.5 text-slate-400" /> {created}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                        <HiOutlineUsers className="w-3.5 h-3.5" /> {assignments.length}
                      </span>
                      {completedCount > 0 && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {completedCount} Completed
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-blue-600">View Students →</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Roster / Student Attempts — only ever shown once a card is clicked */}
      <Dialog open={!!rosterExam} onOpenChange={(open) => !open && setRosterExam(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
          {rosterExam && (
            <>
              <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                <DialogTitle>{rosterExam.title}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100">
                {(rosterExam.assignments || []).length === 0 ? (
                  <div className="p-6 text-center text-xs font-medium text-slate-400">
                    No students assigned to this exam.
                  </div>
                ) : (
                  rosterExam.assignments.map((a) => {
                    const attempt = a.latest_attempt;
                    const canStart =
                      !attempt || (attempt.status !== 'in_progress' && a.attempts_used < rosterExam.max_attempts);

                    return (
                      <div
                        key={a.participant_id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 gap-3 hover:bg-slate-50/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="w-8 h-8 border border-slate-200 flex-shrink-0">
                            <AvatarFallback className="bg-slate-200 text-slate-700 text-xs font-bold ring-0">
                              {a.participant_name ? a.participant_name.charAt(0).toUpperCase() : 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-bold text-slate-800 truncate">
                            {a.participant_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-auto">
                          {attempt && (
                            <>
                              {attempt.percentage != null && (
                                <span
                                  className={`text-sm font-black ${
                                    attempt.passed ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {attempt.percentage}%
                                </span>
                              )}
                              <Badge variant={STATUS_VARIANT[attempt.status] || 'default'}>
                                {STATUS_LABEL[attempt.status] || attempt.status}
                              </Badge>
                            </>
                          )}

                          {attempt?.status === 'in_progress' && (
                            <Button size="sm" onClick={() => navigate(`/airline/exams/${rosterExam.id}/take/${attempt.id}`)}>
                              <HiOutlinePlay className="w-3.5 h-3.5" />
                              Resume
                            </Button>
                          )}

                          {attempt && attempt.status !== 'in_progress' && (
                            <Button size="sm" variant="outline" onClick={() => navigate(`/airline/exams/${rosterExam.id}/result/${attempt.id}`)}>
                              <HiOutlineEye className="w-3.5 h-3.5 text-slate-500" />
                              View
                            </Button>
                          )}

                          {canStart && (
                            <Button size="sm" onClick={() => setStartTarget({ exam: rosterExam, participantId: a.participant_id })}>
                              <HiOutlinePlay className="w-3.5 h-3.5" />
                              {attempt ? 'Retake' : 'Start'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
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
