const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loadScope, requirePermission } = require('../middleware/permissions');
const live = require('../controllers/liveController');

// ─── Live quiz — IFOA admin side: build games and host them ───────────────────
router.use(authMiddleware, adminOnly, loadScope);

const canBuild = requirePermission('exams.author');
const canHost = requirePermission('exams.author', 'exams.assign');

router.get('/games', canHost, live.listGames);
router.post('/games', canBuild, live.createGame);
router.get('/games/:id', canHost, live.getGame);
router.put('/games/:id', canBuild, live.updateGame);
router.delete('/games/:id', canBuild, live.deleteGame);
router.get('/games/:id/sessions', canHost, live.listSessions);
router.post('/games/:id/sessions', canHost, live.startSession);
router.get('/exam-questions/:examId', canBuild, live.examQuestions);
router.post('/from-exam/:examId', canBuild, live.gameFromExam);
router.post('/games/:id/to-exam', canBuild, live.examFromGame);

router.get('/sessions/:sessionId', canHost, live.hostState);
router.post('/sessions/:sessionId/action', canHost, live.hostActionHandler);
router.delete('/sessions/:sessionId', canHost, live.deleteSession);

module.exports = router;
