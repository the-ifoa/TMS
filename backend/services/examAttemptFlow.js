const Exam = require('../models/Exam');
const { gradeAnswer, computeAttemptScore, buildFeedback, buildProgress } = require('./examGrading');

// Grace after the exam's own deadline in which late autosaves still land (and
// before an expired attempt is closed on the candidate's next visit).
const LATE_SAVE_GRACE_MS = 2 * 60000;

// Returns an error message if the exam isn't open for new attempts right now,
// or null if it's fine to start one. Only gates NEW attempts — an attempt
// already in progress is unaffected by closes_at passing mid-way.
function schedulingError(exam, { ignoreClose = false } = {}) {
  const now = new Date();
  if (exam.opens_at && now < exam.opens_at) {
    return `This exam opens on ${exam.opens_at.toLocaleString()}.`;
  }
  if (!ignoreClose && exam.closes_at && now > exam.closes_at) {
    return `This exam closed on ${exam.closes_at.toLocaleString()}.`;
  }
  return null;
}

// Grades every question in an in-progress attempt and mutates it into its
// final submitted/pending_review state. Shared by the authed submit/violation
// endpoints (routes/exams.js) and the public token flow (routes/publicExam.js).
// Does not save() — the caller persists.
async function finalizeAttempt(attempt) {
  let hasPending = false;

  attempt.questions_snapshot.forEach((question) => {
    const answerEntry = attempt.answers.find((a) => String(a.question_id) === String(question._id));
    const response = answerEntry ? answerEntry.response : null;
    const graded = gradeAnswer(question, response);

    if (answerEntry) {
      answerEntry.is_correct = graded.is_correct;
      answerEntry.points_awarded = graded.points_awarded;
      answerEntry.needs_manual_grading = graded.needs_manual_grading;
    } else {
      attempt.answers.push({
        question_id: question._id, type: question.type, response: null,
        is_correct: graded.is_correct, points_awarded: graded.points_awarded,
        needs_manual_grading: graded.needs_manual_grading,
      });
    }
    if (graded.needs_manual_grading) hasPending = true;
  });

  attempt.submitted_at = new Date();
  attempt.time_taken_seconds = Math.round((attempt.submitted_at - attempt.started_at) / 1000);

  const exam = await Exam.findById(attempt.exam_id).select('pass_percentage section_settings');
  const { score, maxScore, percentage } = computeAttemptScore(
    attempt.questions_snapshot, attempt.answers, exam ? exam.section_settings : []
  );
  attempt.max_score = maxScore;

  if (hasPending) {
    attempt.status = 'pending_review';
  } else {
    attempt.status = 'submitted';
    attempt.score = score;
    attempt.percentage = percentage;
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 75);
  }
}

// Closes (grades + submits) a participant's in-progress attempts on an exam so
// they can never be resumed. `onlyExpired` limits it to attempts whose own
// duration already ran out — those can't be continued anyway and would
// otherwise reopen at 0:00 and submit instantly. Returns how many were closed.
async function closeOpenAttempts(exam, participantId, { onlyExpired = false } = {}) {
  const ExamAttempt = require('../models/ExamAttempt');
  const open = await ExamAttempt.find({ exam_id: exam._id, participant_id: participantId, status: 'in_progress' })
    .select('_id started_at').lean();
  const now = Date.now();
  let closed = 0;
  for (const attempt of open) {
    if (onlyExpired) {
      if (!(exam.duration_minutes > 0)) continue;
      const deadline = new Date(attempt.started_at).getTime() + exam.duration_minutes * 60000;
      if (now < deadline + LATE_SAVE_GRACE_MS) continue; // grace for a final autosave/submit
    }
    const res = await submitAttemptOnce(attempt._id);
    if (res && !res.alreadySubmitted) closed += 1;
  }
  return closed;
}

// Instant feedback: grades ONE question, locks the answer (no further edits)
// and returns the feedback + running score. Idempotent — re-checking a locked
// question returns the stored result and ignores the new response. Does not
// save(); the caller persists. Returns null when the question isn't in the attempt.
function checkAnswer(attempt, questionId, response) {
  const question = attempt.questions_snapshot.id(questionId);
  if (!question) return null;
  let entry = attempt.answers.find((a) => String(a.question_id) === String(questionId));
  if (!entry || !entry.locked) {
    const graded = gradeAnswer(question, response);
    if (entry) {
      entry.response = response;
    } else {
      attempt.answers.push({ question_id: question._id, type: question.type, response });
      entry = attempt.answers[attempt.answers.length - 1];
    }
    entry.is_correct = graded.is_correct;
    entry.points_awarded = graded.points_awarded;
    entry.needs_manual_grading = graded.needs_manual_grading;
    entry.locked = true;
  }
  return {
    feedback: buildFeedback(question, entry),
    progress: buildProgress(attempt.questions_snapshot, attempt.answers),
  };
}

// Feedback for every already-checked question — restores the UI on resume.
function lockedFeedback(attempt) {
  const feedback = [];
  attempt.answers.forEach((a) => {
    if (!a.locked) return;
    const question = attempt.questions_snapshot.id(a.question_id);
    if (question) feedback.push(buildFeedback(question, a));
  });
  return { feedback, progress: buildProgress(attempt.questions_snapshot, attempt.answers) };
}

// ─── Concurrency-safe attempt writes ──────────────────────────────────────────
// Many candidates autosave at once, and one candidate's browser sends several
// answers in parallel. Loading the whole attempt and save()-ing it back made
// those requests collide (Mongoose VersionError → 500 → answers lost and the
// final submit refused). Everything below writes with targeted atomic updates
// instead, so parallel requests never overwrite or reject each other.

// Only attempts started after a reassign belong to the invite's current cycle.
function attemptCycleFilter(examId, participantId, invite) {
  const filter = { exam_id: examId, participant_id: participantId };
  if (invite && invite.cycle_started_at) filter.created_at = { $gte: invite.cycle_started_at };
  return filter;
}

// What saveAnswers needs from the attempt — never the full question payloads.
const SAVE_PROJECTION = 'status exam_id participant_id airline_id started_at questions_snapshot._id questions_snapshot.type answers.question_id answers.locked';

function attemptDeadlinePassed(attempt, exam) {
  if (!exam || !(exam.duration_minutes > 0)) return false;
  const deadline = new Date(attempt.started_at).getTime() + exam.duration_minutes * 60000;
  return Date.now() > deadline + LATE_SAVE_GRACE_MS;
}

// Timer keys are client-built (`q_<id>` / `s_<hex>`); accept only that shape so
// a crafted key can't write anywhere else in the document.
const TIMER_KEY = /^(q_[a-f0-9]{24}|s_[a-f0-9]{0,400})$/;

// Saves a batch of answers ([{ question_id, response }], last one per question
// wins) plus optional timer readings ({ key: seconds }) with ONE bulkWrite.
// `attempt` is a lean doc loaded with SAVE_PROJECTION and known to be in progress.
// Returns { saved, skipped: [{ question_id, reason }] }.
async function saveAnswers(attempt, answers = [], timers = null) {
  const ExamAttempt = require('../models/ExamAttempt');
  const mongoose = require('mongoose');
  const typeById = new Map((attempt.questions_snapshot || []).map((q) => [String(q._id), q.type]));
  const locked = new Set((attempt.answers || []).filter((a) => a.locked).map((a) => String(a.question_id)));

  const latest = new Map();
  for (const a of Array.isArray(answers) ? answers : []) {
    if (a && a.question_id != null) latest.set(String(a.question_id), a.response === undefined ? null : a.response);
  }

  const ops = [];
  const skipped = [];
  let saved = 0;
  const open = { _id: attempt._id, status: 'in_progress' };
  for (const [qid, response] of latest) {
    const type = typeById.get(qid);
    if (!type) { skipped.push({ question_id: qid, reason: 'not_found' }); continue; }
    if (locked.has(qid)) { skipped.push({ question_id: qid, reason: 'locked' }); continue; }
    const oid = new mongoose.Types.ObjectId(qid);
    // Create the entry if the question has none yet…
    ops.push({ updateOne: { filter: { ...open, 'answers.question_id': { $ne: oid } }, update: { $push: { answers: { question_id: oid, type, response } } } } });
    // …then set the response (no-op on an answer locked by "Check answer").
    ops.push({ updateOne: { filter: { ...open, answers: { $elemMatch: { question_id: oid, locked: { $ne: true } } } }, update: { $set: { 'answers.$.response': response } } } });
    saved += 1;
  }

  if (timers && typeof timers === 'object') {
    const max = {};
    for (const [key, secs] of Object.entries(timers)) {
      const n = Number(secs);
      if (TIMER_KEY.test(key) && Number.isFinite(n) && n >= 0) max[`timer_elapsed.${key}`] = Math.min(Math.round(n), 7 * 24 * 3600);
    }
    if (Object.keys(max).length) ops.push({ updateOne: { filter: open, update: { $max: max } } });
  }

  if (ops.length) await ExamAttempt.bulkWrite(ops, { ordered: true });
  return { saved, skipped };
}

// Finalizes (grades + submits) an attempt exactly once, whoever gets there
// first: a manual submit, the timer, too many violations or closing the window.
// `extra` fields (auto_submitted, auto_submit_reason…) are applied only by the
// winner. Returns { attempt, alreadySubmitted } — or null if it doesn't exist.
async function submitAttemptOnce(attemptId, extra = {}) {
  const ExamAttempt = require('../models/ExamAttempt');
  for (let tries = 0; tries < 4; tries += 1) {
    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) return null;
    if (attempt.status !== 'in_progress') return { attempt, alreadySubmitted: true };
    Object.assign(attempt, extra);
    await finalizeAttempt(attempt);
    attempt.$where = { status: 'in_progress' }; // lose cleanly if another request finalized it meanwhile
    try {
      await attempt.save();
      return { attempt, alreadySubmitted: false };
    } catch (err) {
      if (err.name !== 'VersionError' && err.name !== 'DocumentNotFoundError') throw err;
      // Someone else wrote first — reload and re-check.
    }
  }
  throw new Error('Could not submit the attempt, please try again.');
}

// Records one lockdown violation atomically; auto-submits once the exam's limit
// is reached. Returns { violation_count, auto_submitted_now } or null if the
// attempt is gone. A finished attempt just reports its count.
async function recordViolation(attemptId, type, maxViolations) {
  const ExamAttempt = require('../models/ExamAttempt');
  const updated = await ExamAttempt.findOneAndUpdate(
    { _id: attemptId, status: 'in_progress' },
    { $push: { violations: { type, at: new Date() } }, $inc: { violation_count: 1 } },
    { new: true, projection: { violation_count: 1 } }
  );
  if (!updated) {
    const cur = await ExamAttempt.findById(attemptId).select('violation_count').lean();
    return cur ? { violation_count: cur.violation_count || 0, auto_submitted_now: false } : null;
  }
  const count = updated.violation_count;
  let autoSubmitted = false;
  if (count >= maxViolations) {
    const res = await submitAttemptOnce(attemptId, { auto_submitted: true, auto_submit_reason: 'violations' });
    autoSubmitted = !!res && !res.alreadySubmitted;
  }
  return { violation_count: count, auto_submitted_now: autoSubmitted };
}

// Instant feedback without a whole-document save: grades the answer, stores it
// locked with an atomic write, then returns the stored feedback. Idempotent.
// Returns null when the question isn't in the attempt.
async function checkAnswerAtomic(attemptId, questionId, response) {
  const ExamAttempt = require('../models/ExamAttempt');
  const mongoose = require('mongoose');
  const attempt = await ExamAttempt.findById(attemptId);
  if (!attempt) return null;
  const question = attempt.questions_snapshot.id(questionId);
  if (!question) return null;
  const entry = attempt.answers.find((a) => String(a.question_id) === String(questionId));
  if (!entry || !entry.locked) {
    const graded = gradeAnswer(question, response);
    const oid = new mongoose.Types.ObjectId(String(questionId));
    const fields = { response, is_correct: graded.is_correct, points_awarded: graded.points_awarded, needs_manual_grading: graded.needs_manual_grading, locked: true };
    const open = { _id: attempt._id, status: 'in_progress' };
    await ExamAttempt.bulkWrite([
      { updateOne: { filter: { ...open, 'answers.question_id': { $ne: oid } }, update: { $push: { answers: { question_id: oid, type: question.type, ...fields } } } } },
      { updateOne: { filter: { ...open, answers: { $elemMatch: { question_id: oid, locked: { $ne: true } } } }, update: { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`answers.$.${k}`, v])) } } },
    ], { ordered: true });
  }
  const fresh = await ExamAttempt.findById(attemptId);
  return checkAnswer(fresh, questionId, response); // entry is locked now → returns the stored result
}

module.exports = {
  finalizeAttempt, schedulingError, closeOpenAttempts, checkAnswer, lockedFeedback,
  attemptCycleFilter, SAVE_PROJECTION, attemptDeadlinePassed, saveAnswers,
  submitAttemptOnce, recordViolation, checkAnswerAtomic,
};
