const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const examResultsController = require('../controllers/examResultsController');

// All routes require authentication
router.use(authMiddleware, loadScope);

const canView   = requirePermission('examResults.view', 'examResults.manage');
const canManage = requirePermission('examResults.manage');

// Multer: memory storage for Excel uploads (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.match(/\.xlsx?$/)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx / .xls files are accepted.'));
    }
  },
});

// ── GET all exam results ──────────────────────────────────────────────────────
router.get('/', canView, examResultsController.listResults);

// ── GET batch summary list ────────────────────────────────────────────────────
router.get('/batches', canView, examResultsController.listBatches);

// ── POST parse Excel preview (no DB write) ────────────────────────────────────
router.post('/parse-excel', canManage, upload.single('file'), examResultsController.parseExcel);

// ── POST import Excel → DB ────────────────────────────────────────────────────
router.post('/import-excel', canManage, upload.single('file'), examResultsController.importExcel);

// ── GET single exam result ────────────────────────────────────────────────────
router.get('/:id', canView, examResultsController.getResult);

// ── GET result sheet PDF (only if sheet has been issued by admin) ─────────────
router.get('/:id/pdf', canView, examResultsController.getResultPdf);

// ── POST create exam result ───────────────────────────────────────────────────
router.post('/', canManage, examResultsController.createResult);

// ── POST bulk create ──────────────────────────────────────────────────────────
router.post('/bulk', canManage, examResultsController.bulkCreate);

// ── PUT update exam result ────────────────────────────────────────────────────
router.put('/:id', canManage, examResultsController.updateResult);

// ── PATCH mark sheet as issued ────────────────────────────────────────────────
router.patch('/:id/issue-sheet', canManage, examResultsController.issueSheet);

// ── DELETE exam result ────────────────────────────────────────────────────────
router.delete('/:id', canManage, examResultsController.deleteResult);

module.exports = router;
