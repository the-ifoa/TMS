const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const controller = require('../controllers/internalCertificatesController');

// Airline-owned internal certificate PDFs (Cloudflare R2). Reading follows
// participant visibility; uploading/deleting needs internalCerts.manage, which
// is only live when an admin enabled it for the airline.
router.use(authMiddleware, loadScope);

const canRead  = requirePermission('internalCerts.manage', 'participants.view');
const canWrite = requirePermission('internalCerts.manage');

// Kept in memory, then pushed to R2 — never touches local disk.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed.'), false);
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  pdfUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10 MB or smaller.' : err.message;
    res.status(400).json({ error: msg });
  });
}

router.get('/', canRead, controller.listAll);
router.get('/participant/:participantId', canRead, controller.listForParticipant);
router.post('/participant/:participantId', canWrite, handleUpload, controller.upload);
router.get('/:id/file', canRead, controller.download);
router.delete('/:id', canWrite, controller.remove);

module.exports = router;
