const mongoose = require('mongoose');
const crypto = require('crypto');
const LiveSession = require('../models/LiveSession');
const LivePlayer = require('../models/LivePlayer');

// ─── Live quiz engine ─────────────────────────────────────────────────────────
// The server is the only clock and the only judge: clients show countdowns
// from `question_starts_at` / `question_ends_at` (corrected by `server_now`),
// and every answer is timed and scored here.

const GET_READY_MS = 4000;    // "Get ready…" between the host moving on and answers opening
const LATE_GRACE_MS = 600;    // network slack after the timer hits zero
const BASE_POINTS = 1000;
const STREAK_STEP = 100;      // bonus per extra correct answer in a row…
const STREAK_CAP = 500;       // …up to this
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // an unfinished session can't be joined after 12h

const MULTIPLIER = { standard: 1, double: 2, none: 0 };

const randomPin = () => String(crypto.randomInt(100000, 1000000));
const randomCode = () => crypto.randomBytes(6).toString('base64url'); // 8 chars
const newToken = () => crypto.randomBytes(24).toString('hex');

// A 6-digit PIN no open session is using.
async function uniquePin() {
  for (let i = 0; i < 20; i += 1) {
    const pin = randomPin();
    // eslint-disable-next-line no-await-in-loop
    const taken = await LiveSession.exists({ pin, status: { $ne: 'finished' }, created_at: { $gt: new Date(Date.now() - SESSION_TTL_MS) } });
    if (!taken) return pin;
  }
  throw new Error('Could not allocate a game PIN. Please try again.');
}

// Indexes of the correct options (empty for a poll).
const correctSet = (q) => (q.type === 'poll' ? [] : (q.options || []).map((o, i) => (o.is_correct ? i : -1)).filter((i) => i >= 0));

// Is this pick right? Polls are neither right nor wrong (null).
function isCorrect(q, choices) {
  if (q.type === 'poll') return null;
  const want = correctSet(q);
  const got = [...new Set(choices)].sort((a, b) => a - b);
  if (q.type === 'multi') return got.length === want.length && got.every((c, i) => c === want[i]);
  return got.length === 1 && want.includes(got[0]);
}

// Kahoot-style: a right answer is worth 1000 at once, falling to 500 at the
// buzzer; double-points questions ×2; a streak adds 100 per extra right answer.
function pointsFor(q, correct, timeMs, streakAfter) {
  const mult = MULTIPLIER[q.points] ?? 1;
  if (!correct || !mult) return 0;
  const limitMs = (q.time_limit || 20) * 1000;
  const speed = 1 - Math.min(1, Math.max(0, timeMs / limitMs)) / 2;
  const base = Math.round(BASE_POINTS * speed) * mult;
  const bonus = streakAfter >= 2 ? Math.min(STREAK_CAP, STREAK_STEP * (streakAfter - 1)) : 0;
  return base + bonus;
}

// Moves a question that ran out of time on to "reveal". Safe to call from any
// request; only one wins the conditional update.
async function settle(session) {
  if (session.status === 'question' && session.question_ends_at && Date.now() > new Date(session.question_ends_at).getTime() + LATE_GRACE_MS) {
    const updated = await LiveSession.findOneAndUpdate(
      { _id: session._id, status: 'question', current_index: session.current_index },
      { $set: { status: 'reveal' } },
      { new: true },
    ).lean();
    return updated || LiveSession.findById(session._id).lean();
  }
  return session;
}

// Ends the current question early once every active player has answered.
async function endIfAllAnswered(session) {
  const idx = session.current_index;
  const [active, answered] = await Promise.all([
    LivePlayer.countDocuments({ session_id: session._id, kicked: false }),
    LivePlayer.countDocuments({ session_id: session._id, kicked: false, 'answers.index': idx }),
  ]);
  if (active > 0 && answered >= active) {
    await LiveSession.updateOne({ _id: session._id, status: 'question', current_index: idx }, { $set: { status: 'reveal' } });
  }
}

// ── Host actions ──────────────────────────────────────────────────────────────
async function openQuestion(session, index) {
  const q = session.questions[index];
  const starts = new Date(Date.now() + GET_READY_MS);
  const ends = new Date(starts.getTime() + (q.time_limit || 20) * 1000);
  await LivePlayer.updateMany({ session_id: session._id }, { $set: { last_points: 0 } });
  return LiveSession.findOneAndUpdate(
    { _id: session._id, current_index: session.current_index },
    { $set: { status: 'question', current_index: index, question_starts_at: starts, question_ends_at: ends } },
    { new: true },
  ).lean();
}

async function hostAction(session, action, body = {}) {
  const total = session.questions.length;
  const id = session._id;
  switch (action) {
    case 'start':
      if (session.status !== 'lobby') throw httpError(400, 'The game has already started.');
      if (!total) throw httpError(400, 'This game has no questions.');
      if (!(await LivePlayer.exists({ session_id: id, kicked: false }))) throw httpError(400, 'Wait for at least one player to join.');
      return openQuestion(session, 0);
    case 'reveal': // end the question now
      if (session.status !== 'question') throw httpError(400, 'No question is running.');
      return LiveSession.findOneAndUpdate({ _id: id, status: 'question' }, { $set: { status: 'reveal', question_ends_at: new Date() } }, { new: true }).lean();
    case 'leaderboard':
      if (session.status !== 'reveal') throw httpError(400, 'Show the answer first.');
      return LiveSession.findOneAndUpdate({ _id: id, status: 'reveal' }, { $set: { status: 'leaderboard' } }, { new: true }).lean();
    case 'next':
      if (!['reveal', 'leaderboard'].includes(session.status)) throw httpError(400, 'Finish this question first.');
      if (session.current_index + 1 >= total) {
        return LiveSession.findOneAndUpdate({ _id: id }, { $set: { status: 'finished', finished_at: new Date() } }, { new: true }).lean();
      }
      return openQuestion(session, session.current_index + 1);
    case 'finish':
      return LiveSession.findOneAndUpdate({ _id: id }, { $set: { status: 'finished', finished_at: new Date() } }, { new: true }).lean();
    case 'lock':
    case 'unlock':
      return LiveSession.findOneAndUpdate({ _id: id }, { $set: { locked: action === 'lock' } }, { new: true }).lean();
    case 'kick': {
      if (!mongoose.isValidObjectId(body.player_id)) throw httpError(400, 'Unknown player.');
      await LivePlayer.updateOne({ _id: body.player_id, session_id: id }, { $set: { kicked: true } });
      if (session.status === 'question') await endIfAllAnswered(session);
      return LiveSession.findById(id).lean();
    }
    default:
      throw httpError(400, 'Unknown action.');
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Answers ───────────────────────────────────────────────────────────────────
async function submitAnswer(session, player, index, rawChoices) {
  if (session.status !== 'question' || index !== session.current_index) throw httpError(409, 'This question is closed.');
  const now = Date.now();
  const startsAt = new Date(session.question_starts_at).getTime();
  const endsAt = new Date(session.question_ends_at).getTime();
  if (now < startsAt) throw httpError(409, 'Wait for the question to open.');
  if (now > endsAt + LATE_GRACE_MS) throw httpError(409, 'Time is up.');

  const q = session.questions[index];
  const max = (q.options || []).length;
  const choices = [...new Set((Array.isArray(rawChoices) ? rawChoices : [rawChoices]).map(Number))].filter((c) => Number.isInteger(c) && c >= 0 && c < max);
  if (!choices.length) throw httpError(400, 'Pick an answer.');
  if (q.type !== 'multi' && choices.length > 1) throw httpError(400, 'Pick one answer.');

  const timeMs = Math.max(0, Math.min(now - startsAt, (q.time_limit || 20) * 1000));
  const correct = isCorrect(q, choices);
  const scored = q.type !== 'poll';
  const streakAfter = !scored ? player.streak : correct ? player.streak + 1 : 0;
  const points = pointsFor(q, correct, timeMs, streakAfter);

  // One answer per question: the filter refuses a second one atomically.
  const updated = await LivePlayer.findOneAndUpdate(
    { _id: player._id, kicked: false, 'answers.index': { $ne: index } },
    {
      $push: { answers: { index, choices, correct, points, time_ms: timeMs, at: new Date(now) } },
      $inc: { score: points, correct_count: correct ? 1 : 0, total_time_ms: scored ? timeMs : 0 },
      $set: { streak: streakAfter, last_points: points },
      $max: { best_streak: streakAfter },
    },
    { new: true },
  ).lean();
  if (!updated) throw httpError(409, 'You already answered this question.');
  await endIfAllAnswered(session);
  return updated;
}

// ── Views ─────────────────────────────────────────────────────────────────────
// Ranking: score, then the faster total answer time.
const RANK_SORT = { score: -1, total_time_ms: 1, joined_at: 1 };

async function rankOf(sessionId, p) {
  const ahead = await LivePlayer.countDocuments({
    session_id: sessionId, kicked: false,
    $or: [{ score: { $gt: p.score } }, { score: p.score, total_time_ms: { $lt: p.total_time_ms } }],
  });
  return ahead + 1;
}

// Final stats for one player.
function statsOf(p, questions) {
  const scoredTotal = questions.filter((q) => q.type !== 'poll').length;
  const scoredAnswers = (p.answers || []).filter((a) => a.correct !== null);
  return {
    score: p.score,
    correct: p.correct_count,
    out_of: scoredTotal,
    accuracy: scoredTotal ? Math.round((p.correct_count / scoredTotal) * 100) : null,
    avg_time_s: scoredAnswers.length ? Math.round((scoredAnswers.reduce((t, a) => t + a.time_ms, 0) / scoredAnswers.length) / 100) / 10 : null,
    best_streak: p.best_streak,
    answered: (p.answers || []).length,
  };
}

const publicQuestion = (q, index, total) => ({
  index, total, type: q.type, prompt: q.prompt, image_url: q.image_url || '',
  options: (q.options || []).map((o) => ({ text: o.text })), time_limit: q.time_limit, points: q.points,
  correct_count: q.type === 'multi' ? correctSet(q).length : undefined,
});

// Option counts for the current question.
async function distribution(session) {
  const idx = session.current_index;
  const q = session.questions[idx];
  const rows = await LivePlayer.aggregate([
    { $match: { session_id: session._id, kicked: false } },
    { $unwind: '$answers' },
    { $match: { 'answers.index': idx } },
    { $unwind: '$answers.choices' },
    { $group: { _id: '$answers.choices', n: { $sum: 1 } } },
  ]);
  const counts = (q?.options || []).map((_, i) => rows.find((r) => r._id === i)?.n || 0);
  return counts;
}

async function hostView(session) {
  const players = await LivePlayer.find({ session_id: session._id, kicked: false })
    .select('nickname avatar score correct_count best_streak total_time_ms last_points answers joined_at')
    .sort(RANK_SORT).lean();
  const idx = session.current_index;
  const q = idx >= 0 ? session.questions[idx] : null;
  const view = {
    id: String(session._id), game_id: String(session.game_id), title: session.title, cover: session.cover, pin: session.pin, code: session.code,
    status: session.status, locked: session.locked, current_index: idx, total: session.questions.length,
    question_starts_at: session.question_starts_at, question_ends_at: session.question_ends_at, server_now: new Date(),
    players: players.map((p) => ({
      id: String(p._id), nickname: p.nickname, avatar: p.avatar, score: p.score, last_points: p.last_points,
      answered: idx >= 0 && (p.answers || []).some((a) => a.index === idx),
    })),
    reactions: (session.reactions || []).slice(-20),
  };
  if (q) {
    view.question = { ...publicQuestion(q, idx, session.questions.length), correct: correctSet(q) };
    view.answered = view.players.filter((p) => p.answered).length;
    if (session.status !== 'question') view.distribution = await distribution(session);
  }
  if (session.status === 'finished') {
    view.results = players.map((p, i) => ({ rank: i + 1, id: String(p._id), nickname: p.nickname, avatar: p.avatar, ...statsOf(p, session.questions) }));
  }
  return view;
}

async function playerView(session, player) {
  const idx = session.current_index;
  const q = idx >= 0 ? session.questions[idx] : null;
  const mine = q ? (player.answers || []).find((a) => a.index === idx) : null;
  const view = {
    title: session.title, cover: session.cover, status: session.status, server_now: new Date(),
    current_index: idx, total: session.questions.length,
    question_starts_at: session.question_starts_at, question_ends_at: session.question_ends_at,
    me: { id: String(player._id), nickname: player.nickname, avatar: player.avatar, score: player.score, streak: player.streak, kicked: player.kicked },
    players_count: await LivePlayer.countDocuments({ session_id: session._id, kicked: false }),
  };
  if (q && session.status !== 'lobby') {
    view.question = publicQuestion(q, idx, session.questions.length);
    view.my_answer = mine ? { choices: mine.choices } : null;
    if (session.status !== 'question') {
      // Answer revealed: now the player may see what was right and how they did.
      view.question.correct = correctSet(q);
      view.my_answer = mine ? { choices: mine.choices, correct: mine.correct, points: mine.points, time_ms: mine.time_ms } : null;
      view.me.rank = await rankOf(session._id, player);
    }
  }
  if (session.status === 'leaderboard' || session.status === 'finished') {
    const top = await LivePlayer.find({ session_id: session._id, kicked: false })
      .select('nickname avatar score correct_count best_streak total_time_ms answers').sort(RANK_SORT).limit(session.status === 'finished' ? 3 : 5).lean();
    view.leaderboard = top.map((p, i) => ({ rank: i + 1, nickname: p.nickname, avatar: p.avatar, score: p.score, is_me: String(p._id) === String(player._id) }));
    view.me.rank = await rankOf(session._id, player);
  }
  if (session.status === 'finished') view.me.stats = statsOf(player, session.questions);
  return view;
}

module.exports = {
  GET_READY_MS, SESSION_TTL_MS, uniquePin, randomCode, newToken, settle, hostAction, submitAnswer,
  hostView, playerView, httpError, isCorrect, pointsFor, correctSet,
};
