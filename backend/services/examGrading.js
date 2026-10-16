// ─── Exam grading ──────────────────────────────────────────────────────────
// One function per auto-gradable question type + the gradeAnswer dispatcher
// used by POST /exams/attempts/:id/submit. Essay and Short Answer are always
// routed to manual review; Likert is a survey type excluded from scoring.

function normalize(str) {
  return String(str ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function gradeChoice(question, response) {
  // Shared by mcq / true_false / select_list — response is a single option _id.
  const correctIds = (question.options || [])
    .filter((o) => o.is_correct)
    .map((o) => String(o._id));
  const isCorrect = correctIds.length > 0 && correctIds.includes(String(response));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeMultiResponse(question, response) {
  const correctIds = (question.options || []).filter((o) => o.is_correct).map((o) => String(o._id));
  const chosen = Array.isArray(response) ? [...new Set(response.map(String))] : [];
  const isCorrect =
    correctIds.length > 0 &&
    correctIds.length === chosen.length &&
    correctIds.every((id) => chosen.includes(id));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeNumeric(question, response) {
  // Number(null) and Number('') are 0 — a blank answer must not match a key of 0.
  const blank = response == null || (typeof response === 'string' && response.trim() === '');
  const num = blank ? NaN : Number(response);
  if (!Number.isFinite(num) || question.numeric_answer == null) {
    return { is_correct: false, points_awarded: 0 };
  }
  const tolerance = question.numeric_tolerance || 0;
  const isCorrect = Math.abs(num - question.numeric_answer) <= tolerance;
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeSequence(question, response) {
  const items = question.sequence_items || [];
  const order = Array.isArray(response) ? response.map(Number) : [];
  const isCorrect =
    order.length === items.length && order.every((val, idx) => val === idx);
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeMatching(question, response) {
  // response: array of chosen right-side text, aligned by left index.
  const pairs = question.matching_pairs || [];
  const chosen = Array.isArray(response) ? response : [];
  const isCorrect =
    pairs.length > 0 &&
    pairs.every((pair, idx) => normalize(chosen[idx]) !== '' && normalize(chosen[idx]) === normalize(pair.right));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeFillBlank(question, response) {
  const answerSets = question.blanks_answers || [];
  const filled = Array.isArray(response) ? response : [];
  const allCorrect =
    answerSets.length > 0 &&
    answerSets.every((accepted, idx) => normalize(filled[idx]) !== '' &&
      (accepted || []).some((a) => normalize(a) === normalize(filled[idx])));
  return { is_correct: allCorrect, points_awarded: allCorrect ? question.points : 0 };
}

function gradeDragWords(question, response) {
  const answers = question.drag_words_answers || [];
  const filled = Array.isArray(response) ? response : [];
  const allCorrect =
    answers.length > 0 && answers.every((word, idx) => normalize(filled[idx]) !== '' && normalize(word) === normalize(filled[idx]));
  return { is_correct: allCorrect, points_awarded: allCorrect ? question.points : 0 };
}

function pointInRegion(point, region) {
  if (!point) return false;
  const { x, y } = point;
  if (region.shape === 'circle') {
    // Ellipse inscribed in the region's box, so it matches the box the admin
    // drew / the candidate is shown (all values are % of the image).
    const rx = region.width / 2;
    const ry = region.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (x - (region.x + rx)) / rx;
    const dy = (y - (region.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return (
    x >= region.x && x <= region.x + region.width &&
    y >= region.y && y <= region.y + region.height
  );
}

function gradeHotspot(question, response) {
  const regions = (question.hotspot_regions || []).filter((r) => r.is_correct);
  const isCorrect = regions.some((r) => pointInRegion(response, r));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeDragDrop(question, response) {
  // response: array of { item_label, target_index }
  const items = question.dragdrop_items || [];
  const placed = Array.isArray(response) ? response : [];
  if (items.length === 0) return { is_correct: false, points_awarded: 0 };

  let correctCount = 0;
  items.forEach((item) => {
    const placement = placed.find((p) => p.item_label === item.label);
    if (placement && Number(placement.target_index) === item.correct_target_index) correctCount += 1;
  });
  const isCorrect = correctCount === items.length;
  const points_awarded = Math.round((question.points * correctCount) / items.length);
  return { is_correct: isCorrect, points_awarded };
}

// type -> grader function
const GRADERS = {
  mcq: gradeChoice,
  true_false: gradeChoice,
  select_list: gradeChoice,
  multi_response: gradeMultiResponse,
  numeric: gradeNumeric,
  sequence: gradeSequence,
  matching: gradeMatching,
  fill_blank: gradeFillBlank,
  drag_words: gradeDragWords,
  hotspot: gradeHotspot,
  drag_drop: gradeDragDrop,
};

// Types that always require a human to score them.
const MANUAL_TYPES = new Set(['essay', 'short_answer']);
// Types that are surveys — no correct answer, excluded from scoring entirely.
const UNSCORED_TYPES = new Set(['likert']);

function gradeAnswer(question, response) {
  if (UNSCORED_TYPES.has(question.type)) {
    return { is_correct: null, points_awarded: 0, needs_manual_grading: false };
  }
  if (MANUAL_TYPES.has(question.type)) {
    return { is_correct: null, points_awarded: null, needs_manual_grading: true };
  }
  const grader = GRADERS[question.type];
  if (!grader) return { is_correct: null, points_awarded: 0, needs_manual_grading: false };
  return { ...grader(question, response), needs_manual_grading: false };
}


// Human-readable correct answer for the instant-feedback panel. Empty string
// when there is no machine-checkable key (essay, short answer, likert).
function correctAnswerText(question) {
  const q = question.toObject ? question.toObject() : question;
  switch (q.type) {
    case 'mcq':
    case 'true_false':
    case 'select_list':
    case 'multi_response':
      return (q.options || []).filter((o) => o.is_correct).map((o) => o.text).join('; ');
    case 'numeric':
      return q.numeric_answer == null ? ''
        : `${q.numeric_answer}${q.numeric_tolerance ? ` (± ${q.numeric_tolerance})` : ''}`;
    case 'sequence':
      return (q.sequence_items || []).map((it, i) => `${i + 1}. ${it.text}`).join('  ');
    case 'matching':
      return (q.matching_pairs || []).map((p) => `${p.left} → ${p.right}`).join('; ');
    case 'fill_blank':
      return (q.blanks_answers || []).map((set, i) => `(${i + 1}) ${(set || [])[0] ?? ''}`).join('  ');
    case 'drag_words':
      return (q.drag_words_answers || []).map((w, i) => `(${i + 1}) ${w}`).join('  ');
    case 'drag_drop': {
      const targets = q.dragdrop_targets || [];
      return (q.dragdrop_items || [])
        .map((it) => `${it.label} → ${(targets[it.correct_target_index] || {}).label ?? '?'}`).join('; ');
    }
    case 'hotspot':
      return 'The correct area is highlighted on the image.';
    default:
      return '';
  }
}

// Feedback shown after the candidate checks one answer. Only ever built for a
// question whose answer is already locked.
function buildFeedback(question, entry) {
  return {
    question_id: String(question._id),
    is_correct: entry.is_correct,
    points_awarded: entry.points_awarded,
    max_points: UNSCORED_TYPES.has(question.type) ? 0 : question.points,
    needs_manual_grading: !!entry.needs_manual_grading,
    correct_answer: entry.needs_manual_grading ? '' : correctAnswerText(question),
    explanation: question.explanation || '',
    // Hotspot: the correct area(s), as % of the image, so the client can draw them.
    ...(question.type === 'hotspot' ? {
      correct_regions: (question.hotspot_regions || [])
        .filter((r) => r.is_correct)
        .map((r) => ({ shape: r.shape, x: r.x, y: r.y, width: r.width, height: r.height })),
    } : {}),
  };
}

// Running score over the answers checked so far (manual-review and survey
// questions have no instant score, so they are left out of both sides).
function buildProgress(questionsSnapshot, answers) {
  let score = 0; let max = 0; let checked = 0; let correct = 0; let incorrect = 0;
  (answers || []).forEach((a) => {
    if (!a.locked) return;
    checked += 1;
    const q = questionsSnapshot.find((qq) => String(qq._id) === String(a.question_id));
    if (!q || UNSCORED_TYPES.has(q.type) || MANUAL_TYPES.has(q.type)) return;
    max += q.points;
    score += a.points_awarded || 0;
    if (a.is_correct) correct += 1; else incorrect += 1;
  });
  return {
    score, max, checked, correct, incorrect,
    percentage: max > 0 ? Math.round((score / max) * 1000) / 10 : null,
  };
}

// Strips correct-answer fields so a question can be sent to the client while
// an attempt is in progress. Everything needed to *render* the question stays;
// everything needed to *know the answer* is removed.
function sanitizeQuestionForTaking(question) {
  const q = question.toObject ? question.toObject() : { ...question };
  const clean = {
    _id: q._id, type: q.type, prompt: q.prompt, image_url: q.image_url,
    images: (q.images || []).map((img) => ({ url: img.url })),
    points: q.points, order: q.order, section: q.section, time_limit_seconds: q.time_limit_seconds,
  };
  switch (q.type) {
    case 'mcq':
    case 'true_false':
    case 'select_list':
    case 'multi_response':
      clean.options = (q.options || []).map((o) => ({ _id: o._id, text: o.text, image_url: o.image_url }));
      break;
    case 'short_answer':
    case 'essay':
      clean.essay_min_words = q.essay_min_words;
      break;
    case 'numeric':
      break;
    case 'sequence': {
      // Shuffle for display; each item keeps its original index (`_idx`) so the
      // client can submit the chosen order back as an array of original indices.
      const withIdx = (q.sequence_items || []).map((item, idx) => ({ text: item.text, image_url: item.image_url, _idx: idx }));
      for (let i = withIdx.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [withIdx[i], withIdx[j]] = [withIdx[j], withIdx[i]];
      }
      clean.sequence_items = withIdx;
      break;
    }
    case 'matching':
      clean.matching_pairs = (q.matching_pairs || []).map((p) => ({ left: p.left }));
      clean.matching_right_options = (q.matching_pairs || []).map((p) => p.right);
      break;
    case 'fill_blank':
      clean.blanks_text = q.blanks_text;
      clean.blanks_count = (q.blanks_answers || []).length;
      break;
    case 'drag_words':
      clean.drag_words_text = q.drag_words_text;
      clean.drag_words_bank = q.drag_words_bank;
      break;
    case 'hotspot':
      clean.image_url = q.image_url;
      clean.hotspot_regions = (q.hotspot_regions || []).map((r) => ({ shape: r.shape }));
      break;
    case 'drag_drop':
      clean.image_url = q.image_url;
      clean.dragdrop_targets = (q.dragdrop_targets || []).map((t) => ({ label: t.label, x: t.x, y: t.y, width: t.width, height: t.height }));
      clean.dragdrop_items = (q.dragdrop_items || []).map((i) => ({ label: i.label }));
      break;
    case 'likert':
      clean.likert_statements = q.likert_statements;
      clean.likert_scale_labels = q.likert_scale_labels;
      break;
    default:
      break;
  }
  return clean;
}

// Computes final score/max_score/percentage for a finished attempt. When the
// exam defines a weight for every section actually used by its questions
// (via Exam.section_settings), the percentage is a weighted average of each
// section's own percentage instead of a flat points-sum — lets a small,
// high-value section (e.g. "Practical") count for more than its raw point
// total would otherwise give it. Falls back to a flat points-sum whenever
// weighting isn't fully configured, so existing exams are unaffected.
function computeAttemptScore(questionsSnapshot, answers, sectionSettings = []) {
  const bySection = {}; // section name -> { score, max }
  // First entry per question wins — the same one finalizeAttempt grades.
  const answerByQ = {};
  (answers || []).forEach((a) => { answerByQ[String(a.question_id)] ??= a; });

  questionsSnapshot.forEach((q) => {
    if (UNSCORED_TYPES.has(q.type)) return;
    const name = q.section || '';
    if (!bySection[name]) bySection[name] = { score: 0, max: 0 };
    bySection[name].max += q.points;
    const a = answerByQ[String(q._id)];
    bySection[name].score += (a && a.points_awarded) || 0;
  });

  const score = Object.values(bySection).reduce((sum, s) => sum + s.score, 0);
  const maxScore = Object.values(bySection).reduce((sum, s) => sum + s.max, 0);

  const weightByName = Object.fromEntries(
    (sectionSettings || []).filter((s) => s.weight != null && s.weight > 0).map((s) => [s.name || '', s.weight])
  );
  const sectionNames = Object.keys(bySection);
  const allWeighted = sectionNames.length > 0 && sectionNames.every((n) => weightByName[n] != null);

  if (!allWeighted) {
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
    return { score, maxScore, percentage };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  sectionNames.forEach((name) => {
    const { score: s, max: m } = bySection[name];
    if (!(m > 0)) return; // nothing to score in this section — don't count it as 0%
    const pct = (s / m) * 100;
    const w = weightByName[name];
    weightedSum += pct * w;
    totalWeight += w;
  });
  const percentage = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  return { score, maxScore, percentage };
}

// Auto-graded questions that can never be answered correctly because their
// answer key is missing (e.g. an MCQ with no option ticked as correct) —
// every candidate would silently be marked wrong. Returns human-readable
// problems, one per broken question; empty when the exam is gradable.
function answerKeyProblems(questions) {
  const problems = [];
  (questions || []).forEach((q, idx) => {
    const label = `Question ${idx + 1}${q.section ? ` (${q.section})` : ''}`;
    const filled = (s) => String(s ?? '').trim() !== '';
    let issue = null;
    switch (q.type) {
      case 'mcq':
      case 'true_false':
      case 'select_list':
      case 'multi_response':
        if (!(q.options || []).some((o) => o.is_correct)) issue = 'no option is marked as correct';
        break;
      case 'numeric':
        if (q.numeric_answer == null || Number.isNaN(Number(q.numeric_answer))) issue = 'no correct number is set';
        break;
      case 'sequence':
        if ((q.sequence_items || []).length < 2) issue = 'needs at least two items to order';
        break;
      case 'matching': {
        const pairs = q.matching_pairs || [];
        if (!pairs.length) issue = 'has no matching pairs';
        else if (pairs.some((p) => !filled(p.left) || !filled(p.right))) issue = 'a matching pair is missing a side';
        break;
      }
      case 'fill_blank': {
        const sets = q.blanks_answers || [];
        if (!sets.length || sets.some((set) => !(set || []).some(filled))) issue = 'a blank has no accepted answer';
        break;
      }
      case 'drag_words': {
        const words = q.drag_words_answers || [];
        if (!words.length || words.some((w) => !filled(w))) issue = 'a blank has no correct word';
        break;
      }
      case 'hotspot':
        if (!(q.hotspot_regions || []).some((r) => r.is_correct)) issue = 'no region is marked as correct';
        break;
      case 'drag_drop': {
        const items = q.dragdrop_items || [];
        const targets = (q.dragdrop_targets || []).length;
        const labels = items.map((it) => it.label);
        if (!items.length) issue = 'has no items to drag';
        else if (items.some((it) => !(it.correct_target_index >= 0 && it.correct_target_index < targets))) issue = 'an item has no valid target';
        else if (new Set(labels).size !== labels.length) issue = 'two items share the same label';
        break;
      }
      default:
        break; // essay / short_answer (manual) and likert (unscored) need no key
    }
    if (!issue && !UNSCORED_TYPES.has(q.type) && !(Number(q.points) >= 0)) issue = 'points must be 0 or more';
    if (issue) problems.push(`${label}: ${issue}.`);
  });
  return problems;
}

module.exports = {
  answerKeyProblems,
  gradeAnswer,
  sanitizeQuestionForTaking,
  computeAttemptScore,
  buildFeedback,
  buildProgress,
  MANUAL_TYPES,
  UNSCORED_TYPES,
};
