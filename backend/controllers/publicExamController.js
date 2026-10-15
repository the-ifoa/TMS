const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ExamInvite = require('../models/ExamInvite');
const { sanitizeQuestionForTaking } = require('../services/examGrading');
const {
  schedulingError, closeOpenAttempts, lockedFeedback, attemptCycleFilter, SAVE_PROJECTION,
  attemptDeadlinePassed, saveAnswers, submitAttemptOnce, recordViolation, checkAnswerAtomic,
} = require('../services/examAttemptFlow');

// Exam fields each kind of request needs. Autosaves arrive every few seconds
// from every candidate, so they must not pull the full question list (or the
// assignment list, which grows with every candidate) out of the database.
const EXAM_FIELDS = {
  landing: 'title description duration_minutes max_attempts questions._id lockdown_enabled allow_tab_switch limit_window_closes max_window_closes pass_percentage opens_at closes_at instant_feedback status',
  start: '-assignments -airline_visibility',
  light: 'status duration_minutes instant_feedback max_violations allow_tab_switch show_review',
};

// Builds middleware that loads the invite by token and attaches it + its exam
// (only `examFields`) to req. 404 on an unknown token — including the old token
// of a reassigned exam, which is replaced by a new one.
// Exam settings read by autosave / check / submit / violation are cached for a
// few seconds per process: with many candidates every autosave would otherwise
// re-read the same exam document. A settings edit is picked up within EXAM_CACHE_MS.
const EXAM_CACHE_MS = 15000;
const examCache = new Map(); // `${examId}|${fields}` → { at, exam }

async function findExam(examId, examFields, cache) {
  const key = `${examId}|${examFields}`;
  if (cache) {
    const hit = examCache.get(key);
    if (hit && Date.now() - hit.at < EXAM_CACHE_MS) return hit.exam;
  }
  const query = Exam.findById(examId).select(examFields);
  if (cache) query.lean();
  const exam = await query;
  if (cache && exam) {
    if (examCache.size > 500) examCache.clear();
    examCache.set(key, { at: Date.now(), exam });
  }
  return exam;
}

function loadInviteWith(examFields, { cache = false } = {}) {
  return async (req, res, next) => {
    try {
      const invite = await ExamInvite.findOne({ token: req.params.token });
      if (!invite) return res.status(404).json({ error: 'This exam link is invalid or has expired. If the exam was reassigned to you, use the newest link from your email.', invalid_link: true });
      if (invite.expires_at && invite.expires_at < new Date()) {
        return res.status(410).json({ error: 'This exam link has expired.', invalid_link: true });
      }
      const exam = await findExam(invite.exam_id, examFields, cache);
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });
      req.invite = invite;
      req.exam = exam;
      next();
    } catch (err) {
      console.error('publicExam loadInvite error:', err.message);
      res.status(500).json({ error: err.message });
    }
  };
}
exports.loadInviteWith = loadInviteWith;
exports.EXAM_FIELDS = EXAM_FIELDS;
exports.loadInvite = loadInviteWith(EXAM_FIELDS.start);

// Guard: the attempt must belong to this invite's participant + exam.
async function loadOwnAttempt(req, res, projection = null) {
  const query = ExamAttempt.findById(req.params.attemptId);
  if (projection) query.select(projection).lean();
  const attempt = await query;
  if (!attempt) { res.status(404).json({ error: 'Attempt not found.' }); return null; }
  if (String(attempt.exam_id) !== String(req.exam._id) ||
      String(attempt.participant_id) !== String(req.invite.participant_id)) {
    res.status(403).json({ error: 'Access denied.' }); return null;
  }
  return attempt;
}

// Everything the landing page and Start need about one candidate's attempts on
// one exam, from ONE small query (a candidate has a handful of attempts at most)
// instead of a count + several exists/findOne calls per request. Expired open
// attempts are closed first. Only the invite's current cycle counts for
// attempts left / passed / awaiting review — a reassign starts from a clean slate.
async function candidateSummary(exam, invite) {
  const load = () => ExamAttempt.find({ exam_id: exam._id, participant_id: invite.participant_id })
    .select('_id status passed created_at started_at window_close_count')
    .sort({ created_at: -1 })
    .lean();
  let all = await load();
  if (exam.duration_minutes > 0 && all.some((a) => a.status === 'in_progress')) {
    const closed = await closeOpenAttempts(exam, invite.participant_id, { onlyExpired: true });
    if (closed) all = await load();
  }
  const since = invite.cycle_started_at ? new Date(invite.cycle_started_at).getTime() : null;
  const cycle = since == null ? all : all.filter((a) => new Date(a.created_at).getTime() >= since);
  return {
    totalAttempts: all.length,
    usedInCycle: cycle.length,
    active: cycle.find((a) => a.status === 'in_progress') || null,
    lastFinished: cycle.find((a) => a.status !== 'in_progress') || null,
    // Already passed, or an earlier attempt still waits for manual grading:
    // no new attempt is offered.
    hasPassed: cycle.some((a) => a.passed === true),
    awaitingReview: cycle.some((a) => a.status === 'pending_review'),
  };
}

// Total attempts this candidate may make on the exam: the exam's Max attempts
// plus any extra granted by a reassign. Counted over ALL their attempts (a
// reassign doesn't reset the count — it only adds what's needed for a new one).
function attemptCapFor(exam, invite) {
  return exam.max_attempts + (invite.bonus_attempts || 0);
}

async function markInviteCompleted(invite, attemptId) {
  await ExamInvite.updateOne(
    { _id: invite._id },
    { $set: { status: 'completed', completed_at: new Date(), attempt_id: attemptId } }
  );
}

// ─── GET /public-exam/:token — landing info (no questions yet) ─────────────────
exports.getLandingInfo = async (req, res) => {
  try {
    const { invite, exam } = req;
    const [summary] = await Promise.all([
      candidateSummary(exam, invite),
      invite.status === 'sent'
        ? ExamInvite.updateOne({ _id: invite._id, status: 'sent' }, { $set: { status: 'opened', opened_at: invite.opened_at || new Date() } })
        : null,
    ]);
    if (invite.status === 'sent') invite.status = 'opened';
    const { totalAttempts: priorAttempts, active: activeAttempt, lastFinished, hasPassed, awaitingReview } = summary;
    const attemptCap = attemptCapFor(exam, invite);

    res.json({
      last_attempt_status: lastFinished ? lastFinished.status : null,
      has_passed: hasPassed,
      awaiting_review: awaitingReview,
      participant_name: invite.participant_name,
      exam: {
        title: exam.title,
        description: exam.description,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
        question_count: exam.questions.length,
        lockdown_enabled: exam.lockdown_enabled,
        allow_tab_switch: !!exam.allow_tab_switch,
        limit_window_closes: !!exam.limit_window_closes,
        max_window_closes: exam.max_window_closes ?? 0,
        pass_percentage: exam.pass_percentage,
        opens_at: exam.opens_at,
        closes_at: exam.closes_at,
        instant_feedback: !!exam.instant_feedback,
      },
      status: invite.status,
      attempts_used: priorAttempts,
      attempts_left: Math.max(0, attemptCap - priorAttempts),
      active_attempt_id: activeAttempt ? String(activeAttempt._id) : null,
      // Returns still allowed on the attempt in progress (null = not limited).
      window_closes_left: activeAttempt && exam.limit_window_closes
        ? Math.max(0, (exam.max_window_closes ?? 0) - (activeAttempt.window_close_count || 0))
        : null,
      last_attempt_id: lastFinished ? String(lastFinished._id) : null,
      // Only blocks starting a NEW attempt — an already-active one may still resume/finish.
      scheduling_error: activeAttempt ? null : schedulingError(exam, { ignoreClose: invite.ignore_close }),
    });
  } catch (err) {
    console.error('GET /public-exam/:token error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /public-exam/:token/start — begin (or resume) an attempt ────────────
exports.startAttempt = async (req, res) => {
  try {
    const { invite, exam } = req;
    if (exam.status !== 'published') return res.status(400).json({ error: 'This exam is not available.' });

    // Resume an in-progress attempt if one exists (a timed-out one is closed
    // first so the candidate gets a fresh attempt instead of an instant submit).
    const summary = await candidateSummary(exam, invite);
    const cycle = attemptCycleFilter(exam._id, invite.participant_id, invite);

    // Coming back to an attempt already in progress means the exam window was
    // closed in between. Count it atomically; past the exam's limit the attempt
    // is submitted as it stands and cannot be resumed. A page REFRESH (the
    // client says so: same browser tab, see PublicExam.jsx) just resumes —
    // refreshing never counts against the candidate.
    const isRefresh = req.body && req.body.resume === 'refresh';
    let attempt = null;
    if (summary.active) {
      attempt = isRefresh
        ? await ExamAttempt.findOne({ _id: summary.active._id, status: 'in_progress' })
        : await ExamAttempt.findOneAndUpdate(
          { _id: summary.active._id, status: 'in_progress' },
          { $push: { window_closes: { at: new Date() } }, $inc: { window_close_count: 1 } },
          { new: true }
        );
    }
    if (attempt && exam.limit_window_closes && attempt.window_close_count > (exam.max_window_closes ?? 0)) {
      await submitAttemptOnce(attempt._id, { auto_submitted: true, auto_submit_reason: 'window_closed' });
      await markInviteCompleted(invite, attempt._id);
      return res.status(403).json({
        error: 'You closed the exam window more times than this exam allows, so your attempt was submitted automatically.',
        auto_submitted: true,
        attempt_id: String(attempt._id),
      });
    }

    if (!attempt) {
      const schedErr = schedulingError(exam, { ignoreClose: invite.ignore_close });
      if (schedErr) return res.status(403).json({ error: schedErr });

      const { hasPassed, awaitingReview, totalAttempts: priorTotal } = summary;
      if (hasPassed) return res.status(400).json({ error: 'You have already passed this exam.' });
      if (awaitingReview) return res.status(400).json({ error: 'Your previous attempt is still being graded. You can try again once the result is published.' });
      if (priorTotal >= attemptCapFor(exam, invite)) {
        return res.status(400).json({ error: 'You have used all your attempts for this exam.' });
      }
      let questions = exam.questions.map((q) => q.toObject());
      if (exam.shuffle_questions) questions = questions.sort(() => Math.random() - 0.5);

      try {
        attempt = await ExamAttempt.create({
          exam_id: exam._id,
          exam_title_snapshot: exam.title,
          participant_id: invite.participant_id,
          participant_name: invite.participant_name,
          airline_id: invite.airline_id,
          attempt_number: priorTotal + 1,
          questions_snapshot: questions,
          status: 'in_progress',
          started_at: new Date(),
        });
      } catch (err) {
        // Two Start requests raced (double click / two tabs): the unique
        // open-attempt index let only one through — continue with that one.
        if (err.code !== 11000) throw err;
        attempt = await ExamAttempt.findOne({ ...cycle, status: 'in_progress' });
        if (!attempt) throw err;
      }
    }

    await ExamInvite.updateOne({ _id: invite._id }, { $set: { status: 'in_progress', attempt_id: attempt._id } });

    const json = attempt.toJSON();
    json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
    json.server_now = new Date(); // lets the client correct for a skewed clock
    json.answers = (json.answers || []).map((a) => ({ question_id: a.question_id, type: a.type, response: a.response }));
    // Instant-feedback exams: restore the already-checked (locked) answers on resume.
    if (exam.instant_feedback) Object.assign(json, lockedFeedback(attempt));
    res.json({
      attempt: json,
      exam: {
        title: exam.title,
        duration_minutes: exam.duration_minutes,
        lockdown_enabled: exam.lockdown_enabled,
        max_violations: exam.max_violations,
        allow_tab_switch: !!exam.allow_tab_switch,
        instant_feedback: !!exam.instant_feedback,
      },
      // How often the window has been closed on this attempt, and what is left.
      window_closes: {
        count: attempt.window_close_count || 0,
        limited: !!exam.limit_window_closes,
        max: exam.max_window_closes ?? 0,
        left: exam.limit_window_closes ? Math.max(0, (exam.max_window_closes ?? 0) - (attempt.window_close_count || 0)) : null,
      },
    });
  } catch (err) {
    console.error('POST /public-exam/:token/start error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Shared by the single-answer and batch autosave endpoints.
async function saveForAttempt(req, res, answers, timers) {
  const attempt = await loadOwnAttempt(req, res, SAVE_PROJECTION);
  if (!attempt) return null;
  if (attempt.status !== 'in_progress') { res.status(400).json({ error: 'This attempt is already submitted.', submitted: true }); return null; }
  if (attemptDeadlinePassed(attempt, req.exam)) { res.status(400).json({ error: 'Time is up for this exam.', time_up: true }); return null; }
  return saveAnswers(attempt, answers, timers);
}

// ─── PUT /public-exam/:token/attempts/:attemptId/answer — autosave one answer ──
exports.saveAnswer = async (req, res) => {
  try {
    const { question_id, response } = req.body;
    const result = await saveForAttempt(req, res, [{ question_id, response }]);
    if (!result) return;
    const skip = result.skipped[0];
    if (skip && skip.reason === 'locked') return res.status(409).json({ error: 'This answer has been checked and can no longer be changed.', locked: true });
    if (skip) return res.status(404).json({ error: 'Question not found in this attempt.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /public-exam answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /public-exam/:token/attempts/:attemptId/answers — autosave a batch ────
// Body: { answers: [{ question_id, response }], timers: { key: seconds } }.
// One request (and one database write) per autosave tick instead of one per answer.
exports.saveAnswers = async (req, res) => {
  try {
    const { answers = [], timers = null } = req.body || {};
    if (!Array.isArray(answers) || answers.length > 500) return res.status(400).json({ error: 'Invalid answers.' });
    const result = await saveForAttempt(req, res, answers, timers);
    if (!result) return;
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('PUT /public-exam answers error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /public-exam/:token/attempts/:attemptId/check — instant feedback ────
// Grades one answer, locks it and returns right/wrong, the correct answer, the
// explanation and the running score. Only for exams with instant feedback on.
exports.checkAnswer = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res, 'status exam_id participant_id');
    if (!attempt) return;
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This attempt is already submitted.', submitted: true });
    if (!req.exam.instant_feedback) return res.status(400).json({ error: 'Instant feedback is not enabled for this exam.' });

    const { question_id, response } = req.body;
    const result = await checkAnswerAtomic(attempt._id, question_id, response);
    if (!result) return res.status(404).json({ error: 'Question not found in this attempt.' });
    res.json(result);
  } catch (err) {
    console.error('POST /public-exam check error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /public-exam/:token/attempts/:attemptId/submit — grade + finalize ───
exports.submitAttempt = async (req, res) => {
  try {
    const own = await loadOwnAttempt(req, res, 'status exam_id participant_id');
    if (!own) return;
    // Idempotent: submitting an attempt that is already submitted (a retry after
    // a dropped response, the timer and the button together, an auto-submit)
    // succeeds instead of leaving the candidate stuck on an error.
    const { attempt, alreadySubmitted } = await submitAttemptOnce(own._id);
    await markInviteCompleted(req.invite, attempt._id);
    res.json({ attempt_id: String(attempt._id), status: attempt.status, already_submitted: alreadySubmitted });
  } catch (err) {
    console.error('POST /public-exam submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /public-exam/:token/attempts/:attemptId/violation — lockdown event ──
exports.reportViolation = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res, 'status exam_id participant_id violation_count');
    if (!attempt) return;
    if (attempt.status !== 'in_progress') return res.json({ violation_count: attempt.violation_count || 0 });

    const { type } = req.body;
    const validTypes = ['fullscreen_exit', 'tab_switch', 'devtools_suspected'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid violation type.' });
    // This exam lets candidates switch tabs: nothing to record.
    if (type === 'tab_switch' && req.exam.allow_tab_switch) {
      return res.json({ violation_count: attempt.violation_count || 0, auto_submitted_now: false });
    }

    const result = await recordViolation(attempt._id, type, req.exam.max_violations ?? 4);
    if (!result) return res.status(404).json({ error: 'Attempt not found.' });
    if (result.auto_submitted_now) await markInviteCompleted(req.invite, attempt._id);
    res.json(result);
  } catch (err) {
    console.error('POST /public-exam violation error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /public-exam/:token/attempts/:attemptId/result — graded result ───────
// The answer key (questions_snapshot: correct options, explanations) is only
// sent when the exam has review enabled; otherwise the candidate gets just the
// score and per-question correct / incorrect flags.
exports.getResult = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === 'in_progress') return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    const json = attempt.toJSON();
    const review = !!req.exam.show_review && attempt.status !== 'pending_review';
    if (!review) json.questions_snapshot = undefined;
    json.review_enabled = review;
    json.certificate = undefined; // delivered by email by the airline, never from this link
    res.json(json);
  } catch (err) {
    console.error('GET /public-exam result error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
