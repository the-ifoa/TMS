'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const contractsController = require('../controllers/contractsController');

router.use(authMiddleware, adminOnly);

// ─── GET /api/contracts/defaults ─────────────────────────────────────────────
router.get('/defaults', contractsController.getDefaults);

// ─── GET /api/contracts/defaults/:airlineId ───────────────────────────────────
router.get('/defaults/:airlineId', contractsController.getDefaultsForAirline);

// ─── GET /api/contracts/airlines ─────────────────────────────────────────────
router.get('/airlines', contractsController.listAirlinesWithContractStatus);

// ─── GET /api/contracts ───────────────────────────────────────────────────────
router.get('/', contractsController.listContracts);

// ─── GET /api/contracts/pdf/:id ───────────────────────────────────────────────
router.get('/pdf/:id', contractsController.getContractPdf);

// ─── POST /api/contracts/preview ─────────────────────────────────────────────
router.post('/preview', contractsController.previewContract);

// ─── POST /api/contracts/send ────────────────────────────────────────────────
router.post('/send', contractsController.sendContract);

module.exports = router;
