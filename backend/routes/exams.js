const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const examsController = require('../controllers/examsController');

router.use(authMiddleware);

// ─── GET /exams/airlines — admin only: airlines with participants, for assigning ──
router.get('/airlines', examsController.listAirlines);

// ─── GET /exams/airline-results — airline: their participants' invite + score status ──
// Defined BEFORE `GET /exams/:id` so the literal path isn't captured as an :id.
router.get('/airline-results', examsController.airlineResults);

// ─── GET /exams/assigned — airline: exams assigned to their participants ─────────
router.get('/assigned', examsController.listAssigned);

// ─── GET /exams/attempts — list attempts ─────────────────────────────────────────
router.get('/attempts', examsController.listAttempts);

// ─── GET /exams/attempts/:attemptId — resume in-progress attempt (sanitized) ────
router.get('/attempts/:attemptId', examsController.getAttempt);

// ─── GET /exams/attempts/:attemptId/result — full result incl. correct answers ──
router.get('/attempts/:attemptId/result', examsController.getAttemptResult);

// ─── GET /exams/participants/:participantId/performance — cross-exam profile ────
router.get('/participants/:participantId/performance', examsController.participantPerformance);

// ─── PUT /exams/attempts/:attemptId/answer — autosave one answer ────────────────
router.put('/attempts/:attemptId/answer', examsController.saveAttemptAnswer);

// ─── POST /exams/attempts/:attemptId/submit — grade + finalize ──────────────────
router.post('/attempts/:attemptId/submit', examsController.submitAttempt);

// ─── POST /exams/attempts/:attemptId/violation — record a lockdown-mode violation ─
router.post('/attempts/:attemptId/violation', examsController.reportViolation);

// ─── PUT /exams/attempts/:attemptId/grade — admin manually grades pending items ─
router.put('/attempts/:attemptId/grade', examsController.gradeAttempt);

// ─── POST /exams/questions/upload-image — admin uploads a question image ────────
router.post('/questions/upload-image', examsController.uploadQuestionImage);

// ─── DELETE /exams/questions/image/:publicId — admin removes an unsaved upload ──
router.delete('/questions/image/:publicId', examsController.deleteQuestionImage);

// ─── GET /exams — list exams ──────────────────────────────────────────────────
router.get('/', examsController.listExams);

// ─── POST /exams — create (admin, draft) ──────────────────────────────────────
router.post('/', examsController.createExam);

// ─── GET /exams/:id — single exam ─────────────────────────────────────────────
router.get('/:id', examsController.getExam);

// ─── PUT /exams/:id — update meta + questions (admin) ─────────────────────────
router.put('/:id', examsController.updateExam);

// ─── POST /exams/:id/publish — draft/archived -> published (admin) ───────────
router.post('/:id/publish', examsController.publishExam);

// ─── POST /exams/:id/assign — assign to participants (admin) ─────────────────
router.post('/:id/assign', examsController.assignExam);

// ─── POST /exams/:id/send-invites — admin emails the take-link to participants ──
router.post('/:id/send-invites', examsController.sendInvites);

// ─── GET /exams/:id/invites — admin: invite + attempt status for an exam ────────
router.get('/:id/invites', examsController.listInvites);

// ─── GET /exams/:id/analytics — admin: per-question miss rate + pass-rate over time ──
router.get('/:id/analytics', examsController.getAnalytics);

// ─── POST /exams/:id/attempts — start an attempt (airline, on behalf of a participant) ──
router.post('/:id/attempts', examsController.startAttempt);

// ─── DELETE /exams/:id (admin) — cascades Cloudinary image cleanup ───────────
router.delete('/:id', examsController.deleteExam);

module.exports = router;
