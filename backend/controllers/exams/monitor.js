const Exam = require('../../models/Exam');
const ExamAttempt = require('../../models/ExamAttempt');
const ExamInvite = require('../../models/ExamInvite');
const Airline = require('../../models/Airline');
const { submitAttemptOnce, attemptDeadlineMs } = require('../../services/examAttemptFlow');
const { isAdmin, attemptScopeFilter, canManageExam } = require('./access');

// ─── Live monitor ─────────────────────────────────────────────────────────────
// Who is taking an exam right now: progress, the question they're on, when
// their browser last checked in, violations and time left — plus the ones
// that finished recently. Staff can add time or submit an attempt for them.
// Visibility follows the results page: an IFOA admin sees everyone, the
// owning airline sees every candidate of its exam, any other airline only
// its own candidates.

const RECENT_MS = 2 * 60 * 60 * 1000; // "finished" list: the last 2 hours
const MAX_EXTRA_SECONDS = 24 * 3600;

const answered = (r) => r != null && r !== '' && !(Array.isArray(r) && (!r.length || r.every((x) => x == null || x === '')));

async function loadExam(req, res) {
  const exam = await Exam.findById(req.params.id)
    .select('title duration_minutes owner_airline owner_department lockdown_enabled max_violations limit_window_closes max_window_closes deleted_at status')
    .lean().catch(() => null);
  if (!exam) { res.status(404).json({ error: 'Exam not found.' }); return null; }
  return exam;
}

// Attempts this caller may see on this exam.
async function scopeFor(req, examId) {
  req.query.exam_id = String(examId);
  return attemptScopeFilter(req);
}

// May this caller act (add time / submit) on this attempt? An IFOA admin, the
// exam's owning airline, or the airline whose own candidate it is.
async function canAct(req, attempt) {
  if (isAdmin(req) || String(attempt.airline_id) === String(req.admin.id)) return true;
  const exam = await Exam.findById(attempt.exam_id).select('owner_airline owner_department').lean();
  return !!exam && canManageExam(req, exam);
}

// GET /exams/:id/live
exports.liveMonitor = async (req, res) => {
  try {
    const exam = await loadExam(req, res);
    if (!exam) return;
    const scope = await scopeFor(req, exam._id);
    const since = new Date(Date.now() - RECENT_MS);
    const [active, finished] = await Promise.all([
      ExamAttempt.find({ ...scope, status: 'in_progress' })
        .select('participant_name participant_id airline_id attempt_number started_at extra_seconds last_seen_at current_index violation_count violations window_close_count questions_snapshot._id answers.question_id answers.response')
        .sort({ started_at: 1 }).lean(),
      ExamAttempt.find({ ...scope, status: { $ne: 'in_progress' }, submitted_at: { $gte: since } })
        .select('participant_name airline_id submitted_at started_at time_taken_seconds status percentage passed auto_submitted auto_submit_reason violation_count')
        .sort({ submitted_at: -1 }).limit(100).lean(),
    ]);
    const airlineIds = [...new Set([...active, ...finished].filter((a) => a.airline_id).map((a) => String(a.airline_id)))];
    const airlines = await Airline.find({ _id: { $in: airlineIds } }).select('airlineName').lean();
    const airlineName = Object.fromEntries(airlines.map((a) => [String(a._id), a.airlineName || '']));

    res.json({
      server_now: new Date(),
      exam: {
        id: String(exam._id), title: exam.title, duration_minutes: exam.duration_minutes || 0, deleted: !!exam.deleted_at,
        lockdown_enabled: !!exam.lockdown_enabled, max_violations: exam.max_violations,
        limit_window_closes: !!exam.limit_window_closes, max_window_closes: exam.max_window_closes ?? 0,
      },
      active: active.map((a) => {
        const ids = new Set((a.questions_snapshot || []).map((q) => String(q._id)));
        const last = (a.violations || [])[(a.violations || []).length - 1] || null;
        return {
          id: String(a._id),
          participant_name: a.participant_name,
          airline_name: airlineName[String(a.airline_id)] || '',
          attempt_number: a.attempt_number,
          started_at: a.started_at,
          deadline: attemptDeadlineMs(a, exam.duration_minutes),
          extra_seconds: a.extra_seconds || 0,
          total: ids.size,
          answered: (a.answers || []).filter((x) => ids.has(String(x.question_id)) && answered(x.response)).length,
          current_index: a.current_index,
          last_seen_at: a.last_seen_at || a.started_at,
          violation_count: a.violation_count || 0,
          last_violation: last ? { type: last.type, at: last.at } : null,
          window_close_count: a.window_close_count || 0,
        };
      }),
      finished: finished.map((a) => ({
        id: String(a._id),
        participant_name: a.participant_name,
        airline_name: airlineName[String(a.airline_id)] || '',
        submitted_at: a.submitted_at,
        time_taken_seconds: a.time_taken_seconds,
        status: a.status,
        percentage: a.percentage,
        passed: a.passed,
        auto_submit_reason: a.auto_submitted ? a.auto_submit_reason : null,
        violation_count: a.violation_count || 0,
      })),
    });
  } catch (err) {
    console.error('GET /exams/:id/live error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

function minutesFrom(req) {
  const m = Math.round(Number(req.body?.minutes));
  return Number.isFinite(m) && m >= 1 && m <= 240 ? m : null;
}

// POST /exams/attempts/:attemptId/extend { minutes } — more time for one candidate.
exports.extendAttempt = async (req, res) => {
  try {
    const minutes = minutesFrom(req);
    if (!minutes) return res.status(400).json({ error: 'Add between 1 and 240 minutes.' });
    const attempt = await ExamAttempt.findById(req.params.attemptId).select('exam_id airline_id status extra_seconds started_at').lean().catch(() => null);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!(await canAct(req, attempt))) return res.status(403).json({ error: 'Access denied.' });
    if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'This attempt has already been submitted.' });
    const exam = await Exam.findById(attempt.exam_id).select('duration_minutes').lean();
    if (!(exam?.duration_minutes > 0)) return res.status(400).json({ error: 'This exam has no time limit.' });
    if ((attempt.extra_seconds || 0) + minutes * 60 > MAX_EXTRA_SECONDS) return res.status(400).json({ error: 'That is more than 24 hours of extra time.' });
    const updated = await ExamAttempt.findOneAndUpdate(
      { _id: attempt._id, status: 'in_progress' },
      { $inc: { extra_seconds: minutes * 60 } },
      { returnDocument: 'after', projection: { extra_seconds: 1, started_at: 1 } },
    ).lean();
    if (!updated) return res.status(409).json({ error: 'This attempt has already been submitted.' });
    res.json({ extra_seconds: updated.extra_seconds, deadline: attemptDeadlineMs(updated, exam.duration_minutes) });
  } catch (err) {
    console.error('POST /exams/attempts/:id/extend error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /exams/:id/live/extend { minutes } — more time for everyone taking it now.
exports.extendAll = async (req, res) => {
  try {
    const minutes = minutesFrom(req);
    if (!minutes) return res.status(400).json({ error: 'Add between 1 and 240 minutes.' });
    const exam = await loadExam(req, res);
    if (!exam) return;
    if (!(exam.duration_minutes > 0)) return res.status(400).json({ error: 'This exam has no time limit.' });
    const scope = await scopeFor(req, exam._id); // an airline only reaches its own candidates
    const result = await ExamAttempt.updateMany(
      { ...scope, status: 'in_progress', extra_seconds: { $lte: MAX_EXTRA_SECONDS - minutes * 60 } },
      { $inc: { extra_seconds: minutes * 60 } },
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error('POST /exams/:id/live/extend error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// POST /exams/attempts/:attemptId/force-submit — submit with the answers saved
// so far. The candidate's screen finds out on its next autosave (≤ 10 s).
exports.forceSubmitAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId).select('exam_id airline_id status').lean().catch(() => null);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!(await canAct(req, attempt))) return res.status(403).json({ error: 'Access denied.' });
    const result = await submitAttemptOnce(attempt._id, { auto_submitted: true, auto_submit_reason: 'admin', submitted_by: req.admin.id || null });
    if (!result) return res.status(404).json({ error: 'Attempt not found.' });
    if (result.alreadySubmitted) return res.status(409).json({ error: 'This attempt has already been submitted.' });
    await ExamInvite.updateMany(
      { attempt_id: attempt._id, status: { $ne: 'completed' } },
      { $set: { status: 'completed', completed_at: new Date() } },
    );
    const a = result.attempt;
    res.json({ status: a.status, percentage: a.percentage, passed: a.passed });
  } catch (err) {
    console.error('POST /exams/attempts/:id/force-submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
