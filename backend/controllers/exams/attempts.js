const Exam = require('../../models/Exam');
const ExamAttempt = require('../../models/ExamAttempt');
const Participant = require('../../models/Participant');
const { sanitizeQuestionForTaking, computeAttemptScore } = require('../../services/examGrading');
const {
  schedulingError, lockedFeedback, SAVE_PROJECTION, attemptDeadlinePassed, saveAnswers,
  submitAttemptOnce, recordViolation, checkAnswerAtomic, dedupeAnswers, shuffle,
} = require('../../services/examAttemptFlow');

// Loads an attempt (optionally projected + lean) and checks the caller may write to it.
async function loadWritableAttempt(req, res, projection = null) {
  const query = ExamAttempt.findById(req.params.attemptId);
  if (projection) query.select(projection).lean();
  const attempt = await query;
  if (!attempt) { res.status(404).json({ error: 'Attempt not found.' }); return null; }
  if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
    res.status(403).json({ error: 'Access denied.' }); return null;
  }
  return attempt;
}

// Shared by the single-answer and batch autosave endpoints (atomic writes —
// parallel saves can't collide; see services/examAttemptFlow.js).
async function saveForAttempt(req, res, answers, timers) {
  const attempt = await loadWritableAttempt(req, res, SAVE_PROJECTION);
  if (!attempt) return null;
  if (attempt.status !== 'in_progress') { res.status(400).json({ error: 'This attempt has already been submitted.', submitted: true }); return null; }
  const exam = await Exam.findById(attempt.exam_id).select('duration_minutes').lean();
  if (attemptDeadlinePassed(attempt, exam)) { res.status(400).json({ error: 'Time is up for this exam.', time_up: true }); return null; }
  return saveAnswers(attempt, answers, timers);
}
const { accessibleParticipantFilter } = require('../internalCertificatesController');
const { isAdmin, ownsExam, attemptScopeFilter, canReadAttempt } = require('./access');
const { certificateSummary } = require('./attemptCertificates');

// ─── GET /exams/attempts — list attempts ─────────────────────────────────────────
exports.listAttempts = async (req, res) => {
  try {
    const filter = await attemptScopeFilter(req);

    // The list never shows questions or answers (grading fetches the full
    // attempt on demand), so don't pull those heavy arrays out of the DB.
    const attempts = await ExamAttempt.find(filter)
      .select('-questions_snapshot -answers')
      .sort({ created_at: -1 });
    // Candidate emails — the UI needs them to offer "email certificate".
    const people = await Participant.find({ _id: { $in: attempts.map((a) => a.participant_id) } }).select('email').lean();
    const emailById = Object.fromEntries(people.map((p) => [String(p._id), p.email || '']));
    res.json(attempts.map((a) => {
      const json = a.toJSON();
      json.participant_email = emailById[String(a.participant_id)] || '';
      json.certificate = certificateSummary(a);
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId — resume in-progress attempt (sanitized) ────
exports.getAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const json = attempt.toJSON();
    if (attempt.status === 'in_progress') {
      json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
      json.answers = json.answers.map((a) => ({ question_id: a.question_id, type: a.type, response: a.response, edited_at: a.edited_at ?? null }));
      json.server_now = new Date(); // lets the client correct for a skewed clock
      // Instant-feedback exams: restore the already-checked (locked) answers on resume.
      const examDoc = await Exam.findById(attempt.exam_id).select('instant_feedback');
      if (examDoc && examDoc.instant_feedback) Object.assign(json, lockedFeedback(attempt));
    }
    res.json(json);
  } catch (err) {
    console.error('GET /exams/attempts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId/result — full result incl. correct answers ──
exports.getAttemptResult = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!(await canReadAttempt(req, attempt))) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status === 'in_progress') {
      return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    }
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('GET /exams/attempts/:id/result error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/participants/:participantId/performance — cross-exam profile ────
// Admin: any participant. Airline: the participants it can see (see
// internalCertificatesController.accessibleParticipantFilter).
exports.participantPerformance = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.participantId);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });
    if (!isAdmin(req)) {
      // Own candidates, a top-level airline's departments' candidates, and
      // owner-less legacy records matched by airline name.
      const visible = await Participant.exists({ $and: [{ _id: participant._id }, accessibleParticipantFilter(req) || {}] });
      if (!visible) return res.status(403).json({ error: 'Access denied.' });
    }

    // Only what the report reads — skip question text, options and responses.
    const attempts = await ExamAttempt.find({
      participant_id: participant._id,
      status: { $ne: 'in_progress' },
    })
      .select([
        'exam_id', 'exam_title_snapshot', 'attempt_number', 'percentage', 'passed', 'status',
        'submitted_at', 'time_taken_seconds',
        'answers.question_id', 'answers.type', 'answers.is_correct', 'answers.needs_manual_grading',
        'questions_snapshot._id', 'questions_snapshot.section',
      ].join(' '))
      .sort({ submitted_at: 1 });

    // Aggregate every scored answer across every finished attempt, broken
    // down by section (where in the syllabus they lag) and by question type
    // (what kind of question trips them up).
    // Each attempt also keeps its own per-section tally so the report can be
    // narrowed to a single exam on the client.
    const bySection = {};
    const byType = {};
    const attemptSections = new Map();
    attempts.forEach((a) => {
      const own = {};
      attemptSections.set(String(a._id), own);
      a.answers.forEach((ans) => {
        if (ans.needs_manual_grading || ans.is_correct == null) return;
        const q = a.questions_snapshot.id(ans.question_id);
        const sectionName = q ? (q.section || '') : '';

        if (!bySection[sectionName]) bySection[sectionName] = { section: sectionName, total: 0, correct: 0 };
        bySection[sectionName].total += 1;
        if (ans.is_correct) bySection[sectionName].correct += 1;

        if (!own[sectionName]) own[sectionName] = { section: sectionName, total: 0, correct: 0 };
        own[sectionName].total += 1;
        if (ans.is_correct) own[sectionName].correct += 1;

        if (!byType[ans.type]) byType[ans.type] = { type: ans.type, total: 0, correct: 0 };
        byType[ans.type].total += 1;
        if (ans.is_correct) byType[ans.type].correct += 1;
      });
    });
    const withAccuracy = (obj) => Object.values(obj)
      .map((s) => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 10000) / 100 : null }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)); // weakest first

    const exams = await Exam.find({ _id: { $in: [...new Set(attempts.map((a) => String(a.exam_id)))] } }).select('pass_percentage');
    const passMark = new Map(exams.map((e) => [String(e._id), e.pass_percentage]));

    const scored = attempts.filter((a) => a.percentage != null);
    res.json({
      participant: { id: String(participant._id), name: participant.participant_name, company: participant.company },
      overall: {
        total_exams_taken: attempts.length,
        avg_percentage: scored.length > 0
          ? Math.round((scored.reduce((sum, a) => sum + a.percentage, 0) / scored.length) * 100) / 100
          : null,
        passed_count: attempts.filter((a) => a.passed === true).length,
        failed_count: attempts.filter((a) => a.passed === false).length,
      },
      attempts: attempts.map((a) => ({
        id: String(a._id), exam_id: String(a.exam_id), exam_title: a.exam_title_snapshot,
        attempt_number: a.attempt_number, percentage: a.percentage, passed: a.passed, status: a.status,
        submitted_at: a.submitted_at, time_taken_seconds: a.time_taken_seconds,
        pass_percentage: passMark.get(String(a.exam_id)) ?? null,
        sections: Object.values(attemptSections.get(String(a._id)) || {}),
      })),
      section_breakdown: withAccuracy(bySection),
      type_breakdown: withAccuracy(byType),
    });
  } catch (err) {
    console.error('GET /exams/participants/:id/performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/attempts/:attemptId/answer — autosave one answer ────────────────
exports.saveAttemptAnswer = async (req, res) => {
  try {
    const { question_id, response } = req.body;
    const result = await saveForAttempt(req, res, [{ question_id, response }]);
    if (!result) return;
    const skip = result.skipped[0];
    if (skip && skip.reason === 'locked') return res.status(409).json({ error: 'This answer has been checked and can no longer be changed.', locked: true });
    if (skip) return res.status(404).json({ error: 'Question not found in this attempt.' });
    res.json({ saved: true });
  } catch (err) {
    console.error('PUT /exams/attempts/:id/answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/attempts/:attemptId/answers — autosave a batch ─────────────────
// Body: { answers: [{ question_id, response }], timers: { key: seconds } }.
exports.saveAttemptAnswers = async (req, res) => {
  try {
    const { answers = [], timers = null } = req.body || {};
    if (!Array.isArray(answers) || answers.length > 500) return res.status(400).json({ error: 'Invalid answers.' });
    const result = await saveForAttempt(req, res, answers, timers);
    if (!result) return;
    res.json({ saved: true, ...result });
  } catch (err) {
    console.error('PUT /exams/attempts/:id/answers error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/check — instant feedback for one answer ────
// Grades the answer, locks it (no more edits) and returns right/wrong, the
// correct answer, the explanation and the running score. Only for exams that
// have instant feedback switched on.
exports.checkAttemptAnswer = async (req, res) => {
  try {
    const attempt = await loadWritableAttempt(req, res, 'status exam_id airline_id started_at');
    if (!attempt) return;
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.', submitted: true });
    }
    const exam = await Exam.findById(attempt.exam_id).select('instant_feedback duration_minutes').lean();
    if (!exam || !exam.instant_feedback) {
      return res.status(400).json({ error: 'Instant feedback is not enabled for this exam.' });
    }
    if (attemptDeadlinePassed(attempt, exam)) return res.status(400).json({ error: 'Time is up for this exam.', time_up: true });
    const { question_id, response } = req.body;
    const result = await checkAnswerAtomic(attempt._id, question_id, response);
    if (!result) return res.status(404).json({ error: 'Question not found in this attempt.' });
    res.json(result);
  } catch (err) {
    console.error('POST /exams/attempts/:id/check error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/submit — grade + finalize ──────────────────
exports.submitAttempt = async (req, res) => {
  try {
    const own = await loadWritableAttempt(req, res, 'status airline_id');
    if (!own) return;
    // Idempotent: an already-submitted attempt is returned as-is instead of an error.
    const { attempt, alreadySubmitted } = await submitAttemptOnce(own._id);
    res.json({ ...attempt.toJSON(), already_submitted: alreadySubmitted });
  } catch (err) {
    console.error('POST /exams/attempts/:id/submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/violation — record a lockdown-mode violation ─
// (fullscreen exit, tab switch, ...). Auto-submits the attempt once the exam's
// max_violations threshold is reached.
exports.reportViolation = async (req, res) => {
  try {
    const attempt = await loadWritableAttempt(req, res, 'status exam_id airline_id violation_count');
    if (!attempt) return;
    if (attempt.status !== 'in_progress') {
      return res.json({ violation_count: attempt.violation_count || 0, auto_submitted_now: false }); // already finished
    }

    const { type } = req.body;
    const validTypes = ['fullscreen_exit', 'tab_switch', 'devtools_suspected'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid violation type.' });

    const exam = await Exam.findById(attempt.exam_id).select('max_violations allow_tab_switch').lean();
    if (type === 'tab_switch' && exam?.allow_tab_switch) {
      return res.json({ violation_count: attempt.violation_count || 0, auto_submitted_now: false });
    }
    const result = await recordViolation(attempt._id, type, exam?.max_violations ?? 4);
    if (!result) return res.status(404).json({ error: 'Attempt not found.' });
    res.json(result);
  } catch (err) {
    console.error('POST /exams/attempts/:id/violation error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PUT /exams/attempts/:attemptId/grade — admin manually grades pending items ─
exports.gradeAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req)) {
      const ownerExam = await Exam.findById(attempt.exam_id).select('owner_airline owner_department');
      if (!ownerExam || !ownsExam(req, ownerExam)) return res.status(403).json({ error: 'Access denied.' });
    }
    // Admin can grade a pending attempt AND override points on an already
    // scored one (submitted/graded) — never touch an in-progress attempt.
    if (attempt.status === 'in_progress') {
      return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    }

    const { answers = [], total_override } = req.body; // [{ question_id, points_awarded, feedback }]
    dedupeAnswers(attempt); // a leftover duplicate would stay "needs grading" forever
    answers.forEach(({ question_id, points_awarded, feedback }) => {
      const entry = attempt.answers.find((a) => String(a.question_id) === String(question_id));
      if (!entry) return;
      const question = attempt.questions_snapshot.id(question_id);
      const capped = Math.max(0, Math.min(Number(points_awarded) || 0, question ? question.points : Infinity));
      entry.points_awarded = capped;
      entry.is_correct = question ? capped >= question.points : null;
      entry.needs_manual_grading = false;
      entry.feedback = feedback || '';
    });

    const stillPending = attempt.answers.some((a) => a.needs_manual_grading);
    if (stillPending) {
      return res.status(400).json({ error: 'Not all manually-graded questions have a score yet.' });
    }

    // Normally the total is the sum of every question's points_awarded (or a
    // weighted-by-section percentage, if the exam configures section
    // weights). An admin can instead directly override the total (e.g. a
    // blanket adjustment) — the per-question points above are still saved
    // for the record, but the final score/percentage use the override value,
    // and weighting doesn't apply since a single override can't be
    // decomposed back into per-section shares.
    const exam = await Exam.findById(attempt.exam_id).select('pass_percentage section_settings');
    const summedScore = attempt.answers.reduce((sum, a) => sum + (a.points_awarded || 0), 0);

    let score;
    let percentage;
    if (total_override != null) {
      score = Math.max(0, Math.min(Number(total_override) || 0, attempt.max_score || summedScore));
      percentage = attempt.max_score > 0 ? Math.round((score / attempt.max_score) * 10000) / 100 : 0;
    } else {
      const computed = computeAttemptScore(attempt.questions_snapshot, attempt.answers, exam ? exam.section_settings : []);
      score = computed.score;
      percentage = computed.percentage;
    }

    attempt.score = score;
    attempt.percentage = percentage;
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 75);
    attempt.status = 'graded';
    attempt.graded_by = req.admin.id;
    attempt.graded_at = new Date();

    await attempt.save();
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('PUT /exams/attempts/:id/grade error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/attempts — start an attempt (airline, on behalf of a participant) ──
exports.startAttempt = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'This exam is not published yet.' });
    const schedErr = schedulingError(exam);
    if (schedErr) return res.status(403).json({ error: schedErr });

    const { participant_id } = req.body;
    if (!participant_id) return res.status(400).json({ error: 'participant_id is required.' });

    const assignment = exam.assignments.find((a) => String(a.participant_id) === String(participant_id));
    if (!assignment) return res.status(403).json({ error: 'This participant is not assigned to this exam.' });
    if (!isAdmin(req) && String(assignment.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Resume the open attempt instead of creating a second one.
    const open = await ExamAttempt.findOne({ exam_id: exam._id, participant_id, status: 'in_progress' });
    if (open) {
      const json = open.toJSON();
      json.questions_snapshot = open.questions_snapshot.map(sanitizeQuestionForTaking);
      json.answers = json.answers.map((a) => ({ question_id: a.question_id, type: a.type, response: a.response, edited_at: a.edited_at ?? null }));
      json.server_now = new Date();
      return res.json(json);
    }

    const priorAttempts = await ExamAttempt.countDocuments({ exam_id: exam._id, participant_id });
    if (priorAttempts >= exam.max_attempts) {
      return res.status(400).json({ error: 'Maximum attempts reached for this exam.' });
    }

    const participant = await Participant.findById(participant_id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    let questions = exam.questions.map((q) => q.toObject());
    if (exam.shuffle_questions) questions = shuffle(questions);

    let attempt;
    try {
      attempt = await ExamAttempt.create({
        exam_id: exam._id,
        exam_title_snapshot: exam.title,
        participant_id: participant._id,
        participant_name: participant.participant_name,
        airline_id: assignment.airline_id,
        attempt_number: priorAttempts + 1,
        questions_snapshot: questions,
        status: 'in_progress',
        started_at: new Date(),
      });
    } catch (err) {
      // Two Start clicks raced: the unique open-attempt index let one through.
      if (err.code !== 11000) throw err;
      attempt = await ExamAttempt.findOne({ exam_id: exam._id, participant_id, status: 'in_progress' });
      if (!attempt) throw err;
    }

    const json = attempt.toJSON();
    json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
    json.server_now = new Date(); // lets the client correct for a skewed clock
    res.status(201).json(json);
  } catch (err) {
    console.error('POST /exams/:id/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
