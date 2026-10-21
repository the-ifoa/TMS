const crypto = require('crypto');
const mongoose = require('mongoose');
const LiveGame = require('../models/LiveGame');
const LiveSession = require('../models/LiveSession');
const LivePlayer = require('../models/LivePlayer');
const Exam = require('../models/Exam');
const live = require('../services/liveQuiz');
const { deleteImagesIfUnused } = require('../services/upload');

// ─── Live quiz — admin (build + host) and public (play) ───────────────────────

const fail = (res, err, where) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`${where} error:`, err.message);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const validId = (id) => mongoose.isValidObjectId(id);

// Cleans a game payload from the editor. Returns { game } or { error }.
// A question picture: only a web (http/https) address is kept, with its
// storage id when the image was uploaded here.
const cleanImage = (q) => {
  const url = typeof q.image_url === 'string' && /^https?:\/\//i.test(q.image_url.trim()) ? q.image_url.trim().slice(0, 1000) : '';
  return { image_url: url, image_public_id: url && typeof q.image_public_id === 'string' ? q.image_public_id.slice(0, 200) : '' };
};
const imageIds = (questions) => (questions || []).map((q) => q.image_public_id).filter(Boolean);
// An exam question's picture: the legacy single image, else the first gallery image.
function examImage(q) {
  if (q.image_url) return q;
  const img = (q.images || []).find((i) => i && i.url);
  return img ? { image_url: img.url, image_public_id: img.public_id } : {};
}

// Exam question types a live game can play, and back.
const EXAM_TO_LIVE = { mcq: 'quiz', select_list: 'quiz', true_false: 'true_false', multi_response: 'multi' };
const LIVE_TO_EXAM = { quiz: 'mcq', true_false: 'true_false', multi: 'multi_response' };

// Exam questions that fit a live game (choice / true-false, 2–6 answers).
function liveQuestionsFromExam(exam) {
  return (exam.questions || [])
    .filter((q) => EXAM_TO_LIVE[q.type] && (q.options || []).length >= 2 && (q.options || []).length <= 6 && String(q.prompt || '').trim())
    .map((q) => ({
      type: EXAM_TO_LIVE[q.type], prompt: String(q.prompt).slice(0, 300), time_limit: 20, points: 'standard',
      ...cleanImage(examImage(q)),
      options: q.options.map((o) => ({ text: String(o.text || '').slice(0, 120), is_correct: !!o.is_correct })),
    }));
}

function cleanGame(body) {
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) return { error: 'Give the game a title.' };
  const raw = Array.isArray(body.questions) ? body.questions : [];
  if (raw.length > 100) return { error: 'A game can have at most 100 questions.' };
  const questions = [];
  for (let i = 0; i < raw.length; i += 1) {
    const q = raw[i] || {};
    const n = i + 1;
    const type = ['quiz', 'true_false', 'multi', 'poll'].includes(q.type) ? q.type : 'quiz';
    const prompt = String(q.prompt || '').trim().slice(0, 300);
    if (!prompt) return { error: `Question ${n}: type the question.` };
    let options = (Array.isArray(q.options) ? q.options : []).map((o) => ({ text: String(o?.text || '').trim().slice(0, 120), is_correct: !!o?.is_correct }));
    if (type === 'true_false') options = [{ text: 'True', is_correct: !!options[0]?.is_correct }, { text: 'False', is_correct: !!options[1]?.is_correct }];
    if (options.length < 2 || options.length > 6) return { error: `Question ${n}: needs 2 to 6 answers.` };
    if (options.some((o) => !o.text)) return { error: `Question ${n}: fill in or remove the empty answer.` };
    const right = options.filter((o) => o.is_correct).length;
    if (type === 'poll') options = options.map((o) => ({ ...o, is_correct: false }));
    else if (type === 'multi' && right < 1) return { error: `Question ${n}: mark at least one correct answer.` };
    else if (type !== 'multi' && right !== 1) return { error: `Question ${n}: mark exactly one correct answer.` };
    const time = Math.round(Number(q.time_limit) || 20);
    questions.push({
      ...(q._id && validId(q._id) ? { _id: q._id } : {}),
      type, prompt, options,
      ...cleanImage(q),
      time_limit: Math.min(240, Math.max(5, time)),
      points: type === 'poll' ? 'none' : (['standard', 'double', 'none'].includes(q.points) ? q.points : 'standard'),
    });
  }
  return {
    game: {
      title,
      description: String(body.description || '').trim().slice(0, 500),
      cover: String(body.cover || 'plane').slice(0, 16),
      shuffle_options: !!body.shuffle_options,
      questions,
    },
  };
}

// ── Games ─────────────────────────────────────────────────────────────────────
exports.listGames = async (req, res) => {
  try {
    const games = await LiveGame.find({ deleted_at: null }).select('-questions.options').sort({ updated_at: -1 }).lean();
    const ids = games.map((g) => g._id);
    // A game nobody joined doesn't count as a play.
    const stats = await LiveSession.aggregate([
      { $match: { game_id: { $in: ids } } },
      { $lookup: { from: LivePlayer.collection.name, let: { sid: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$session_id', '$$sid'] }, kicked: false } }, { $limit: 1 }, { $project: { _id: 1 } }], as: 'anyone' } },
      { $match: { 'anyone.0': { $exists: true } } },
      { $group: { _id: '$game_id', plays: { $sum: 1 }, last: { $max: '$created_at' } } },
    ]);
    const byId = Object.fromEntries(stats.map((s) => [String(s._id), s]));
    res.json(games.map((g) => ({
      id: String(g._id), title: g.title, description: g.description, cover: g.cover,
      question_count: (g.questions || []).length, updated_at: g.updated_at,
      total_seconds: (g.questions || []).reduce((t, q) => t + (q.time_limit || 20), 0),
      plays: byId[String(g._id)]?.plays || 0, last_played: byId[String(g._id)]?.last || null,
    })));
  } catch (err) { fail(res, err, 'GET /live/games'); }
};

exports.getGame = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await LiveGame.findOne({ _id: req.params.id, deleted_at: null });
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    res.json(game.toJSON());
  } catch (err) { fail(res, err, 'GET /live/games/:id'); }
};

exports.createGame = async (req, res) => {
  try {
    const { game, error } = cleanGame(req.body);
    if (error) return res.status(400).json({ error });
    const doc = await LiveGame.create({ ...game, created_by: req.admin.id });
    res.status(201).json(doc.toJSON());
  } catch (err) { fail(res, err, 'POST /live/games'); }
};

exports.updateGame = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const { game, error } = cleanGame(req.body);
    if (error) return res.status(400).json({ error });
    const before = await LiveGame.findOneAndUpdate({ _id: req.params.id, deleted_at: null }, { $set: game }, { runValidators: true }).lean();
    if (!before) return res.status(404).json({ error: 'Game not found.' });
    // Pictures this save dropped are deleted unless something else still uses them.
    const kept = new Set(imageIds(game.questions));
    const dropped = imageIds(before.questions).filter((id) => !kept.has(id));
    if (dropped.length) deleteImagesIfUnused(dropped).catch((e) => console.error('Live image cleanup failed:', e.message));
    const doc = await LiveGame.findById(req.params.id);
    res.json(doc.toJSON());
  } catch (err) { fail(res, err, 'PUT /live/games/:id'); }
};

// Soft delete: past sessions and their results stay readable.
exports.deleteGame = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const doc = await LiveGame.findOneAndUpdate({ _id: req.params.id, deleted_at: null }, { $set: { deleted_at: new Date() } });
    if (!doc) return res.status(404).json({ error: 'Game not found.' });
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'DELETE /live/games/:id'); }
};

// Questions from an exam that fit a live game (choice / true-false, 2–6 answers).
exports.examQuestions = async (req, res) => {
  try {
    if (!validId(req.params.examId)) return res.status(404).json({ error: 'Exam not found.' });
    const exam = await Exam.findById(req.params.examId).select('title questions owner_airline').lean();
    if (!exam || exam.owner_airline) return res.status(404).json({ error: 'Exam not found.' });
    const questions = liveQuestionsFromExam(exam);
    res.json({ title: exam.title, questions, skipped: (exam.questions || []).length - questions.length });
  } catch (err) { fail(res, err, 'GET /live/exam-questions'); }
};

// POST /live/from-exam/:examId — a new live game holding an IFOA exam's
// choice / true-false questions (20 s each). Opened in the editor afterwards.
exports.gameFromExam = async (req, res) => {
  try {
    if (!validId(req.params.examId)) return res.status(404).json({ error: 'Exam not found.' });
    const exam = await Exam.findById(req.params.examId).select('title description questions owner_airline deleted_at shuffle_options').lean();
    if (!exam || exam.owner_airline || exam.deleted_at) return res.status(404).json({ error: 'Exam not found.' });
    const questions = liveQuestionsFromExam(exam).slice(0, 100);
    if (!questions.length) return res.status(400).json({ error: 'This exam has no multiple-choice, true/false or multiple-response questions to play live.' });
    const doc = await LiveGame.create({
      title: String(exam.title || 'Quiz').slice(0, 120), description: String(exam.description || '').slice(0, 500),
      shuffle_options: !!exam.shuffle_options, questions, created_by: req.admin.id,
    });
    res.status(201).json({ id: String(doc._id), added: questions.length, skipped: (exam.questions || []).length - questions.length });
  } catch (err) { fail(res, err, 'POST /live/from-exam/:examId'); }
};

// POST /live/games/:id/to-exam — a draft IFOA exam built from a live game.
// Quiz → multiple choice, true/false → true/false, pick-all → multiple
// response; polls have no right answer and are left out. Double points become
// 2 marks. The exam still needs its airline, timing and pass mark in the builder.
exports.examFromGame = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await LiveGame.findOne({ _id: req.params.id, deleted_at: null }).lean();
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    const usable = (game.questions || []).filter((q) => LIVE_TO_EXAM[q.type]);
    if (!usable.length) return res.status(400).json({ error: 'This game has only polls. Polls have no right answer, so they cannot become exam questions.' });
    const questions = usable.map((q, i) => ({
      type: LIVE_TO_EXAM[q.type],
      prompt: q.prompt,
      points: q.points === 'double' ? 2 : 1,
      order: i,
      images: q.image_url ? [{ url: q.image_url, public_id: q.image_public_id || '' }] : [],
      options: (q.options || []).map((o) => ({ text: o.text, is_correct: !!o.is_correct })),
    }));
    const exam = await Exam.create({
      title: game.title,
      description: game.description || '',
      // Roughly a minute per question, at least 10 minutes.
      duration_minutes: Math.max(10, questions.length),
      shuffle_options: !!game.shuffle_options,
      questions,
      created_by: req.admin.id,
      owner_airline: null,
      status: 'draft',
    });
    res.status(201).json({ id: String(exam._id), added: questions.length, skipped: (game.questions || []).length - questions.length });
  } catch (err) { fail(res, err, 'POST /live/games/:id/to-exam'); }
};

// ── Hosting ───────────────────────────────────────────────────────────────────
exports.startSession = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const game = await LiveGame.findOne({ _id: req.params.id, deleted_at: null }).lean();
    if (!game) return res.status(404).json({ error: 'Game not found.' });
    if (!game.questions.length) return res.status(400).json({ error: 'Add at least one question before hosting.' });
    const session = await LiveSession.create({
      game_id: game._id, title: game.title, cover: game.cover, questions: game.questions, shuffle_options: !!game.shuffle_options,
      pin: await live.uniquePin(), code: live.randomCode(), host_id: req.admin.id,
    });
    res.status(201).json({ id: String(session._id), pin: session.pin, code: session.code });
  } catch (err) { fail(res, err, 'POST /live/games/:id/sessions'); }
};

async function loadHostSession(req, res) {
  if (!validId(req.params.sessionId)) { res.status(404).json({ error: 'Session not found.' }); return null; }
  const session = await LiveSession.findById(req.params.sessionId).lean();
  if (!session) { res.status(404).json({ error: 'Session not found.' }); return null; }
  return live.settle(session);
}

exports.hostState = async (req, res) => {
  try {
    const session = await loadHostSession(req, res);
    if (!session) return;
    res.json(await live.hostView(session));
  } catch (err) { fail(res, err, 'GET /live/sessions/:id'); }
};

exports.hostActionHandler = async (req, res) => {
  try {
    const session = await loadHostSession(req, res);
    if (!session) return;
    const next = await live.hostAction(session, String(req.body?.action || ''), req.body || {});
    res.json(await live.hostView(next || session));
  } catch (err) { fail(res, err, 'POST /live/sessions/:id/action'); }
};

// finished → reached the podium. live → not finished and touched in the last
// 30 min (players can still be in it; the host can resume). unfinished → left
// mid-game: the host closed the screen without ending it.
const IDLE_MS = 30 * 60 * 1000;
function sessionState(s) {
  if (s.status === 'finished') return 'finished';
  const last = new Date(s.updated_at || s.created_at).getTime();
  const fresh = Date.now() - last < IDLE_MS && Date.now() - new Date(s.created_at).getTime() < live.SESSION_TTL_MS;
  return fresh ? 'live' : 'unfinished';
}

exports.listSessions = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Game not found.' });
    const sessions = await LiveSession.find({ game_id: req.params.id }).select('pin status created_at updated_at finished_at questions').sort({ created_at: -1 }).limit(50).lean();
    const counts = await LivePlayer.aggregate([
      { $match: { session_id: { $in: sessions.map((s) => s._id) }, kicked: false } },
      { $sort: { score: -1, total_time_ms: 1 } },
      { $group: { _id: '$session_id', players: { $sum: 1 }, winner: { $first: { nickname: '$nickname', avatar: '$avatar', score: '$score' } } } },
    ]);
    const byId = Object.fromEntries(counts.map((c) => [String(c._id), c]));
    const rows = sessions.map((s) => ({
      id: String(s._id), pin: s.pin, status: s.status, state: sessionState(s), created_at: s.created_at, finished_at: s.finished_at,
      questions: (s.questions || []).length, players: byId[String(s._id)]?.players || 0, winner: byId[String(s._id)]?.winner || null,
    }));
    // Games that ended (or were abandoned) with nobody in them are left out; an
    // empty lobby that is still open stays, so the host can go back to it.
    res.json(rows.filter((r) => r.players > 0 || r.state === 'live'));
  } catch (err) { fail(res, err, 'GET /live/games/:id/sessions'); }
};

// DELETE /live/sessions/:sessionId — removes one past game and its players.
// A game still running ends for everyone (their next poll finds nothing).
exports.deleteSession = async (req, res) => {
  try {
    if (!validId(req.params.sessionId)) return res.status(404).json({ error: 'Game session not found.' });
    const session = await LiveSession.findByIdAndDelete(req.params.sessionId).select('_id').lean();
    if (!session) return res.status(404).json({ error: 'Game session not found.' });
    await LivePlayer.deleteMany({ session_id: session._id });
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'DELETE /live/sessions/:sessionId'); }
};

// ── Public (players) ──────────────────────────────────────────────────────────
// Tiny per-IP limiter for joins and PIN lookups (stops PIN guessing / spam).
const hits = new Map();
// Behind Render's proxy req.ip is the proxy, so key on the client address it forwards.
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
function limited(req, key, max, windowMs) {
  const k = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const rec = hits.get(k) || { n: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
  rec.n += 1;
  hits.set(k, rec);
  if (hits.size > 20000) hits.clear();
  return rec.n > max;
}

const openSessionFilter = () => ({ status: { $ne: 'finished' }, created_at: { $gt: new Date(Date.now() - live.SESSION_TTL_MS) } });

exports.resolvePin = async (req, res) => {
  try {
    if (limited(req, 'pin', 120, 60_000)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
    const pin = String(req.params.pin || '').replace(/\D/g, '');
    const session = await LiveSession.findOne({ pin, ...openSessionFilter() }).select('code').lean();
    if (!session) return res.status(404).json({ error: 'No game with that PIN is running.' });
    res.json({ code: session.code });
  } catch (err) { fail(res, err, 'GET /public-live/pin/:pin'); }
};

async function loadPublicSession(req, res) {
  const session = await LiveSession.findOne({ code: String(req.params.code || '') }).lean();
  if (!session) { res.status(404).json({ error: 'This game link is not valid.' }); return null; }
  return live.settle(session);
}

async function loadPlayer(req, res, session) {
  const token = String(req.headers['x-player-token'] || req.query.t || req.body?.t || '');
  const player = token ? await LivePlayer.findOne({ session_id: session._id, token }).lean() : null;
  if (!player) { res.status(401).json({ error: 'Join the game first.', rejoin: true }); return null; }
  return player;
}

exports.publicInfo = async (req, res) => {
  try {
    const session = await loadPublicSession(req, res);
    if (!session) return;
    const players = await LivePlayer.find({ session_id: session._id, kicked: false }).select('nickname avatar team').sort({ joined_at: 1 }).limit(500).lean();
    const teams = (session.teams || []).map((t) => ({ key: t.key, name: t.name, members: players.filter((p) => p.team === t.key).length }));
    res.json({
      title: session.title, cover: session.cover, status: session.status, locked: session.locked,
      teams, team_pick: session.team_pick || 'player',
      expired: Date.now() - new Date(session.created_at).getTime() > live.SESSION_TTL_MS,
      players: players.slice(0, 60).map((p) => ({ nickname: p.nickname, avatar: p.avatar })),
      players_count: players.length,
    });
  } catch (err) { fail(res, err, 'GET /public-live/:code'); }
};

// Avatar keys players can pick (frontend liveUi AVATAR_ICONS). Anything else
// falls back to the plane, so no free text ever reaches the projector.
const AVATARS = new Set(['plane', 'rocket', 'heli', 'astro', 'robot', 'dragon', 'cat', 'dog', 'fish', 'kiwi', 'hippo', 'frog', 'otter', 'horse',
  'crow', 'dove', 'feather', 'ghost', 'gem', 'crown', 'star', 'mountain', 'anchor', 'paw', 'snow', 'leaf', 'sun', 'bolt']);

exports.join = async (req, res) => {
  try {
    if (limited(req, 'join', 150, 60_000)) return res.status(429).json({ error: 'Too many tries. Wait a minute and try again.' });
    const session = await loadPublicSession(req, res);
    if (!session) return;
    if (session.status === 'finished' || Date.now() - new Date(session.created_at).getTime() > live.SESSION_TTL_MS) return res.status(410).json({ error: 'This game has ended.' });
    if (session.locked) return res.status(403).json({ error: 'The host has locked this game. No new players can join.' });
    const nickname = String(req.body?.nickname || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (nickname.length < 2) return res.status(400).json({ error: 'Pick a nickname (at least 2 characters).' });
    const avatar = AVATARS.has(String(req.body?.avatar)) ? String(req.body.avatar) : 'plane';
    if (await LivePlayer.countDocuments({ session_id: session._id }) >= 500) return res.status(403).json({ error: 'This game is full.' });
    try {
      const team = await live.teamForJoin(session, String(req.body?.team || ''));
      const player = await LivePlayer.create({
        session_id: session._id, nickname, nickname_key: nickname.toLowerCase(), avatar, team, token: live.newToken(),
      });
      res.status(201).json({ token: player.token, player: { id: String(player._id), nickname, avatar, team } });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'That nickname is taken in this game. Try another one.' });
      throw err;
    }
  } catch (err) { fail(res, err, 'POST /public-live/:code/join'); }
};

exports.playerState = async (req, res) => {
  try {
    const session = await loadPublicSession(req, res);
    if (!session) return;
    const player = await loadPlayer(req, res, session);
    if (!player) return;
    // `version` stamps what the phone shows. When it sends back the stamp it
    // already has (?v=) and nothing changed, reply with a tiny "unchanged"
    // instead of the whole view. server_now is left out so the clock alone
    // never counts as a change.
    const { server_now: serverNow, ...view } = await live.playerView(session, player);
    const version = crypto.createHash('sha1').update(JSON.stringify(view)).digest('base64url').slice(0, 16);
    if (req.query.v && req.query.v === version) return res.json({ unchanged: true, version, server_now: serverNow });
    res.json({ ...view, server_now: serverNow, version });
  } catch (err) { fail(res, err, 'GET /public-live/:code/state'); }
};

exports.answer = async (req, res) => {
  try {
    const session = await loadPublicSession(req, res);
    if (!session) return;
    const player = await loadPlayer(req, res, session);
    if (!player) return;
    if (player.kicked) return res.status(403).json({ error: 'The host removed you from this game.' });
    await live.submitAnswer(session, player, Number(req.body?.index), req.body?.choices);
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'POST /public-live/:code/answer'); }
};

// POST /public-live/:code/team { team } — a player switches team in the lobby
// (only when the host lets players choose).
exports.chooseTeam = async (req, res) => {
  try {
    const session = await loadPublicSession(req, res);
    if (!session) return;
    const player = await loadPlayer(req, res, session);
    if (!player) return;
    const keys = (session.teams || []).map((t) => t.key);
    if (session.status !== 'lobby') return res.status(409).json({ error: 'The game has started. Teams are fixed now.' });
    if (session.team_pick !== 'player') return res.status(403).json({ error: 'The host is choosing the teams.' });
    if (!keys.includes(String(req.body?.team))) return res.status(400).json({ error: 'Unknown team.' });
    await LivePlayer.updateOne({ _id: player._id }, { $set: { team: String(req.body.team) } });
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'POST /public-live/:code/team'); }
};

const STICKERS = new Set(['clap', 'fire', 'laugh', 'wow', 'heart', 'party', 'rocket', 'thumbs']); // icon keys (frontend liveUi REACTION_ICONS)
exports.react = async (req, res) => {
  try {
    if (limited(req, 'react', 600, 60_000)) return res.status(429).json({ error: 'Slow down a little!' });
    const session = await loadPublicSession(req, res);
    if (!session) return;
    const player = await loadPlayer(req, res, session);
    if (!player) return;
    const sticker = String(req.body?.sticker || '');
    if (!STICKERS.has(sticker)) return res.status(400).json({ error: 'Unknown sticker.' });
    await LiveSession.updateOne({ _id: session._id }, { $push: { reactions: { $each: [{ nickname: player.nickname, sticker, at: new Date() }], $slice: -30 } } });
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'POST /public-live/:code/react'); }
};
