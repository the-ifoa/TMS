#!/usr/bin/env node
/**
 * regrade-attempts.js
 *
 * Re-marks every attempt of one exam against the exam's CURRENT answer key.
 *
 * Saving an exam already does this for the questions whose key or points
 * changed (services/examRemark.js). This script is the manual fallback — for
 * keys fixed before live re-marking existed (e.g. "Global Jet Recurrent
 * Training - Fall 2026" Q23, which had no correct option), or when the
 * re-mark after a save failed. It checks ALL questions, so it also lists
 * attempts that can't be re-marked automatically (a question whose type
 * changed, or whose options were replaced, after candidates answered it).
 *
 * Usage (run from the backend folder):
 *   node regrade-attempts.js --exam <examId>           # dry run, changes nothing
 *   node regrade-attempts.js --exam <examId> --apply   # write the changes
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');
const { remarkExam } = require('./services/examRemark');

const APPLY = process.argv.includes('--apply');
const examArg = process.argv[process.argv.indexOf('--exam') + 1];

async function main() {
  if (!process.env.MONGODB_URL) { console.error('ERROR: MONGODB_URL is not set.'); process.exit(1); }
  if (!process.argv.includes('--exam') || !mongoose.isValidObjectId(examArg)) {
    console.error('Usage: node regrade-attempts.js --exam <examId> [--apply]'); process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URL, { dbName: 'certificateSystem' });
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: DRY RUN (pass --apply to write)');

  const exam = await Exam.findById(examArg);
  if (!exam) { console.error('Exam not found.'); process.exit(1); }
  console.log(`Exam: "${exam.title}" (pass mark ${exam.pass_percentage}%)\n`);
  const numberOf = new Map(exam.questions.map((q, i) => [String(q._id), i + 1]));

  const summary = await remarkExam(exam, { apply: APPLY });
  summary.rows.forEach((r) => {
    const flip = r.before.passed !== r.after.passed;
    console.log(
      `${r.attempt_id} ${r.participant_name.padEnd(26)} ${r.status.padEnd(14)} answers re-marked ${r.regraded}, ` +
      `score ${r.before.score} -> ${r.after.score}, ${r.before.pct}% -> ${r.after.pct}%, ` +
      `passed ${r.before.passed} -> ${r.after.passed}${flip ? '  <-- PASS/FAIL CHANGED' : ''}`
    );
    if (r.overridden) console.log('    total was changed by hand — score NOT recomputed, check by hand');
    r.skipped.forEach((s) => console.log(`    Q${numberOf.get(s.question_id) ?? '?'} not re-marked: ${s.reason}`));
  });

  console.log(`\n${APPLY ? 'Changed' : 'Would change'} ${summary.results_changed} result(s); ` +
    `${summary.answers_regraded} answer(s) re-marked; pass/fail changed on ${summary.pass_changes.length}; ` +
    `${summary.in_progress_updated} in-progress attempt(s) updated; ${summary.needs_hand_check.length} item(s) need a hand check.`);
  if (summary.pass_changes.length) console.log('Review certificates / notifications for attempts whose pass/fail changed.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
