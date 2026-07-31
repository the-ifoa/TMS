const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const participantsController = require('../controllers/participantsController');

// All participant routes require a valid token
router.use(authMiddleware);

// ─── GET all participants ─────────────────────────────────────────────────────
router.get('/', participantsController.listParticipants);

// ─── GET all airlines with their participants (admin only) ────────────────────
// Defined BEFORE `GET /:id` so the literal path isn't captured as an :id.
router.get('/by-airline', participantsController.listByAirline);

// ─── GET all airline names (admin only) ──────────────────────────────────────
router.get('/airlines', participantsController.listAirlineNames);

// ─── GET single participant ───────────────────────────────────────────────────
router.get('/:id', participantsController.getParticipant);

// ─── CREATE participant ───────────────────────────────────────────────────────
router.post('/', participantsController.createParticipant);

// ─── BULK CREATE participants ─────────────────────────────────────────────────
router.post('/bulk', participantsController.bulkCreateParticipants);

// ─── SEND SUBMISSION CONFIRMATION EMAIL (airline only) ───────────────────────
router.post('/send-confirmation', participantsController.sendConfirmation);

// ─── PATCH participant email — airline (owner) or admin ──────────────────────
router.patch('/:id/email', participantsController.updateEmail);

// ─── UPDATE participant (admin only) ─────────────────────────────────────────
router.put('/:id', participantsController.updateParticipant);

// ─── PATCH ndg_score (admin only) ────────────────────────────────────────────
router.patch('/:id/ndg-score', participantsController.updateNdgScore);

// ─── PATCH fdr_hours (admin only) ────────────────────────────────────────────
router.patch('/:id/fdr-hours', participantsController.updateFdrHours);

// ─── PATCH cert_sequence only (admin only) ───────────────────────────────────
router.patch('/:id/cert-sequence', participantsController.updateCertSequence);

// ─── DELETE all participants for an airline (admin only) ──────────────────────
// Both airline-scoped deletes are defined BEFORE `DELETE /:id` so their literal
// prefixes aren't captured as an :id.
router.delete('/airline/:airlineName', participantsController.deleteByAirlineName);

// ─── DELETE airline account + all their participants by airline _id (admin only) ──────
router.delete('/airline-by-id/:airlineId', participantsController.deleteByAirlineId);

// ─── DELETE single participant (admin only) ───────────────────────────────────
router.delete('/:id', participantsController.deleteParticipant);

// ─── PATCH /:id/validity (admin only) ───────────────────────────────────────
router.patch('/:id/validity', participantsController.updateValidity);

// ─── PATCH /:id/revoke-cert (admin only) ─────────────────────────────────────
router.patch('/:id/revoke-cert', participantsController.revokeCert);

// ─── PATCH /:id/revoke-dhl-cert (admin only) ─────────────────────────────────
router.patch('/:id/revoke-dhl-cert', participantsController.revokeDhlCert);

// ─── PATCH /:id/full-cert-id (admin only) ────────────────────────────────────
router.patch('/:id/full-cert-id', participantsController.updateFullCertId);

module.exports = router;
