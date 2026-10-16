const ExamAttempt = require('../models/ExamAttempt');
const { gradeAnswer, computeAttemptScore, MANUAL_TYPES, UNSCORED_TYPES } = require('./examGrading');
const { dedupeAnswers } = require('./examAttemptFlow');

// ─── Live re-marking ──────────────────────────────────────────────────────────
// Every attempt keeps its own copy of the questions (questions_snapshot), so an
// answer-key fix in the exam would otherwise only reach attempts started after
// it. When the exam is saved, the changed questions' key + points are copied
// into every attempt of the exam and the stored responses re-marked:
//   finished attempts  → answers re-graded, score / percentage / pass recomputed
//                        (a 'graded' attempt whose total was overridden by hand
//                        keeps its total and is listed for a hand check);
//   in-progress        → snapshot updated, so the submit grades with the new key
//                        (answers already checked with instant feedback are
//                        re-graded too).
// Questions that changed type, or whose options were replaced, can't be
// re-marked against the old answers safely: those attempts are listed instead.

const CHOICE_TYPES = new Set(['mcq', 'true_false', 'select_list', 'multi_response']);
const KEY_FIELDS = [
  'numeric_answer', 'numeric_tolerance', 'sequence_items', 'matching_pairs', 'blanks_answers',
  'drag_words_answers', 'hotspot_regions', 'dragdrop_items', 'dragdrop_targets',
];
// What the candidate sees — refreshed on in-progress attempts only (they see it
// on their next load); finished attempts keep the wording they answered.
const DISPLAY_FIELDS = ['prompt', 'explanation', 'images', 'image_url'];

const plain = (q) => (q && q.toObject ? q.toObject() : q);

// Everything that decides how a question is marked. Two questions with the same
// signature grade every response identically.
function keySignature(question) {
  const q = plain(question);
  const base = { type: q.type, points: q.points };
  if (CHOICE_TYPES.has(q.type)) {
    base.options = (q.options || []).map((o) => [String(o._id), !!o.is_correct]);
  } else {
    KEY_FIELDS.forEach((f) => {
      base[f] = JSON.parse(JSON.stringify(q[f] ?? null, (k, v) => (k === '_id' ? undefined : v)));
    });
  }
  return JSON.stringify(base);
}

// Ids of questions present in both versions whose key or points differ.
function changedKeyQuestionIds(beforeQuestions, afterQuestions) {
  const before = new Map((beforeQuestions || []).map((q) => [String(q._id), keySignature(q)]));
  return (afterQuestions || [])
    .filter((q) => before.has(String(q._id)) && before.get(String(q._id)) !== keySignature(q))
    .map((q) => String(q._id));
}

// Copies the exam question's key + points onto a snapshot question. Returns why
// it can't, or null on success.
function applyKey(snapQ, examQ, { display = false } = {}) {
  if (examQ.type !== snapQ.type) return `question type changed (${snapQ.type} → ${examQ.type})`;
  if (CHOICE_TYPES.has(snapQ.type)) {
    const current = new Map((examQ.options || []).map((o) => [String(o._id), o]));
    const snapIds = (snapQ.options || []).map((o) => String(o._id));
    if (snapIds.some((id) => !current.has(id)) || snapIds.length !== current.size) return 'answer options were added or removed';
    snapQ.options.forEach((o) => {
      const cur = current.get(String(o._id));
      o.is_correct = !!cur.is_correct;
      if (display) { o.text = cur.text; o.image_url = cur.image_url; }
    });
  } else {
    KEY_FIELDS.forEach((f) => { if (examQ[f] !== undefined) snapQ[f] = examQ[f]; });
  }
  snapQ.points = examQ.points;
  if (display) DISPLAY_FIELDS.forEach((f) => { if (examQ[f] !== undefined) snapQ[f] = examQ[f]; });
  return null;
}

// Re-marks one attempt in memory. Returns what changed; does not save.
function remarkAttempt(attempt, examQById, questionIds, exam) {
  const before = { score: attempt.score, pct: attempt.percentage, passed: attempt.passed };
  const finished = attempt.status !== 'in_progress';
  const autoBefore = finished
    ? computeAttemptScore(attempt.questions_snapshot, attempt.answers, exam.section_settings).score
    : null;
  if (finished) dedupeAnswers(attempt);

  const skipped = [];
  let keyUpdated = 0;
  let regraded = 0;
  attempt.questions_snapshot.forEach((snapQ) => {
    const id = String(snapQ._id);
    if (questionIds && !questionIds.has(id)) return;
    if (MANUAL_TYPES.has(snapQ.type) || UNSCORED_TYPES.has(snapQ.type)) return;
    const examQ = examQById.get(id);
    if (!examQ) return; // removed from the exam since — leave as marked
    const why = applyKey(snapQ, examQ, { display: !finished });
    if (why) { skipped.push({ question_id: id, reason: why }); return; }
    keyUpdated += 1;
    const entry = attempt.answers.find((a) => String(a.question_id) === id);
    // In progress: only answers already locked by "Check answer" carry a grade.
    if (!entry || (!finished && !entry.locked)) return;
    const graded = gradeAnswer(snapQ, entry.response);
    if (graded.is_correct !== entry.is_correct || graded.points_awarded !== entry.points_awarded) {
      entry.is_correct = graded.is_correct;
      entry.points_awarded = graded.points_awarded;
      regraded += 1;
    }
  });

  let overridden = false;
  if (finished && (keyUpdated || regraded)) {
    const computed = computeAttemptScore(attempt.questions_snapshot, attempt.answers, exam.section_settings);
    if (attempt.status === 'submitted' || (attempt.status === 'graded' && before.score === autoBefore)) {
      attempt.score = computed.score;
      attempt.max_score = computed.maxScore;
      attempt.percentage = computed.percentage;
      attempt.passed = computed.percentage >= exam.pass_percentage;
    } else if (attempt.status === 'pending_review') {
      attempt.max_score = computed.maxScore; // the score comes with manual grading
    } else {
      overridden = regraded > 0; // graded with a hand-set total: keep it, flag it
    }
  }
  return {
    attempt_id: String(attempt._id),
    participant_name: attempt.participant_name || '',
    status: attempt.status,
    key_updated: keyUpdated,
    regraded,
    skipped,
    overridden,
    before,
    after: { score: attempt.score, pct: attempt.percentage, passed: attempt.passed },
  };
}

// Re-marks every attempt of `exam` for `questionIds` (null = all questions).
// apply=false only reports. Returns a summary + per-attempt rows that changed.
async function remarkExam(exam, { questionIds = null, apply = false } = {}) {
  const ids = questionIds ? new Set(questionIds.map(String)) : null;
  const examQById = new Map((exam.questions || []).map((q) => [String(q._id), plain(q)]));
  const attemptIds = await ExamAttempt.find({ exam_id: exam._id }).distinct('_id');

  const rows = [];
  for (const attemptId of attemptIds) {
    // Retry when a candidate's own write (autosave / submit) lands in between.
    for (let tries = 0; tries < 5; tries += 1) {
      const attempt = await ExamAttempt.findById(attemptId);
      if (!attempt) break;
      const row = remarkAttempt(attempt, examQById, ids, exam);
      const changed = row.key_updated > 0 || row.regraded > 0;
      if (changed || row.skipped.length) rows.push(row);
      if (!apply || !changed) break;
      attempt.$where = { status: row.status, updated_at: attempt.updated_at };
      try {
        await attempt.save();
        break;
      } catch (err) {
        if (err.name !== 'VersionError' && err.name !== 'DocumentNotFoundError') throw err;
        rows.pop();
        await new Promise((r) => setTimeout(r, 40 * (tries + 1)));
      }
    }
  }

  const finished = rows.filter((r) => r.status !== 'in_progress');
  const scoreChanged = finished.filter((r) => r.before.score !== r.after.score || r.before.pct !== r.after.pct);
  return {
    results_changed: scoreChanged.length,
    answers_regraded: finished.reduce((t, r) => t + r.regraded, 0),
    pass_changes: scoreChanged.filter((r) => r.before.passed !== r.after.passed)
      .map((r) => ({ name: r.participant_name, from: r.before.passed, to: r.after.passed })),
    in_progress_updated: rows.filter((r) => r.status === 'in_progress' && r.key_updated > 0).length,
    needs_hand_check: [
      ...rows.filter((r) => r.overridden).map((r) => ({ name: r.participant_name, reason: 'total was changed by hand — score not recomputed' })),
      ...rows.flatMap((r) => r.skipped.map((s) => ({ name: r.participant_name, question_id: s.question_id, reason: s.reason }))),
    ],
    rows,
  };
}

// What the candidate reads (wording, option text, images, explanation).
function contentSignature(question) {
  const q = plain(question);
  return JSON.stringify([
    ...DISPLAY_FIELDS.map((f) => JSON.parse(JSON.stringify(q[f] ?? null, (k, v) => (k === '_id' ? undefined : v)))),
    (q.options || []).map((o) => [String(o._id), o.text, o.image_url]),
  ]);
}

function changedContentQuestionIds(beforeQuestions, afterQuestions) {
  const before = new Map((beforeQuestions || []).map((q) => [String(q._id), contentSignature(q)]));
  return (afterQuestions || [])
    .filter((q) => before.has(String(q._id)) && before.get(String(q._id)) !== contentSignature(q))
    .map((q) => String(q._id));
}

// Wording fixes reach candidates who are taking the exam right now (on their
// next page load). Finished attempts keep the wording they answered. Skips a
// question whose type or option list changed — that needs a re-mark decision.
// Returns how many in-progress attempts were updated.
async function refreshInProgressContent(exam, questionIds) {
  const ids = new Set(questionIds.map(String));
  const examQById = new Map((exam.questions || []).map((q) => [String(q._id), plain(q)]));
  const attemptIds = await ExamAttempt.find({ exam_id: exam._id, status: 'in_progress' }).distinct('_id');
  let updated = 0;
  for (const attemptId of attemptIds) {
    for (let tries = 0; tries < 5; tries += 1) {
      const attempt = await ExamAttempt.findById(attemptId);
      if (!attempt || attempt.status !== 'in_progress') break;
      let touched = 0;
      attempt.questions_snapshot.forEach((snapQ) => {
        const examQ = examQById.get(String(snapQ._id));
        if (!ids.has(String(snapQ._id)) || !examQ || examQ.type !== snapQ.type) return;
        if (CHOICE_TYPES.has(snapQ.type)) {
          const current = new Map((examQ.options || []).map((o) => [String(o._id), o]));
          if (snapQ.options.length !== current.size || snapQ.options.some((o) => !current.has(String(o._id)))) return;
          snapQ.options.forEach((o) => { const cur = current.get(String(o._id)); o.text = cur.text; o.image_url = cur.image_url; });
        }
        DISPLAY_FIELDS.forEach((f) => { if (examQ[f] !== undefined) snapQ[f] = examQ[f]; });
        touched += 1;
      });
      if (!touched) break;
      attempt.$where = { status: 'in_progress', updated_at: attempt.updated_at };
      try {
        await attempt.save();
        updated += 1;
        break;
      } catch (err) {
        if (err.name !== 'VersionError' && err.name !== 'DocumentNotFoundError') throw err;
        await new Promise((r) => setTimeout(r, 40 * (tries + 1)));
      }
    }
  }
  return updated;
}

module.exports = { remarkExam, changedKeyQuestionIds, changedContentQuestionIds, refreshInProgressContent, keySignature };
