const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const questionBankController = require('../controllers/questionBankController');

router.use(authMiddleware);

// ═══════════════════════════════════════════════════════════════════════════
// Banks (named containers)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /question-bank/groups — list banks with question counts (admin) ─────
router.get('/groups', questionBankController.listGroups);

// ─── POST /question-bank/groups — create a bank (admin) ───────────────────────
router.post('/groups', questionBankController.createGroup);

// ─── PUT /question-bank/groups/:id — rename/update a bank (admin) ────────────
router.put('/groups/:id', questionBankController.updateGroup);

// ─── DELETE /question-bank/groups/:id (admin) — cascades its questions ───────
router.delete('/groups/:id', questionBankController.deleteGroup);

// ═══════════════════════════════════════════════════════════════════════════
// Items (questions within a bank)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /question-bank/items — filterable list, scoped to one bank ──────────
router.get('/items', questionBankController.listItems);

// ─── GET /question-bank/topics — distinct topic labels within a bank ─────────
router.get('/topics', questionBankController.listTopics);

// ─── POST /question-bank/items — create one item (admin) ─────────────────────
router.post('/items', questionBankController.createItem);

// ─── PUT /question-bank/items/:id — update (admin) ────────────────────────────
router.put('/items/:id', questionBankController.updateItem);

// ─── DELETE /question-bank/items/:id (admin) — cascades Cloudinary cleanup ───
router.delete('/items/:id', questionBankController.deleteItem);

module.exports = router;
