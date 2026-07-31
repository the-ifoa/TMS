'use strict';
const express = require('express');
const router = express.Router();
const { certAuth } = require('../middleware/auth');
const certificatesController = require('../controllers/certificatesController');

// certAuth = authMiddleware, but also accepts the JWT via ?token= so a PDF can
// be opened directly in a browser tab where custom headers aren't possible.
router.use(certAuth);

// =============================================================================
//  ADMIN ENDPOINTS
// =============================================================================

// -- GET /generate/:id --------------------------------------------------------
router.get('/generate/:id', certificatesController.generateGet);

// -- POST /generate/:id -------------------------------------------------------
router.post('/generate/:id', certificatesController.generatePost);

// -- POST /dhl-generate/:id ----------------------------------------------------
router.post('/dhl-generate/:id', certificatesController.dhlGenerate);

// -- GET /dhl-preview/:id ------------------------------------------------------
router.get('/dhl-preview/:id', certificatesController.dhlPreview);

// -- GET /dhl-download/:id -----------------------------------------------------
router.get('/dhl-download/:id', certificatesController.dhlDownload);

// -- DELETE /revoke/:id -------------------------------------------------------
router.delete('/revoke/:id', certificatesController.revoke);

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
