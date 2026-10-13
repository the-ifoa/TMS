const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const controller = require('../controllers/internalAssessmentsController');

// An airline's own assessments + a certificate PDF per candidate (Cloudflare
// R2). Everything needs internalAssessments.manage, which is only live when an
// admin enabled it for the airline.
router.use(authMiddleware, loadScope, requirePermission('internalAssessments.manage'));

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

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/candidates', controller.addCandidates);
router.delete('/:id/candidates/:candidateId', controller.removeCandidate);
router.post('/:id/candidates/:candidateId/certificate', handleUpload, controller.uploadCertificate);
router.get('/:id/candidates/:candidateId/certificate', controller.downloadCertificate);
router.delete('/:id/candidates/:candidateId/certificate', controller.removeCertificate);

module.exports = router;
