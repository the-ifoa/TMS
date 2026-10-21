// Quiz Arena end to end against a real MongoDB: joining, teams, captains,
// shuffled answers, the shared snapshot, "unchanged" replies, and turning
// quizzes into exams and back.
//
// Needs a throwaway database — every run WIPES it:
//   TEST_MONGODB_URL=mongodb://127.0.0.1:27017/tms_test npm test
// Skipped when TEST_MONGODB_URL is not set. Only local hosts are accepted,
// unless TEST_ALLOW_REMOTE_DB=1 (never point this at production).
const test = require('node:test');
const assert = require('node:assert/strict');

const URL = process.env.TEST_MONGODB_URL;
const local = URL && /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL);
const skip = !URL ? 'set TEST_MONGODB_URL to run' : !local && process.env.TEST_ALLOW_REMOTE_DB !== '1' ? 'TEST_MONGODB_URL must be a local database' : false;

process.env.JWT_SECRET ||= 'test';
const mongoose = require('mongoose');
const live = require('../services/liveQuiz');
const LiveSession = require('../models/LiveSession');
const LivePlayer = require('../models/LivePlayer');
const LiveGame = require('../models/LiveGame');
const Exam = require('../models/Exam');
const ctl = require('../controllers/liveController');

const mkRes = () => {
  const r = { code: 200 };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const q = (type, opts) => ({ type, prompt: `Q ${type}`, time_limit: 20, points: 'standard', options: opts });
const QUESTIONS = [
  q('quiz', [{ text: 'a', is_correct: true }, { text: 'b' }, { text: 'c' }, { text: 'd' }]),
  q('true_false', [{ text: 'True', is_correct: true }, { text: 'False' }]),
];
let n = 0;
async function newSession(extra = {}) {
  n += 1;
  return (await LiveSession.create({
    game_id: new mongoose.Types.ObjectId(), title: 'T', pin: String(100000 + n), code: `c${n}`, questions: QUESTIONS, ...extra,
  })).toObject();
}
async function join(code, nickname, team) {
  const res = mkRes();
  await ctl.join({ params: { code }, body: { nickname, team }, headers: {}, ip: nickname }, res);
  assert.equal(res.code, 201, JSON.stringify(res.body));
  return res.body;
}
async function openFirstQuestion(s) {
  const started = await live.hostAction(s, 'start');
  await LiveSession.updateOne({ _id: started._id }, { $set: { question_starts_at: new Date(Date.now() - 1000) } });
  return LiveSession.findById(started._id).lean();
}
const player = (nickname) => LivePlayer.findOne({ nickname }).lean();

test('Quiz Arena with a database', { skip }, async (t) => {
  await mongoose.connect(URL);
  await mongoose.connection.db.dropDatabase();
  t.after(() => mongoose.disconnect());

  await t.test('teams: fill on enable, pick on join, auto-balance, host move', async () => {
    let s = await newSession();
    assert.equal((await join(s.code, 'alice')).player.team, '');
    await join(s.code, 'bob');
    await join(s.code, 'cara');
    s = await live.hostAction(s, 'teams', { count: 2, pick: 'player', names: { red: 'Group A' } });
    assert.equal(s.teams[0].name, 'Group A');
    assert.ok((await LivePlayer.find({ session_id: s._id }).lean()).every((p) => ['red', 'blue'].includes(p.team)));
    const dan = await join(s.code, 'dan', 'blue');
    assert.equal(dan.player.team, 'blue');

    const sw = mkRes();
    await ctl.chooseTeam({ params: { code: s.code }, body: { team: 'red' }, headers: { 'x-player-token': dan.token } }, sw);
    assert.equal(sw.code, 200);

    s = await live.hostAction(s, 'teams', { count: 3, pick: 'auto' });
    const sizes = Object.values((await LivePlayer.find({ session_id: s._id }).lean()).reduce((m, p) => ({ ...m, [p.team]: (m[p.team] || 0) + 1 }), {}));
    assert.deepEqual(sizes.sort(), [1, 1, 2]);
    const blocked = mkRes();
    await ctl.chooseTeam({ params: { code: s.code }, body: { team: 'red' }, headers: { 'x-player-token': dan.token } }, blocked);
    assert.equal(blocked.code, 403, 'players cannot switch in auto mode');

    s = await live.hostAction(s, 'move', { player_id: String((await player('alice'))._id), team: 'green' });
    s = await openFirstQuestion(s);
    await live.submitAnswer(s, await player('alice'), 0, [0]);
    s = await LiveSession.findById(s._id).lean();
    const view = await live.hostView(s);
    assert.equal(view.team_standings.find((x) => x.key === 'green').rank, 1);
    const pv = await live.playerView(s, await player('alice'));
    assert.equal(pv.me.team, 'green');
    assert.equal(pv.me.team_rank, 1);
    await assert.rejects(live.hostAction(s, 'teams', { count: 0 }), /lobby/);
  });

  await t.test('captain mode: only the captain answers, for the whole team', async () => {
    let s = await newSession({ shuffle_options: true });
    s = await live.hostAction(s, 'teams', { count: 2, pick: 'player', team_answer: 'captain' });
    await join(s.code, 'ann', 'red');
    const ben = await join(s.code, 'ben', 'red');
    await join(s.code, 'cat', 'blue');
    s = await live.hostAction(s, 'captain', { player_id: ben.player.id });
    s = await live.hostAction(s, 'teams', { count: 2, pick: 'player', names: { red: 'Alpha' } });
    assert.equal(s.teams[0].captain, ben.player.id, 'renaming keeps the captain');

    s = await openFirstQuestion(s);
    const annView = await live.playerView(s, await player('ann'));
    assert.equal(annView.me.captain, false);
    assert.equal(annView.captain_name, 'ben');
    assert.deepEqual([...annView.question.order].sort(), [0, 1, 2, 3]);

    await assert.rejects(live.submitAnswer(s, await player('ann'), 0, [0]), /captain/);
    await live.submitAnswer(s, await player('ben'), 0, [0]);
    assert.ok((await player('ann')).score > 0, 'teammate scored with the captain');
    assert.equal((await LiveSession.findById(s._id).lean()).status, 'question', 'blue still to answer');
    await live.submitAnswer(s, await player('cat'), 0, [1]);
    assert.equal((await LiveSession.findById(s._id).lean()).status, 'reveal', 'every team answered');
  });

  await t.test('phones get "unchanged" when nothing moved on', async () => {
    const s = await newSession();
    const p = await join(s.code, 'eve');
    const req = (v) => ({ params: { code: s.code }, query: v ? { v } : {}, headers: { 'x-player-token': p.token } });
    const first = mkRes();
    await ctl.playerState(req(), first);
    assert.ok(first.body.version && first.body.status === 'lobby');
    const again = mkRes();
    await ctl.playerState(req(first.body.version), again);
    assert.deepEqual(Object.keys(again.body).sort(), ['server_now', 'unchanged', 'version']);
    await join(s.code, 'fay'); // player count changes → new version (after the snapshot expires)
    await new Promise((r) => setTimeout(r, 900));
    const later = mkRes();
    await ctl.playerState(req(first.body.version), later);
    assert.equal(later.body.unchanged, undefined);
    assert.equal(later.body.players_count, 2);
  });

  await t.test('quiz ↔ exam conversion', async () => {
    const admin = { id: new mongoose.Types.ObjectId() };
    const exam = await Exam.create({
      title: 'E1', shuffle_options: true,
      questions: [
        { type: 'mcq', prompt: 'p1', images: [{ url: 'https://x/y.png', public_id: 'pid' }], options: [{ text: 'a', is_correct: true }, { text: 'b' }] },
        { type: 'essay', prompt: 'p2' },
      ],
    });
    const toGame = mkRes();
    await ctl.gameFromExam({ params: { examId: String(exam._id) }, admin }, toGame);
    assert.equal(toGame.code, 201);
    assert.deepEqual([toGame.body.added, toGame.body.skipped], [1, 1]);
    const g = await LiveGame.findById(toGame.body.id).lean();
    assert.equal(g.questions[0].image_url, 'https://x/y.png');
    assert.equal(g.shuffle_options, true);

    const game = await LiveGame.create({
      title: 'G',
      questions: [...g.questions, q('poll', [{ text: 'x' }, { text: 'y' }]), { ...q('multi', [{ text: 'a', is_correct: true }, { text: 'b', is_correct: true }, { text: 'c' }]), points: 'double' }],
    });
    const toExam = mkRes();
    await ctl.examFromGame({ params: { id: String(game._id) }, admin }, toExam);
    assert.equal(toExam.code, 201);
    assert.deepEqual([toExam.body.added, toExam.body.skipped], [2, 1]);
    const e = await Exam.findById(toExam.body.id).lean();
    assert.equal(e.status, 'draft');
    assert.equal(e.questions[1].type, 'multi_response');
    assert.equal(e.questions[1].points, 2);
    assert.equal(e.questions[0].images[0].url, 'https://x/y.png');
  });
});
