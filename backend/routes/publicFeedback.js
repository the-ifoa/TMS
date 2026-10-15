const express = require('express');
const router = express.Router();
const { validateBody, schemas } = require('../middleware/validate');
const feedbackController = require('../controllers/feedbackController');

// ─── Public, passwordless Customer Training Feedback form ─────────────────────
// Auth is the unguessable token in the emailed link (/feedback/<token>).

// ─── GET /public-feedback/:token — form + pre-filled details ──────────────────
router.get('/:token', feedbackController.getPublicFeedback);

// ─── POST /public-feedback/:token/submit — save the answers ───────────────────
router.post('/:token/submit', validateBody(schemas.feedbackSubmit), feedbackController.submitPublicFeedback);

module.exports = router;
