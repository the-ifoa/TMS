const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const dgrController = require('../controllers/dgrController');

router.use(authMiddleware, loadScope);

// A top-level airline keeps its existing DGR access; a sub-admin or an airline
// department needs an explicit dgr.* grant (departments never get one).
const canView = (req, res, next) =>
  (req.scope?.kind === 'airline' && req.scope.isTopLevel)
    ? next()
    : requirePermission('dgr.view', 'dgr.manage')(req, res, next);
const canManage = (req, res, next) =>
  (req.scope?.kind === 'airline' && req.scope.isTopLevel)
    ? next()
    : requirePermission('dgr.manage')(req, res, next);

// ─── GET /dgr/airlines — admin only: airlines that have participants ──────────
// Defined BEFORE `GET /dgr/:id` so the literal path isn't captured as an :id.
router.get('/airlines', canView, dgrController.listAirlines);

// ─── GET /dgr — list forms ────────────────────────────────────────────────────
router.get('/', canView, dgrController.listForms);

// ─── GET /dgr/:id — single form ───────────────────────────────────────────────
router.get('/:id', canView, dgrController.getForm);

// ─── POST /dgr — create (admin) ───────────────────────────────────────────────
router.post('/', canManage, dgrController.createForm);

// ─── PUT /dgr/:id — update fields + assignments (admin) ───────────────────────
router.put('/:id', canManage, dgrController.updateForm);

// ─── DELETE /dgr/:id (admin) ──────────────────────────────────────────────────
router.delete('/:id', canManage, dgrController.deleteForm);

module.exports = router;
