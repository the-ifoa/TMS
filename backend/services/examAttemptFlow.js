const Exam = require('../models/Exam');
const { gradeAnswer, computeAttemptScore } = require('./examGrading');

// Returns an error message if the exam isn't open for new attempts right now,
// or null if it's fine to start one. Only gates NEW attempts — an attempt
// already in progress is unaffected by closes_at passing mid-way.
function schedulingError(exam, { ignoreClose = false } = {}) {
  const now = new Date();
  if (exam.opens_at && now < exam.opens_at) {
    return `This exam opens on ${exam.opens_at.toLocaleString()}.`;
  }
  if (!ignoreClose && exam.closes_at && now > exam.closes_at) {
    return `This exam closed on ${exam.closes_at.toLocaleString()}.`;
  }
  return null;
}

// Grades every question in an in-progress attempt and mutates it into its
// final submitted/pending_review state. Shared by the authed submit/violation
// endpoints (routes/exams.js) and the public token flow (routes/publicExam.js).
// Does not save() — the caller persists.
async function finalizeAttempt(attempt) {
  let hasPending = false;

  attempt.questions_snapshot.forEach((question) => {
    const answerEntry = attempt.answers.find((a) => String(a.question_id) === String(question._id));
    const response = answerEntry ? answerEntry.response : null;
    const graded = gradeAnswer(question, response);

    if (answerEntry) {
      answerEntry.is_correct = graded.is_correct;
      answerEntry.points_awarded = graded.points_awarded;
      answerEntry.needs_manual_grading = graded.needs_manual_grading;
    } else {
      attempt.answers.push({
        question_id: question._id, type: question.type, response: null,
        is_correct: graded.is_correct, points_awarded: graded.points_awarded,
        needs_manual_grading: graded.needs_manual_grading,
      });
    }
    if (graded.needs_manual_grading) hasPending = true;
  });

  attempt.submitted_at = new Date();
  attempt.time_taken_seconds = Math.round((attempt.submitted_at - attempt.started_at) / 1000);

  const exam = await Exam.findById(attempt.exam_id).select('pass_percentage section_settings');
  const { score, maxScore, percentage } = computeAttemptScore(
    attempt.questions_snapshot, attempt.answers, exam ? exam.section_settings : []
  );
  attempt.max_score = maxScore;

  if (hasPending) {
    attempt.status = 'pending_review';
  } else {
    attempt.status = 'submitted';
    attempt.score = score;
    attempt.percentage = percentage;
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 75);
  }
}

// Closes (grades + submits) a participant's in-progress attempts on an exam so
// they can never be resumed. `onlyExpired` limits it to attempts whose own
// duration already ran out — those can't be continued anyway and would
// otherwise reopen at 0:00 and submit instantly. Returns how many were closed.
async function closeOpenAttempts(exam, participantId, { onlyExpired = false } = {}) {
  const ExamAttempt = require('../models/ExamAttempt');
  const open = await ExamAttempt.find({ exam_id: exam._id, participant_id: participantId, status: 'in_progress' });
  const now = Date.now();
  let closed = 0;
  for (const attempt of open) {
    if (onlyExpired) {
      if (!(exam.duration_minutes > 0)) continue;
      const deadline = new Date(attempt.started_at).getTime() + exam.duration_minutes * 60000;
      if (now < deadline + 60000) continue; // 1 min grace for a final autosave/submit
    }
    await finalizeAttempt(attempt);
    await attempt.save();
    closed += 1;
  }
  return closed;
}

module.exports = { finalizeAttempt, schedulingError, closeOpenAttempts };
