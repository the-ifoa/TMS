// Quiz Arena scoring rules (no database needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { isCorrect, pointsFor, correctSet, optionOrder, teamStandings } = require('../services/liveQuiz');

const q = (type, correct, n = 4) => ({
  type, time_limit: 20, points: 'standard',
  options: Array.from({ length: n }, (_, i) => ({ text: `o${i}`, is_correct: correct.includes(i) })),
});

test('right / wrong per question type', () => {
  assert.equal(isCorrect(q('quiz', [1]), [1]), true);
  assert.equal(isCorrect(q('quiz', [1]), [0]), false);
  assert.equal(isCorrect(q('quiz', [1]), [1, 0]), false);
  assert.equal(isCorrect(q('multi', [0, 2]), [2, 0]), true);
  assert.equal(isCorrect(q('multi', [0, 2]), [0]), false);
  assert.equal(isCorrect(q('multi', [0, 2]), [0, 1, 2]), false);
  assert.equal(isCorrect(q('poll', []), [3]), null);
  assert.deepEqual(correctSet(q('poll', [1])), []);
});

test('points: speed, double points, streak bonus (the help guide example)', () => {
  const question = q('quiz', [0]);
  assert.equal(pointsFor(question, true, 0, 1), 1000);
  assert.equal(pointsFor(question, true, 20000, 1), 500);
  // Anna: right after 5 s, third in a row → 875 + 200.
  assert.equal(pointsFor(question, true, 5000, 3), 1075);
  // Ben: right after 18 s, no streak → 550.
  assert.equal(pointsFor(question, true, 18000, 1), 550);
  assert.equal(pointsFor(question, false, 1000, 0), 0);
  assert.equal(pointsFor({ ...question, points: 'double' }, true, 0, 1), 2000);
  assert.equal(pointsFor({ ...question, points: 'none' }, true, 0, 1), 0);
  assert.equal(pointsFor(question, true, 0, 99), 1500, 'streak bonus capped at +500');
});

test('shuffled answers: a fixed order per player, never for true/false', () => {
  const session = { _id: 's1', shuffle_options: true };
  const quiz = q('quiz', [0], 6);
  const a = optionOrder(session, quiz, 'player-a', 0);
  assert.deepEqual(optionOrder(session, quiz, 'player-a', 0), a, 'same player, same question → same order');
  assert.deepEqual([...a].sort(), [0, 1, 2, 3, 4, 5]);
  const orders = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p) => optionOrder(session, quiz, p, 0).join()));
  assert.ok(orders.size > 1, 'players get different orders');
  assert.equal(optionOrder(session, q('true_false', [0], 2), 'player-a', 0), null);
  assert.equal(optionOrder({ _id: 's1', shuffle_options: false }, quiz, 'player-a', 0), null);
});

test('team standings: average per player, ties on total', () => {
  const session = { teams: [{ key: 'red', name: 'Red' }, { key: 'blue', name: 'Blue' }, { key: 'green', name: 'Green' }] };
  const players = [
    ...Array.from({ length: 6 }, () => ({ team: 'red', score: 800 })),
    ...Array.from({ length: 4 }, () => ({ team: 'blue', score: 900 })),
  ];
  const s = teamStandings(session, players);
  assert.deepEqual(s.map((t) => [t.key, t.score, t.members, t.rank]), [['blue', 900, 4, 1], ['red', 800, 6, 2], ['green', 0, 0, 3]]);
  assert.equal(teamStandings({ teams: [] }, players), null);
});
