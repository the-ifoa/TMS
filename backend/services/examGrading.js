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
  const chosen = Array.isArray(response) ? response.map(String) : [];
  const isCorrect =
    correctIds.length > 0 &&
    correctIds.length === chosen.length &&
    correctIds.every((id) => chosen.includes(id));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeNumeric(question, response) {
  const num = Number(response);
  if (Number.isNaN(num) || question.numeric_answer == null) {
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
    pairs.every((pair, idx) => normalize(chosen[idx]) === normalize(pair.right));
  return { is_correct: isCorrect, points_awarded: isCorrect ? question.points : 0 };
}

function gradeFillBlank(question, response) {
  const answerSets = question.blanks_answers || [];
  const filled = Array.isArray(response) ? response : [];
  const allCorrect =
    answerSets.length > 0 &&
    answerSets.every((accepted, idx) => (accepted || []).some((a) => normalize(a) === normalize(filled[idx])));
  return { is_correct: allCorrect, points_awarded: allCorrect ? question.points : 0 };
}

function gradeDragWords(question, response) {
  const answers = question.drag_words_answers || [];
  const filled = Array.isArray(response) ? response : [];
  const allCorrect =
    answers.length > 0 && answers.every((word, idx) => normalize(word) === normalize(filled[idx]));
  return { is_correct: allCorrect, points_awarded: allCorrect ? question.points : 0 };
}

function pointInRegion(point, region) {
  if (!point) return false;
  const { x, y } = point;
  if (region.shape === 'circle') {
    const dx = x - region.x;
    const dy = y - region.y;
    return Math.sqrt(dx * dx + dy * dy) <= region.width; // width doubles as radius
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

// Strips correct-answer fields so a question can be sent to the client while
// an attempt is in progress. Everything needed to *render* the question stays;
// everything needed to *know the answer* is removed.
function sanitizeQuestionForTaking(question) {
  const q = question.toObject ? question.toObject() : { ...question };
  const clean = {
    _id: q._id, type: q.type, prompt: q.prompt, image_url: q.image_url,
    points: q.points, order: q.order, section: q.section,
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

module.exports = {
  gradeAnswer,
  sanitizeQuestionForTaking,
  MANUAL_TYPES,
  UNSCORED_TYPES,
};
