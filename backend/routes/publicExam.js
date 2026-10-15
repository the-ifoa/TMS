const express = require('express');
const router = express.Router();
const publicExamController = require('../controllers/publicExamController');
const { loadInviteWith, EXAM_FIELDS } = publicExamController;
const landing = loadInviteWith(EXAM_FIELDS.landing);
const start = loadInviteWith(EXAM_FIELDS.start);
const light = loadInviteWith(EXAM_FIELDS.light, { cache: true });

// ─── Public, passwordless exam-taking flow ────────────────────────────────────
// Auth is the unguessable invite token in the URL — NO authMiddleware here.
// A candidate opens the emailed link (/exam/<token>), which drives these
// endpoints. Correct answers are stripped from every payload until the attempt
// is submitted (via sanitizeQuestionForTaking / the /result gate).

// ─── GET /public-exam/:token — landing info (no questions yet) ─────────────────
router.get('/:token', landing, publicExamController.getLandingInfo);

// ─── POST /public-exam/:token/start — begin (or resume) an attempt ────────────
router.post('/:token/start', start, publicExamController.startAttempt);

// ─── PUT /public-exam/:token/attempts/:attemptId/answer — autosave ────────────
router.put('/:token/attempts/:attemptId/answer', light, publicExamController.saveAnswer);

// ─── PUT /public-exam/:token/attempts/:attemptId/answers — batched autosave ────
router.put('/:token/attempts/:attemptId/answers', light, publicExamController.saveAnswers);

// ─── POST /public-exam/:token/attempts/:attemptId/check — instant feedback ────
router.post('/:token/attempts/:attemptId/check', light, publicExamController.checkAnswer);

// ─── POST /public-exam/:token/attempts/:attemptId/submit — grade + finalize ───
router.post('/:token/attempts/:attemptId/submit', light, publicExamController.submitAttempt);

// ─── POST /public-exam/:token/attempts/:attemptId/violation — lockdown event ──
router.post('/:token/attempts/:attemptId/violation', light, publicExamController.reportViolation);

// ─── GET /public-exam/:token/attempts/:attemptId/result — full graded result ──
router.get('/:token/attempts/:attemptId/result', light, publicExamController.getResult);

module.exports = router;
