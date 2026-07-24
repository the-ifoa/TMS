const Exam = require('../models/Exam');
const { gradeAnswer, UNSCORED_TYPES } = require('./examGrading');

// Grades every question in an in-progress attempt and mutates it into its
// final submitted/pending_review state. Shared by the authed submit/violation
// endpoints (routes/exams.js) and the public token flow (routes/publicExam.js).
// Does not save() — the caller persists.
async function finalizeAttempt(attempt) {
  let maxScore = 0;
  let score = 0;
  let hasPending = false;

  attempt.questions_snapshot.forEach((question) => {
    if (!UNSCORED_TYPES.has(question.type)) maxScore += question.points;

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
    else score += graded.points_awarded || 0;
  });

  attempt.submitted_at = new Date();
  attempt.time_taken_seconds = Math.round((attempt.submitted_at - attempt.started_at) / 1000);
  attempt.max_score = maxScore;

  if (hasPending) {
    attempt.status = 'pending_review';
  } else {
    attempt.status = 'submitted';
    attempt.score = score;
    attempt.percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
    const exam = await Exam.findById(attempt.exam_id).select('pass_percentage');
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 60);
  }
}

module.exports = { finalizeAttempt };
