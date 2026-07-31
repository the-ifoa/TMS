const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

router.use(authMiddleware);

// ─── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', notificationsController.listNotifications);

module.exports = router;
