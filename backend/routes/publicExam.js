const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ExamInvite = require('../models/ExamInvite');
const { sanitizeQuestionForTaking } = require('../services/examGrading');
const { finalizeAttempt, schedulingError } = require('../services/examAttemptFlow');

// ─── Public, passwordless exam-taking flow ────────────────────────────────────
// Auth is the unguessable invite token in the URL — NO authMiddleware here.
// A candidate opens the emailed link (/exam/<token>), which drives these
// endpoints. Correct answers are stripped from every payload until the attempt
// is submitted (via sanitizeQuestionForTaking / the /result gate).

// Loads the invite by token and attaches it + its exam to req. 404 on unknown token.
async function loadInvite(req, res, next) {
  try {
    const invite = await ExamInvite.findOne({ token: req.params.token });
    if (!invite) return res.status(404).json({ error: 'This exam link is invalid or has expired.' });
    if (invite.expires_at && invite.expires_at < new Date()) {
      return res.status(410).json({ error: 'This exam link has expired.' });
    }
    const exam = await Exam.findById(invite.exam_id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    req.invite = invite;
    req.exam = exam;
    next();
  } catch (err) {
    console.error('publicExam loadInvite error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── GET /public-exam/:token — landing info (no questions yet) ─────────────────
router.get('/:token', loadInvite, async (req, res) => {
  try {
    const { invite, exam } = req;
    if (invite.status === 'sent') {
      invite.status = 'opened';
      invite.opened_at = invite.opened_at || new Date();
      await invite.save();
    }

    const priorAttempts = await ExamAttempt.countDocuments({ exam_id: exam._id, participant_id: invite.participant_id });
    const activeAttempt = await ExamAttempt.findOne({
      exam_id: exam._id, participant_id: invite.participant_id, status: 'in_progress',
    }).select('_id');

    // Latest finished attempt (for the "already completed" case).
    const lastFinished = await ExamAttempt.findOne({
      exam_id: exam._id, participant_id: invite.participant_id, status: { $ne: 'in_progress' },
    }).sort({ created_at: -1 }).select('_id status');

    res.json({
      participant_name: invite.participant_name,
      exam: {
        title: exam.title,
        description: exam.description,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
        question_count: exam.questions.length,
        lockdown_enabled: exam.lockdown_enabled,
        pass_percentage: exam.pass_percentage,
        opens_at: exam.opens_at,
        closes_at: exam.closes_at,
      },
      status: invite.status,
      attempts_used: priorAttempts,
      attempts_left: Math.max(0, exam.max_attempts - priorAttempts),
      active_attempt_id: activeAttempt ? String(activeAttempt._id) : null,
      last_attempt_id: lastFinished ? String(lastFinished._id) : null,
      // Only blocks starting a NEW attempt — an already-active one may still resume/finish.
      scheduling_error: activeAttempt ? null : schedulingError(exam),
    });
  } catch (err) {
    console.error('GET /public-exam/:token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /public-exam/:token/start — begin (or resume) an attempt ────────────
router.post('/:token/start', loadInvite, async (req, res) => {
  try {
    const { invite, exam } = req;
    if (exam.status !== 'published') return res.status(400).json({ error: 'This exam is not available.' });

    // Resume an in-progress attempt if one exists.
    let attempt = await ExamAttempt.findOne({
      exam_id: exam._id, participant_id: invite.participant_id, status: 'in_progress',
    });

    if (!attempt) {
      const schedErr = schedulingError(exam);
      if (schedErr) return res.status(403).json({ error: schedErr });

      const priorAttempts = await ExamAttempt.countDocuments({ exam_id: exam._id, participant_id: invite.participant_id });
      if (priorAttempts >= exam.max_attempts) {
        return res.status(400).json({ error: 'You have used all your attempts for this exam.' });
      }
      let questions = exam.questions.map((q) => q.toObject());
      if (exam.shuffle_questions) questions = questions.sort(() => Math.random() - 0.5);

      attempt = await ExamAttempt.create({
        exam_id: exam._id,
        exam_title_snapshot: exam.title,
        participant_id: invite.participant_id,
        participant_name: invite.participant_name,
        airline_id: invite.airline_id,
        attempt_number: priorAttempts + 1,
        questions_snapshot: questions,
        status: 'in_progress',
        started_at: new Date(),
      });
    }

    invite.status = 'in_progress';
    invite.attempt_id = attempt._id;
    await invite.save();

    const json = attempt.toJSON();
    json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
    json.answers = (json.answers || []).map((a) => ({ question_id: a.question_id, type: a.type, response: a.response }));
    res.json({
      attempt: json,
      exam: {
        title: exam.title,
        duration_minutes: exam.duration_minutes,
        lockdown_enabled: exam.lockdown_enabled,
        max_violations: exam.max_violations,
      },
    });
  } catch (err) {
    console.error('POST /public-exam/:token/start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Guard: the attempt must belong to this invite's participant + exam.
async function loadOwnAttempt(req, res) {
  const attempt = await ExamAttempt.findById(req.params.attemptId);
  if (!attempt) { res.status(404).json({ error: 'Attempt not found.' }); return null; }
  if (String(attempt.exam_id) !== String(req.exam._id) ||
      String(attempt.participant_id) !== String(req.invite.participant_id)) {
    res.status(403).json({ error: 'Access denied.' }); return null;
  }
  return attempt;
}

// ─── PUT /public-exam/:token/attempts/:attemptId/answer — autosave ────────────
router.put('/:token/attempts/:attemptId/answer', loadInvite, async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This attempt is already submitted.' });

    const { question_id, response } = req.body;
    const question = attempt.questions_snapshot.id(question_id);
    if (!question) return res.status(404).json({ error: 'Question not found in this attempt.' });
    const entry = attempt.answers.find((a) => String(a.question_id) === String(question_id));
    if (entry) entry.response = response;
    else attempt.answers.push({ question_id, type: question.type, response });
    await attempt.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /public-exam answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /public-exam/:token/attempts/:attemptId/submit — grade + finalize ───
router.post('/:token/attempts/:attemptId/submit', loadInvite, async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'This attempt is already submitted.' });

    await finalizeAttempt(attempt);
    await attempt.save();

    req.invite.status = 'completed';
    req.invite.completed_at = new Date();
    req.invite.attempt_id = attempt._id;
    await req.invite.save();

    res.json({ attempt_id: String(attempt._id), status: attempt.status });
  } catch (err) {
    console.error('POST /public-exam submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /public-exam/:token/attempts/:attemptId/violation — lockdown event ──
router.post('/:token/attempts/:attemptId/violation', loadInvite, async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'in_progress') return res.json({ violation_count: attempt.violation_count || 0 });

    const { type } = req.body;
    const validTypes = ['fullscreen_exit', 'tab_switch', 'devtools_suspected'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid violation type.' });

    attempt.violations.push({ type, at: new Date() });
    attempt.violation_count = attempt.violations.length;

    const maxViolations = req.exam.max_violations ?? 4;
    let autoSubmitted = false;
    if (attempt.violation_count >= maxViolations) {
      attempt.auto_submitted = true;
      await finalizeAttempt(attempt);
      autoSubmitted = true;
      req.invite.status = 'completed';
      req.invite.completed_at = new Date();
      await req.invite.save();
    }
    await attempt.save();
    res.json({ violation_count: attempt.violation_count, auto_submitted_now: autoSubmitted });
  } catch (err) {
    console.error('POST /public-exam violation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /public-exam/:token/attempts/:attemptId/result — full graded result ──
router.get('/:token/attempts/:attemptId/result', loadInvite, async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status === 'in_progress') return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('GET /public-exam result error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
