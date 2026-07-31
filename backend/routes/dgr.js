const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const dgrController = require('../controllers/dgrController');

router.use(authMiddleware);

// ─── GET /dgr/airlines — admin only: airlines that have participants ──────────
// Defined BEFORE `GET /dgr/:id` so the literal path isn't captured as an :id.
router.get('/airlines', dgrController.listAirlines);

// ─── GET /dgr — list forms ────────────────────────────────────────────────────
router.get('/', dgrController.listForms);

// ─── GET /dgr/:id — single form ───────────────────────────────────────────────
router.get('/:id', dgrController.getForm);

// ─── POST /dgr — create (admin) ───────────────────────────────────────────────
router.post('/', dgrController.createForm);

// ─── PUT /dgr/:id — update fields + assignments (admin) ───────────────────────
router.put('/:id', dgrController.updateForm);

// ─── DELETE /dgr/:id (admin) ──────────────────────────────────────────────────
router.delete('/:id', dgrController.deleteForm);

module.exports = router;
