const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { loadScope, requireTeamAccess } = require('../middleware/permissions');
const teamController = require('../controllers/teamController');

router.use(authMiddleware, loadScope, requireTeamAccess);

router.get('/catalog', teamController.catalog);
router.get('/airlines', teamController.airlines);
router.get('/members', teamController.list);
router.post('/members', teamController.create);
router.patch('/members/:id', teamController.update);
router.delete('/members/:id', teamController.remove);

// Assign specific participants to a department (so it only sees those records).
router.get('/members/:id/participants', teamController.listMemberParticipants);
router.patch('/members/:id/participants', teamController.updateMemberParticipants);

module.exports = router;
