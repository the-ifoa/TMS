const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const { validateBody, schemas } = require('../middleware/validate');
const feedbackController = require('../controllers/feedbackController');

// Customer Training Feedback — IFOA admin side only (never airline accounts).
router.use(authMiddleware, adminOnly, loadScope);

// ─── GET /feedback/dashboard — all feedback rolled up by airline / exam / question ──
router.get('/dashboard', requirePermission('exams.assign', 'exams.grade', 'exams.author'), feedbackController.getFeedbackDashboard);

// ─── GET /feedback/exams/:examId — send status per participant + responses ────
router.get('/exams/:examId', requirePermission('exams.assign', 'exams.grade', 'exams.author'), feedbackController.getExamFeedback);

// ─── POST /feedback/exams/:examId/send — email the form to participants ───────
router.post('/exams/:examId/send', requirePermission('exams.assign'), validateBody(schemas.feedbackSend), feedbackController.sendExamFeedback);

// ─── POST /feedback/exams/:examId/email-report — mail the PDF report to an airline ──
router.post('/exams/:examId/email-report', requirePermission('exams.assign', 'exams.grade', 'exams.author'), validateBody(schemas.feedbackReportEmail), feedbackController.emailFeedbackReport);

// ─── DELETE /feedback/exams/:examId/responses/:feedbackId[?resend=1] ──────────
router.delete('/exams/:examId/responses/:feedbackId', requirePermission('exams.assign'), feedbackController.deleteExamFeedback);
router.post('/exams/:examId/responses/bulk-delete', requirePermission('exams.assign'), feedbackController.bulkDeleteExamFeedback);

// ─── DELETE /feedback/responses/:feedbackId — any response, from the dashboard ──
router.delete('/responses/:feedbackId', requirePermission('exams.assign'), feedbackController.deleteFeedback);

module.exports = router;
