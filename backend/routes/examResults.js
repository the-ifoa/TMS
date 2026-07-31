const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { authMiddleware } = require('../middleware/auth');
const examResultsController = require('../controllers/examResultsController');

// All routes require authentication
router.use(authMiddleware);

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
router.get('/', examResultsController.listResults);

// ── GET batch summary list ────────────────────────────────────────────────────
router.get('/batches', examResultsController.listBatches);

// ── POST parse Excel preview (no DB write) ────────────────────────────────────
router.post('/parse-excel', upload.single('file'), examResultsController.parseExcel);

// ── POST import Excel → DB ────────────────────────────────────────────────────
router.post('/import-excel', upload.single('file'), examResultsController.importExcel);

// ── GET single exam result ────────────────────────────────────────────────────
router.get('/:id', examResultsController.getResult);

// ── GET result sheet PDF (only if sheet has been issued by admin) ─────────────
router.get('/:id/pdf', examResultsController.getResultPdf);

// ── POST create exam result ───────────────────────────────────────────────────
router.post('/', examResultsController.createResult);

// ── POST bulk create ──────────────────────────────────────────────────────────
router.post('/bulk', examResultsController.bulkCreate);

// ── PUT update exam result ────────────────────────────────────────────────────
router.put('/:id', examResultsController.updateResult);

// ── PATCH mark sheet as issued ────────────────────────────────────────────────
router.patch('/:id/issue-sheet', examResultsController.issueSheet);

// ── DELETE exam result ────────────────────────────────────────────────────────
router.delete('/:id', examResultsController.deleteResult);

module.exports = router;
