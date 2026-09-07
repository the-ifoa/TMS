const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const attendanceController = require('../controllers/attendanceController');

router.use(authMiddleware, loadScope);

const canView   = requirePermission('attendance.view');
const canManage = requirePermission('attendance.manage');

// ─── GET /api/attendance — list sheets ───────────────────────────────────────
router.get('/', canView, attendanceController.listSheets);

// ─── GET /api/attendance/:id ──────────────────────────────────────────────────
router.get('/:id', canView, attendanceController.getSheet);

// ─── POST /api/attendance/bulk — ensure one sheet per training batch ─────────
router.post('/bulk', canManage, attendanceController.bulkEnsureSheets);

// ─── POST /api/attendance — create new sheet ──────────────────────────────────
router.post('/', canManage, attendanceController.createSheet);

// ─── PUT /api/attendance/:id — update existing sheet ─────────────────────────
router.put('/:id', canManage, attendanceController.updateSheet);

module.exports = router;
