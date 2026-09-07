const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const participantsController = require('../controllers/participantsController');

// All participant routes require a valid token + a resolved permission scope.
// Top-level admin / top-level airline pass every requirePermission() implicitly;
// only sub-admins and airline departments are actually gated.
router.use(authMiddleware, loadScope);

const canView    = requirePermission('participants.view');
const canCreate  = requirePermission('participants.create');
const canEdit    = requirePermission('participants.edit');
const canDelete  = requirePermission('participants.delete');
const canSeeAirlines    = requirePermission('airlines.view', 'participants.view');
const canManageAirlines  = requirePermission('airlines.manage');

// ─── GET all participants ─────────────────────────────────────────────────────
router.get('/', canView, participantsController.listParticipants);

// ─── GET all airlines with their participants (admin only) ────────────────────
// Defined BEFORE `GET /:id` so the literal path isn't captured as an :id.
router.get('/by-airline', canSeeAirlines, participantsController.listByAirline);

// ─── GET all airline names (admin only) ──────────────────────────────────────
router.get('/airlines', canView, participantsController.listAirlineNames);

// ─── GET single participant ───────────────────────────────────────────────────
router.get('/:id', canView, participantsController.getParticipant);

// ─── CREATE participant ───────────────────────────────────────────────────────
router.post('/', canCreate, participantsController.createParticipant);

// ─── BULK CREATE participants ─────────────────────────────────────────────────
router.post('/bulk', canCreate, participantsController.bulkCreateParticipants);

// ─── SEND SUBMISSION CONFIRMATION EMAIL (airline only) ───────────────────────
router.post('/send-confirmation', participantsController.sendConfirmation);

// ─── PATCH participant email — airline (owner) or admin ──────────────────────
router.patch('/:id/email', canEdit, participantsController.updateEmail);

// ─── PATCH participant scope — move between main airline list & a department ──
router.patch('/:id/scope', canEdit, participantsController.updateParticipantScope);

// ─── UPDATE participant (admin only) ─────────────────────────────────────────
router.put('/:id', canEdit, participantsController.updateParticipant);

// ─── PATCH ndg_score (admin only) ────────────────────────────────────────────
router.patch('/:id/ndg-score', canEdit, participantsController.updateNdgScore);

// ─── PATCH fdr_hours (admin only) ────────────────────────────────────────────
router.patch('/:id/fdr-hours', canEdit, participantsController.updateFdrHours);

// ─── PATCH cert_sequence only (admin only) ───────────────────────────────────
router.patch('/:id/cert-sequence', canEdit, participantsController.updateCertSequence);

// ─── DELETE all participants for an airline (admin only) ──────────────────────
// Both airline-scoped deletes are defined BEFORE `DELETE /:id` so their literal
// prefixes aren't captured as an :id.
router.delete('/airline/:airlineName', canManageAirlines, participantsController.deleteByAirlineName);

// ─── DELETE airline account + all their participants by airline _id (admin only) ──────
router.delete('/airline-by-id/:airlineId', canManageAirlines, participantsController.deleteByAirlineId);

// ─── DELETE the airline account itself (login included) + any submissions (admin only) ──
router.delete('/airline-account/:airlineId', canManageAirlines, participantsController.deleteAirlineAccount);

// ─── DELETE single participant (admin only) ───────────────────────────────────
router.delete('/:id', canDelete, participantsController.deleteParticipant);

// ─── PATCH /:id/validity (admin only) ───────────────────────────────────────
router.patch('/:id/validity', canEdit, participantsController.updateValidity);

// ─── PATCH /:id/revoke-cert (admin only) ─────────────────────────────────────
router.patch('/:id/revoke-cert', canEdit, participantsController.revokeCert);

// ─── PATCH /:id/revoke-dhl-cert (admin only) ─────────────────────────────────
router.patch('/:id/revoke-dhl-cert', canEdit, participantsController.revokeDhlCert);

// ─── PATCH /:id/full-cert-id (admin only) ────────────────────────────────────
router.patch('/:id/full-cert-id', canEdit, participantsController.updateFullCertId);

module.exports = router;
