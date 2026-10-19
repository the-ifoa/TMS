const express = require('express');
const router = express.Router();
const live = require('../controllers/liveController');

// ─── Live quiz — public player endpoints (no login) ───────────────────────────
// A player joins with the game PIN or link and gets a secret token, sent back
// as the X-Player-Token header. Correct answers never leave the server before
// the host reveals them.
router.get('/pin/:pin', live.resolvePin);
router.get('/:code', live.publicInfo);
router.post('/:code/join', live.join);
router.get('/:code/state', live.playerState);
router.post('/:code/answer', live.answer);
router.post('/:code/react', live.react);

module.exports = router;
