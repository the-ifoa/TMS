const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const attendanceController = require('../controllers/attendanceController');

router.use(authMiddleware);

// ─── GET /api/attendance — list sheets ───────────────────────────────────────
router.get('/', attendanceController.listSheets);

// ─── GET /api/attendance/:id ──────────────────────────────────────────────────
router.get('/:id', attendanceController.getSheet);

// ─── POST /api/attendance/bulk — ensure one sheet per training batch ─────────
router.post('/bulk', attendanceController.bulkEnsureSheets);

// ─── POST /api/attendance — create new sheet ──────────────────────────────────
router.post('/', attendanceController.createSheet);

// ─── PUT /api/attendance/:id — update existing sheet ─────────────────────────
router.put('/:id', attendanceController.updateSheet);

module.exports = router;
