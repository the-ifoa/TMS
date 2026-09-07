'use strict';
const express = require('express');
const router = express.Router();
const { certAuth } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const certificatesController = require('../controllers/certificatesController');

// certAuth = authMiddleware, but also accepts the JWT via ?token= so a PDF can
// be opened directly in a browser tab where custom headers aren't possible.
router.use(certAuth, loadScope);

const canGenerate = requirePermission('certificates.generate');

// =============================================================================
//  ADMIN ENDPOINTS
// =============================================================================

// -- GET /generate/:id --------------------------------------------------------
router.get('/generate/:id', canGenerate, certificatesController.generateGet);

// -- POST /generate/:id -------------------------------------------------------
router.post('/generate/:id', canGenerate, certificatesController.generatePost);

// -- POST /dhl-generate/:id ----------------------------------------------------
router.post('/dhl-generate/:id', canGenerate, certificatesController.dhlGenerate);

// -- GET /dhl-preview/:id ------------------------------------------------------
router.get('/dhl-preview/:id', certificatesController.dhlPreview);

// -- GET /dhl-download/:id -----------------------------------------------------
router.get('/dhl-download/:id', certificatesController.dhlDownload);

// -- DELETE /revoke/:id -------------------------------------------------------
router.delete('/revoke/:id', canGenerate, certificatesController.revoke);

// -- GET /preview/:id ---------------------------------------------------------
router.get('/preview/:id', certificatesController.preview);

// -- GET /download/:id --------------------------------------------------------
router.get('/download/:id', certificatesController.download);

// -- GET /modules -------------------------------------------------------------
router.get('/modules', certificatesController.listModules);

// -- GET /counters -------------------------------------------------------------
router.get('/counters', certificatesController.getCounters);

// -- POST /counters/reset -----------------------------------------------------
router.post('/counters/reset', certificatesController.resetCounters);

module.exports = router;
