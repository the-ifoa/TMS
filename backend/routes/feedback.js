const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const { validateBody, schemas } = require('../middleware/validate');
const feedbackController = require('../controllers/feedbackController');

// Customer Training Feedback — IFOA admin side only (never airline accounts).
router.use(authMiddleware, adminOnly, loadScope);

// ─── GET /feedback/exams/:examId — send status per participant + responses ────
router.get('/exams/:examId', requirePermission('exams.assign', 'exams.grade', 'exams.author'), feedbackController.getExamFeedback);

// ─── POST /feedback/exams/:examId/send — email the form to participants ───────
router.post('/exams/:examId/send', requirePermission('exams.assign'), validateBody(schemas.feedbackSend), feedbackController.sendExamFeedback);

// ─── DELETE /feedback/exams/:examId/responses/:feedbackId[?resend=1] ──────────
router.delete('/exams/:examId/responses/:feedbackId', requirePermission('exams.assign'), feedbackController.deleteExamFeedback);

module.exports = router;
