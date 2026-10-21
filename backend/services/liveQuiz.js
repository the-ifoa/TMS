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
      { returnDocument: 'after' },
    ).lean();
    return updated || LiveSession.findById(session._id).lean();
  }
  return session;
}

// Ends the current question early once every active player has answered.
async function endIfAllAnswered(session) {
  const idx = session.current_index;
  if (captainMode(session)) {
    // Captain mode: done once every team with players has answered.
    const players = await LivePlayer.find({ session_id: session._id, kicked: false }).select('team answers.index').lean();
    const teams = new Set(players.map((p) => p.team).filter(Boolean));
    const done = new Set(players.filter((p) => (p.answers || []).some((a) => a.index === idx)).map((p) => p.team));
    if (teams.size > 0 && [...teams].every((t) => done.has(t))) {
      await LiveSession.updateOne({ _id: session._id, status: 'question', current_index: idx }, { $set: { status: 'reveal' } });
    }
    return;
  }
  const [active, answered] = await Promise.all([
    LivePlayer.countDocuments({ session_id: session._id, kicked: false }),
    LivePlayer.countDocuments({ session_id: session._id, kicked: false, 'answers.index': idx }),
  ]);
  if (active > 0 && answered >= active) {
    await LiveSession.updateOne({ _id: session._id, status: 'question', current_index: idx }, { $set: { status: 'reveal' } });
  }
}

// ── Teams ─────────────────────────────────────────────────────────────────────
// Up to six fixed team keys (the frontend colours them); the host may rename them.
const TEAM_KEYS = ['red', 'blue', 'green', 'amber', 'violet', 'pink'];
const TEAM_DEFAULT_NAMES = { red: 'Red', blue: 'Blue', green: 'Green', amber: 'Yellow', violet: 'Purple', pink: 'Pink' };
const teamKeys = (session) => (session.teams || []).map((t) => t.key);

// The team with the fewest (active) members — where the next player goes.
async function smallestTeam(session) {
  const keys = teamKeys(session);
  if (!keys.length) return '';
  const rows = await LivePlayer.aggregate([
    { $match: { session_id: session._id, kicked: false, team: { $in: keys } } },
    { $group: { _id: '$team', n: { $sum: 1 } } },
  ]);
  const count = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return keys.reduce((best, k) => ((count[k] || 0) < (count[best] || 0) ? k : best), keys[0]);
}

// The team a joining player ends up in: their pick when players choose,
// otherwise (or for an unknown pick) the smallest team.
async function teamForJoin(session, wanted) {
  const keys = teamKeys(session);
  if (!keys.length) return '';
  if (session.team_pick === 'player' && keys.includes(wanted)) return wanted;
  return smallestTeam(session);
}

// Gives every active player without a valid team one, keeping teams even.
async function fillTeams(session) {
  const keys = teamKeys(session);
  if (!keys.length) return;
  const loose = await LivePlayer.find({ session_id: session._id, kicked: false, team: { $nin: keys } }).sort({ joined_at: 1 }).select('_id').lean();
  for (const p of loose) {
    // eslint-disable-next-line no-await-in-loop
    await LivePlayer.updateOne({ _id: p._id }, { $set: { team: await smallestTeam(session) } });
  }
}

// Deals every active player out to the teams in join order (auto mode).
async function rebalanceTeams(session) {
  const keys = teamKeys(session);
  const players = await LivePlayer.find({ session_id: session._id, kicked: false }).sort({ joined_at: 1 }).select('_id').lean();
  await Promise.all(players.map((p, i) => LivePlayer.updateOne({ _id: p._id }, { $set: { team: keys.length ? keys[i % keys.length] : '' } })));
}

// Team standings: average points per member (fair across team sizes), then total.
function teamStandings(session, players) {
  const teams = (session.teams || []).map((t) => ({ key: t.key, name: t.name, members: 0, total: 0, last_total: 0, correct: 0 }));
  if (!teams.length) return null;
  const byKey = Object.fromEntries(teams.map((t) => [t.key, t]));
  players.forEach((p) => {
    const t = byKey[p.team];
    if (!t) return;
    t.members += 1; t.total += p.score || 0; t.last_total += p.last_points || 0; t.correct += p.correct_count || 0;
  });
  return teams
    .map((t) => ({
      key: t.key, name: t.name, members: t.members, total: t.total,
      score: t.members ? Math.round(t.total / t.members) : 0,
      last_points: t.members ? Math.round(t.last_total / t.members) : 0,
    }))
    .sort((a, b) => b.score - a.score || b.total - a.total)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

// Captain of a team: the player the host picked if still in the game, else
// the team's first player to join. `members` must be sorted by joined_at.
function captainOf(session, teamKey, members) {
  const team = (session.teams || []).find((t) => t.key === teamKey);
  const inTeam = members.filter((p) => p.team === teamKey && !p.kicked);
  return inTeam.find((p) => String(p._id) === team?.captain) || inTeam[0] || null;
}
const captainMode = (session) => session.team_answer === 'captain' && (session.teams || []).length > 0;

// This player's answer order for one question — fixed per player and question
// (so a reload shows the same order), different between neighbours.
function optionOrder(session, q, playerId, index) {
  const n = (q.options || []).length;
  const order = [...Array(n).keys()];
  if (!session.shuffle_options || q.type === 'true_false' || n < 2) return null;
  const bytes = crypto.createHash('sha256').update(`${playerId}:${session._id}:${index}`).digest();
  for (let i = n - 1; i > 0; i -= 1) {
    const j = bytes[i] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
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
    { returnDocument: 'after' },
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
      await fillTeams(session);
      return openQuestion(session, 0);
    case 'reveal': // end the question now
      if (session.status !== 'question') throw httpError(400, 'No question is running.');
      return LiveSession.findOneAndUpdate({ _id: id, status: 'question' }, { $set: { status: 'reveal', question_ends_at: new Date() } }, { returnDocument: 'after' }).lean();
    case 'leaderboard':
      if (session.status !== 'reveal') throw httpError(400, 'Show the answer first.');
      return LiveSession.findOneAndUpdate({ _id: id, status: 'reveal' }, { $set: { status: 'leaderboard' } }, { returnDocument: 'after' }).lean();
    case 'next':
      if (!['reveal', 'leaderboard'].includes(session.status)) throw httpError(400, 'Finish this question first.');
      if (session.current_index + 1 >= total) {
        return LiveSession.findOneAndUpdate({ _id: id }, { $set: { status: 'finished', finished_at: new Date() } }, { returnDocument: 'after' }).lean();
      }
      return openQuestion(session, session.current_index + 1);
    case 'finish':
      return LiveSession.findOneAndUpdate({ _id: id }, { $set: { status: 'finished', finished_at: new Date() } }, { returnDocument: 'after' }).lean();
    case 'lock':
    case 'unlock':
      return LiveSession.findOneAndUpdate({ _id: id }, { $set: { locked: action === 'lock' } }, { returnDocument: 'after' }).lean();
    case 'teams': { // lobby only: { count: 0 | 2–6, pick: 'player' | 'auto', names: { key: name } }
      if (session.status !== 'lobby') throw httpError(400, 'Teams can only be changed in the lobby.');
      const count = Math.round(Number(body.count) || 0);
      if (count !== 0 && (count < 2 || count > TEAM_KEYS.length)) throw httpError(400, `Choose 2 to ${TEAM_KEYS.length} teams.`);
      const pick = body.pick === 'auto' ? 'auto' : 'player';
      const teamAnswer = body.team_answer === 'captain' ? 'captain' : body.team_answer === 'each' ? 'each' : (session.team_answer || 'each');
      const names = body.names && typeof body.names === 'object' ? body.names : {};
      const old = Object.fromEntries((session.teams || []).map((t) => [t.key, t]));
      const teams = TEAM_KEYS.slice(0, count).map((key) => ({
        key,
        name: String(names[key] ?? old[key]?.name ?? TEAM_DEFAULT_NAMES[key]).replace(/\s+/g, ' ').trim().slice(0, 20) || TEAM_DEFAULT_NAMES[key],
        captain: old[key]?.captain || '',
      }));
      const next = await LiveSession.findOneAndUpdate({ _id: id, status: 'lobby' }, { $set: { teams, team_pick: pick, team_answer: teamAnswer } }, { returnDocument: 'after' }).lean();
      if (!next) throw httpError(400, 'Teams can only be changed in the lobby.');
      const sizeChanged = count !== (session.teams || []).length;
      if (!count) await LivePlayer.updateMany({ session_id: id }, { $set: { team: '' } });
      else if (pick === 'auto' && (sizeChanged || session.team_pick !== 'auto')) await rebalanceTeams(next);
      else await fillTeams(next);
      return next;
    }
    case 'move': { // lobby only: put one player in another team
      if (session.status !== 'lobby') throw httpError(400, 'Players can only change teams in the lobby.');
      if (!mongoose.isValidObjectId(body.player_id) || !teamKeys(session).includes(body.team)) throw httpError(400, 'Unknown player or team.');
      await LivePlayer.updateOne({ _id: body.player_id, session_id: id }, { $set: { team: body.team } });
      return LiveSession.findById(id).lean();
    }
    case 'captain': { // { player_id } — make this player their team's captain
      if (session.status === 'finished') throw httpError(400, 'The game has finished.');
      if (!mongoose.isValidObjectId(body.player_id)) throw httpError(400, 'Unknown player.');
      const p = await LivePlayer.findOne({ _id: body.player_id, session_id: id, kicked: false }).select('team').lean();
      if (!p || !teamKeys(session).includes(p.team)) throw httpError(400, 'That player is not in a team.');
      return LiveSession.findOneAndUpdate({ _id: id, 'teams.key': p.team }, { $set: { 'teams.$.captain': String(p._id) } }, { returnDocument: 'after' }).lean();
    }
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

  // One answer per question: the filter refuses a second one atomically.
  const record = async (p) => {
    const streakAfter = !scored ? p.streak : correct ? p.streak + 1 : 0;
    const points = pointsFor(q, correct, timeMs, streakAfter);
    return LivePlayer.findOneAndUpdate(
      { _id: p._id, kicked: false, 'answers.index': { $ne: index } },
      {
        $push: { answers: { index, choices, correct, points, time_ms: timeMs, at: new Date(now) } },
        $inc: { score: points, correct_count: correct ? 1 : 0, total_time_ms: scored ? timeMs : 0 },
        $set: { streak: streakAfter, last_points: points },
        $max: { best_streak: streakAfter },
      },
      { returnDocument: 'after' },
    ).lean();
  };

  // Captain mode: only the captain answers, and the answer counts for the team.
  if (captainMode(session) && player.team) {
    const team = await LivePlayer.find({ session_id: session._id, kicked: false, team: player.team })
      .select('team streak answers joined_at').sort({ joined_at: 1 }).lean();
    const captain = captainOf(session, player.team, team);
    if (!captain || String(captain._id) !== String(player._id)) throw httpError(403, 'Your team captain answers for the team. Talk it over together!');
    const updated = await record(player);
    if (!updated) throw httpError(409, 'Your team already answered this question.');
    await Promise.all(team.filter((m) => String(m._id) !== String(player._id)).map((m) => record(m)));
    await endIfAllAnswered(session);
    return updated;
  }

  const updated = await record(player);
  if (!updated) throw httpError(409, 'You already answered this question.');
  await endIfAllAnswered(session);
  return updated;
}

// ── Views ─────────────────────────────────────────────────────────────────────
// Ranking: score, then the faster total answer time.
const RANK_SORT = { score: -1, total_time_ms: 1, joined_at: 1 };

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
    .select('nickname avatar team score correct_count best_streak total_time_ms last_points answers joined_at')
    .sort(RANK_SORT).lean();
  const idx = session.current_index;
  const q = idx >= 0 ? session.questions[idx] : null;
  const byJoin = [...players].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
  const captainIds = new Set((session.teams || []).map((t) => captainOf(session, t.key, byJoin)).filter(Boolean).map((p) => String(p._id)));
  const view = {
    teams: session.teams || [], team_pick: session.team_pick || 'player', team_standings: teamStandings(session, players),
    team_answer: session.team_answer || 'each', shuffle_options: !!session.shuffle_options,
    id: String(session._id), game_id: String(session.game_id), title: session.title, cover: session.cover, pin: session.pin, code: session.code,
    status: session.status, locked: session.locked, current_index: idx, total: session.questions.length,
    question_starts_at: session.question_starts_at, question_ends_at: session.question_ends_at, server_now: new Date(),
    players: players.map((p) => ({
      id: String(p._id), nickname: p.nickname, avatar: p.avatar, team: p.team || '', captain: captainIds.has(String(p._id)), score: p.score, last_points: p.last_points,
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
    view.results = players.map((p, i) => ({ rank: i + 1, id: String(p._id), nickname: p.nickname, avatar: p.avatar, team: p.team || '', ...statsOf(p, session.questions) }));
  }
  return view;
}

// ── Shared player snapshot ────────────────────────────────────────────────────
// Every phone polls about once a second. Instead of each poll reading all the
// players (counts, ranks, team standings, top 5), one read per session is
// shared by every poll for SNAPSHOT_MS. It is also refreshed as soon as the
// game moves on (status / question change), so a reveal or leaderboard never
// shows scores from before the question closed.
const SNAPSHOT_MS = 800;
const snapshots = new Map(); // session id → { at, stamp, players, byJoin }

async function playersSnapshot(session) {
  const key = String(session._id);
  const stamp = `${session.status}:${session.current_index}`;
  const hit = snapshots.get(key);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < SNAPSHOT_MS) return hit;
  const players = await LivePlayer.find({ session_id: session._id, kicked: false })
    .select('nickname avatar team score correct_count total_time_ms last_points joined_at')
    .sort(RANK_SORT).lean();
  const snap = { at: Date.now(), stamp, players, byJoin: [...players].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at)) };
  snapshots.set(key, snap);
  if (snapshots.size > 200) { // drop stale entries now and then
    for (const [k, v] of snapshots) if (Date.now() - v.at > 60_000) snapshots.delete(k);
  }
  return snap;
}

// Rank of `p` (with its own, freshest score) among the snapshot's players.
function rankIn(players, p) {
  const id = String(p._id);
  return 1 + players.filter((o) => String(o._id) !== id
    && (o.score > p.score || (o.score === p.score && o.total_time_ms < p.total_time_ms))).length;
}

async function playerView(session, player) {
  const idx = session.current_index;
  const q = idx >= 0 ? session.questions[idx] : null;
  const mine = q ? (player.answers || []).find((a) => a.index === idx) : null;
  const snap = await playersSnapshot(session);
  const view = {
    title: session.title, cover: session.cover, status: session.status, server_now: new Date(),
    current_index: idx, total: session.questions.length,
    question_starts_at: session.question_starts_at, question_ends_at: session.question_ends_at,
    me: { id: String(player._id), nickname: player.nickname, avatar: player.avatar, team: player.team || '', score: player.score, streak: player.streak, kicked: player.kicked },
    players_count: snap.players.length,
    teams: session.teams || [], team_pick: session.team_pick || 'player', team_answer: session.team_answer || 'each',
  };
  // Team mode: member counts in the lobby (for picking), standings later on.
  if ((session.teams || []).length) {
    const standings = teamStandings(session, snap.players);
    if (player.team) {
      const captain = captainOf(session, player.team, snap.byJoin);
      view.me.captain = !!captain && String(captain._id) === String(player._id);
      view.captain_name = captain?.nickname || '';
    }
    view.team_standings = session.status === 'lobby'
      ? standings.map(({ key, name, members: n }) => ({ key, name, members: n }))
      : standings;
    view.me.team_rank = standings.find((t) => t.key === player.team)?.rank || null;
  }
  if (q && session.status !== 'lobby') {
    view.question = publicQuestion(q, idx, session.questions.length);
    const order = optionOrder(session, q, player._id, idx);
    if (order) view.question.order = order; // display order of the option indexes
    view.my_answer = mine ? { choices: mine.choices } : null;
    if (session.status !== 'question') {
      // Answer revealed: now the player may see what was right and how they did.
      view.question.correct = correctSet(q);
      view.my_answer = mine ? { choices: mine.choices, correct: mine.correct, points: mine.points, time_ms: mine.time_ms } : null;
      view.me.rank = rankIn(snap.players, player);
    }
  }
  if (session.status === 'leaderboard' || session.status === 'finished') {
    const top = snap.players.slice(0, session.status === 'finished' ? 3 : 5);
    view.leaderboard = top.map((p, i) => ({ rank: i + 1, nickname: p.nickname, avatar: p.avatar, score: p.score, is_me: String(p._id) === String(player._id) }));
    view.me.rank = rankIn(snap.players, player);
  }
  if (session.status === 'finished') view.me.stats = statsOf(player, session.questions);
  return view;
}

module.exports = {
  GET_READY_MS, SESSION_TTL_MS, uniquePin, randomCode, newToken, settle, hostAction, submitAnswer,
  hostView, playerView, httpError, isCorrect, pointsFor, correctSet, teamForJoin, optionOrder, teamStandings,
};
