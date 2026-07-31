const express = require('express');
const router = express.Router();
const publicExamController = require('../controllers/publicExamController');
const { loadInvite } = publicExamController;

// ─── Public, passwordless exam-taking flow ────────────────────────────────────
// Auth is the unguessable invite token in the URL — NO authMiddleware here.
// A candidate opens the emailed link (/exam/<token>), which drives these
// endpoints. Correct answers are stripped from every payload until the attempt
// is submitted (via sanitizeQuestionForTaking / the /result gate).

// ─── GET /public-exam/:token — landing info (no questions yet) ─────────────────
router.get('/:token', loadInvite, publicExamController.getLandingInfo);

// ─── POST /public-exam/:token/start — begin (or resume) an attempt ────────────
router.post('/:token/start', loadInvite, publicExamController.startAttempt);

// ─── PUT /public-exam/:token/attempts/:attemptId/answer — autosave ────────────
router.put('/:token/attempts/:attemptId/answer', loadInvite, publicExamController.saveAnswer);

// ─── POST /public-exam/:token/attempts/:attemptId/submit — grade + finalize ───
router.post('/:token/attempts/:attemptId/submit', loadInvite, publicExamController.submitAttempt);

// ─── POST /public-exam/:token/attempts/:attemptId/violation — lockdown event ──
router.post('/:token/attempts/:attemptId/violation', loadInvite, publicExamController.reportViolation);

// ─── GET /public-exam/:token/attempts/:attemptId/result — full graded result ──
router.get('/:token/attempts/:attemptId/result', loadInvite, publicExamController.getResult);

module.exports = router;
