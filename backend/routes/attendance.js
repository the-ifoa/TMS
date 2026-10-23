const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const attendanceController = require('../controllers/attendanceController');

router.use(authMiddleware, loadScope);

const canView   = requirePermission('attendance.view');
const canManage = requirePermission('attendance.manage');
// Airlines may only ask for a sheet (names + dates) by ticking "Track
// Attendance" on an enrollment. Filling it in is IFOA admin work.
const canRequest = (req, res, next) => (req.scope && req.scope.kind === 'airline' ? next() : canManage(req, res, next));

// ─── GET /api/attendance — list sheets ───────────────────────────────────────
router.get('/', canView, attendanceController.listSheets);

// ─── GET /api/attendance/:id ──────────────────────────────────────────────────
router.get('/:id', canView, attendanceController.getSheet);

// ─── POST /api/attendance/bulk — ensure one sheet per training batch ─────────
router.post('/bulk', canRequest, attendanceController.bulkEnsureSheets);

// ─── POST /api/attendance — admin creates a sheet ─────────────────────────────
router.post('/', adminOnly, canManage, attendanceController.createSheet);

// ─── PUT /api/attendance/:id — admin fills in / edits a sheet ─────────────────
router.put('/:id', adminOnly, canManage, attendanceController.updateSheet);

// ─── DELETE /api/attendance/:id — IFOA admin removes a sheet ─────────────────
router.delete('/:id', adminOnly, canManage, attendanceController.deleteSheet);

module.exports = router;
