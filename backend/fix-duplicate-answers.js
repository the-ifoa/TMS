#!/usr/bin/env node
/**
 * fix-duplicate-answers.js
 *
 * ONE-TIME repair script. Safe to run multiple times (no-op if clean).
 *
 * Problem:
 *   The old autosave loaded the attempt, pushed the answer and save()-d it.
 *   Two parallel saves for the same question both pushed it, so an attempt
 *   could hold 21 answers for 20 questions. On submit only the first copy was
 *   graded: the result screen showed TOTAL 21, and the score lookup picked the
 *   ungraded copy, so that question scored 0 (17 correct x 5 pts shown as 80%).
 *
 * Fix:
 *   Keeps one answer per question (the locked copy, else the first — the one
 *   every later save updated) and drops answers for questions not in the
 *   snapshot. For 'submitted' attempts the score, percentage and pass/fail are
 *   recomputed. 'graded' and 'pending_review' attempts are only de-duplicated
 *   (a manual total override can't be recomputed) and listed for review.
 *
 * Usage (run from the backend folder):
 *   node fix-duplicate-answers.js           # dry run, changes nothing
 *   node fix-duplicate-answers.js --apply   # write the fixes
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const ExamAttempt = require('./models/ExamAttempt');
const Exam = require('./models/Exam');
const { dedupeAnswers } = require('./services/examAttemptFlow');
const { computeAttemptScore } = require('./services/examGrading');

const APPLY = process.argv.includes('--apply');

async function main() {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    console.error('ERROR: MONGODB_URL environment variable is not set.');
    process.exit(1);
  }
  await mongoose.connect(mongoUrl, { dbName: 'certificateSystem' });
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN (pass --apply to write)');

  // Finished attempts with more answer rows than questions.
  const ids = await ExamAttempt.find({
    status: { $ne: 'in_progress' },
    $expr: { $gt: [{ $size: { $ifNull: ['$answers', []] } }, { $size: { $ifNull: ['$questions_snapshot', []] } }] },
  }).distinct('_id');
  console.log(`Attempts with extra answer rows: ${ids.length}`);

  const examCache = new Map();
  let fixed = 0;
  let flipped = 0;
  for (const id of ids) {
    const attempt = await ExamAttempt.findById(id);
    const before = { rows: attempt.answers.length, score: attempt.score, pct: attempt.percentage, passed: attempt.passed };
    if (!dedupeAnswers(attempt)) continue;

    let note = '';
    if (attempt.status === 'submitted') {
      const key = String(attempt.exam_id);
      if (!examCache.has(key)) examCache.set(key, await Exam.findById(key).select('pass_percentage section_settings').lean());
      const exam = examCache.get(key);
      const { score, maxScore, percentage } = computeAttemptScore(
        attempt.questions_snapshot, attempt.answers, exam ? exam.section_settings : []
      );
      attempt.score = score;
      attempt.max_score = maxScore;
      attempt.percentage = percentage;
      attempt.passed = percentage >= (exam ? exam.pass_percentage : 75);
      if (before.passed !== attempt.passed) { flipped += 1; note = '  <-- PASS/FAIL CHANGED'; }
    } else {
      note = `  (status ${attempt.status}: rows de-duplicated only, check the score by hand)`;
    }

    console.log(
      `${attempt._id} ${attempt.participant_name || ''} "${attempt.exam_title_snapshot || ''}": ` +
      `rows ${before.rows} -> ${attempt.answers.length}, score ${before.score} -> ${attempt.score}, ` +
      `${before.pct}% -> ${attempt.percentage}%, passed ${before.passed} -> ${attempt.passed}${note}`
    );
    if (APPLY) await attempt.save();
    fixed += 1;
  }

  console.log(`\n${APPLY ? 'Fixed' : 'Would fix'} ${fixed} attempt(s); pass/fail changed on ${flipped}.`);
  if (flipped) console.log('Review certificates / notifications for attempts whose pass/fail changed.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
