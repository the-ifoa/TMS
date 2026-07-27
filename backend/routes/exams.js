const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ExamInvite = require('../models/ExamInvite');
const Airline = require('../models/Airline');
const Participant = require('../models/Participant');
const { authMiddleware } = require('./auth');
const { examImageUpload, deleteCloudinaryImage } = require('../services/upload');
const { sanitizeQuestionForTaking } = require('../services/examGrading');
const { finalizeAttempt } = require('../services/examAttemptFlow');
const { sendExamInviteEmail } = require('../services/emailService');

router.use(authMiddleware);

function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

async function deleteExamImages(exam) {
  const ids = [];
  exam.questions.forEach((q) => {
    if (q.image_public_id) ids.push(q.image_public_id);
    (q.options || []).forEach((o) => o.image_public_id && ids.push(o.image_public_id));
  });
  await Promise.all(ids.map((id) => deleteCloudinaryImage(id)));
}

// ─── GET /exams/airlines — admin only: airlines with participants, for assigning ──
router.get('/airlines', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });

    const airlines     = await Airline.find({}).sort({ airlineName: 1 });
    const participants = await Participant.find({}).sort({ created_at: -1 });

    const result = airlines.map((a) => ({
      airline: a.toJSON(),
      participants: participants
        .filter(
          (p) =>
            (p.submitted_by && String(p.submitted_by) === String(a._id)) ||
            (!p.submitted_by && (p.company === a.airlineName || p.airline_name === a.airlineName))
        )
        .map((p) => ({ _id: String(p._id), participant_name: p.participant_name, training_type: p.training_type, email: p.email || '' })),
    }));

    res.json(result.filter((r) => r.participants.length > 0));
  } catch (err) {
    console.error('GET /exams/airlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/airline-results — airline: their participants' invite + score status ──
// Defined BEFORE `GET /exams/:id` so the literal path isn't captured as an :id.
router.get('/airline-results', async (req, res) => {
  try {
    if (isAdmin(req)) return res.status(403).json({ error: 'Airline access required.' });
    const invites = await ExamInvite.find({ airline_id: req.admin.id }).sort({ created_at: -1 });
    const attemptIds = invites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status submitted_at time_taken_seconds');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    res.json(invites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.attempt = att
        ? {
            id: String(att._id),
            score: att.score, max_score: att.max_score, percentage: att.percentage,
            passed: att.passed, status: att.status, submitted_at: att.submitted_at,
            time_taken_seconds: att.time_taken_seconds,
          }
        : null;
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/airline-results error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/assigned — airline: exams assigned to their participants ─────────
router.get('/assigned', async (req, res) => {
  try {
    if (isAdmin(req)) return res.status(403).json({ error: 'Airline access required.' });

    const exams = await Exam.find({
      status: 'published',
      'assignments.airline_id': req.admin.id,
    }).sort({ created_at: -1 });

    const examIds = exams.map((e) => e._id);
    const attempts = await ExamAttempt.find({ exam_id: { $in: examIds }, airline_id: req.admin.id });
    const participantIds = [...new Set(exams.flatMap((e) => e.assignments.map((a) => String(a.participant_id))))];
    const participants = await Participant.find({ _id: { $in: participantIds } }).select('participant_name');
    const nameById = Object.fromEntries(participants.map((p) => [String(p._id), p.participant_name]));

    const result = exams.map((e) => {
      const json = e.toJSON();
      json.questions = undefined; // list view doesn't need the question bank
      const myAssignments = e.assignments.filter((a) => String(a.airline_id) === String(req.admin.id));
      json.assignments = myAssignments.map((a) => {
        const participantAttempts = attempts
          .filter((att) => String(att.participant_id) === String(a.participant_id) && String(att.exam_id) === String(e._id))
          .sort((x, y) => y.attempt_number - x.attempt_number);
        return {
          participant_id: a.participant_id,
          participant_name: nameById[String(a.participant_id)] || '',
          latest_attempt: participantAttempts[0] ? participantAttempts[0].toJSON() : null,
          attempts_used: participantAttempts.length,
        };
      });
      return json;
    });

    res.json(result);
  } catch (err) {
    console.error('GET /exams/assigned error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/attempts — list attempts ─────────────────────────────────────────
router.get('/attempts', async (req, res) => {
  try {
    const filter = {};
    if (req.query.exam_id) filter.exam_id = req.query.exam_id;
    if (!isAdmin(req)) filter.airline_id = req.admin.id;

    const attempts = await ExamAttempt.find(filter).sort({ created_at: -1 });
    res.json(attempts.map((a) => {
      const json = a.toJSON();
      json.questions_snapshot = undefined; // list view, keep it light
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/attempts/:attemptId — resume in-progress attempt (sanitized) ────
router.get('/attempts/:attemptId', async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const json = attempt.toJSON();
    if (attempt.status === 'in_progress') {
      json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
      json.answers = json.answers.map((a) => ({ question_id: a.question_id, type: a.type, response: a.response }));
    }
    res.json(json);
  } catch (err) {
    console.error('GET /exams/attempts/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/attempts/:attemptId/result — full result incl. correct answers ──
router.get('/attempts/:attemptId/result', async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
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
});

// ─── PUT /exams/attempts/:attemptId/answer — autosave one answer ────────────────
router.put('/attempts/:attemptId/answer', async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.' });
    }

    const { question_id, response } = req.body;
    const question = attempt.questions_snapshot.id(question_id);
    if (!question) return res.status(404).json({ error: 'Question not found in this attempt.' });

    const existing = attempt.answers.find((a) => String(a.question_id) === String(question_id));
    if (existing) {
      existing.response = response;
    } else {
      attempt.answers.push({ question_id, type: question.type, response });
    }
    await attempt.save();
    res.json({ saved: true });
  } catch (err) {
    console.error('PUT /exams/attempts/:id/answer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/attempts/:attemptId/submit — grade + finalize ──────────────────
router.post('/attempts/:attemptId/submit', async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'This attempt has already been submitted.' });
    }

    await finalizeAttempt(attempt);
    await attempt.save();
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('POST /exams/attempts/:id/submit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/attempts/:attemptId/violation — record a lockdown-mode violation ─
// (fullscreen exit, tab switch, ...). Auto-submits the attempt once the exam's
// max_violations threshold is reached.
router.post('/attempts/:attemptId/violation', async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req) && String(attempt.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (attempt.status !== 'in_progress') {
      return res.json(attempt.toJSON()); // already finished — nothing to do
    }

    const { type } = req.body;
    const validTypes = ['fullscreen_exit', 'tab_switch', 'devtools_suspected'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid violation type.' });

    attempt.violations.push({ type, at: new Date() });
    attempt.violation_count = attempt.violations.length;

    const exam = await Exam.findById(attempt.exam_id).select('max_violations');
    const maxViolations = exam?.max_violations ?? 4;

    let autoSubmitted = false;
    if (attempt.violation_count >= maxViolations) {
      attempt.auto_submitted = true;
      await finalizeAttempt(attempt);
      autoSubmitted = true;
    }

    await attempt.save();
    res.json({ ...attempt.toJSON(), auto_submitted_now: autoSubmitted });
  } catch (err) {
    console.error('POST /exams/attempts/:id/violation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /exams/attempts/:attemptId/grade — admin manually grades pending items ─
router.put('/attempts/:attemptId/grade', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    // Admin can grade a pending attempt AND override points on an already
    // scored one (submitted/graded) — never touch an in-progress attempt.
    if (attempt.status === 'in_progress') {
      return res.status(400).json({ error: 'Attempt has not been submitted yet.' });
    }

    const { answers = [], total_override } = req.body; // [{ question_id, points_awarded, feedback }]
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

    // Normally the total is the sum of every question's points_awarded. An
    // admin can instead directly override the total (e.g. a blanket
    // adjustment) — the per-question points above are still saved for the
    // record, but the final score/percentage use the override value.
    const summedScore = attempt.answers.reduce((sum, a) => sum + (a.points_awarded || 0), 0);
    const score = total_override != null
      ? Math.max(0, Math.min(Number(total_override) || 0, attempt.max_score || summedScore))
      : summedScore;
    const exam = await Exam.findById(attempt.exam_id).select('pass_percentage');

    attempt.score = score;
    attempt.percentage = attempt.max_score > 0 ? Math.round((score / attempt.max_score) * 10000) / 100 : 0;
    attempt.passed = attempt.percentage >= (exam ? exam.pass_percentage : 60);
    attempt.status = 'graded';
    attempt.graded_by = req.admin.id;
    attempt.graded_at = new Date();

    await attempt.save();
    res.json(attempt.toJSON());
  } catch (err) {
    console.error('PUT /exams/attempts/:id/grade error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/questions/upload-image — admin uploads a question image ────────
router.post('/questions/upload-image', examImageUpload.single('image'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
    res.json({ url: req.file.path, public_id: req.file.filename });
  } catch (err) {
    console.error('POST /exams/questions/upload-image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /exams/questions/image/:publicId — admin removes an unsaved upload ──
router.delete('/questions/image/:publicId', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    await deleteCloudinaryImage(req.params.publicId);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /exams/questions/image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams — list exams ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let exams;
    if (isAdmin(req)) {
      exams = await Exam.find({}).sort({ created_at: -1 });
    } else {
      exams = await Exam.find({ status: 'published', 'assignments.airline_id': req.admin.id }).sort({ created_at: -1 });
    }
    res.json(exams.map((e) => e.toJSON()));
  } catch (err) {
    console.error('GET /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams — create (admin, draft) ──────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.title) return res.status(400).json({ error: 'title is required.' });

    const exam = await Exam.create({ ...req.body, created_by: req.admin.id, status: 'draft' });
    res.status(201).json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/:id — single exam ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    if (!isAdmin(req)) {
      const assigned = exam.assignments.some((a) => String(a.airline_id) === String(req.admin.id));
      if (exam.status !== 'published' || !assigned) return res.status(403).json({ error: 'Access denied.' });
      const json = exam.toJSON();
      json.questions = json.questions.map(sanitizeQuestionForTaking);
      return res.json(json);
    }
    res.json(exam.toJSON());
  } catch (err) {
    console.error('GET /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /exams/:id — update meta + questions (admin) ─────────────────────────
router.put('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const { created_by, _id, id, assignments, status, ...updatable } = req.body;
    Object.assign(exam, updatable);
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('PUT /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/:id/publish — draft/archived -> published (admin) ───────────
router.post('/:id/publish', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.questions.length === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });

    exam.status = 'published';
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams/:id/publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/:id/assign — assign to participants (admin) ─────────────────
router.post('/:id/assign', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const { participant_ids = [] } = req.body;
    const participants = await Participant.find({ _id: { $in: participant_ids } });

    participants.forEach((p) => {
      const already = exam.assignments.some((a) => String(a.participant_id) === String(p._id));
      if (!already) {
        exam.assignments.push({ participant_id: p._id, airline_id: p.submitted_by });
      }
    });

    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams/:id/assign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/:id/send-invites — admin emails the take-link to participants ──
// Ensures each participant is assigned, creates/refreshes their ExamInvite (one
// per participant, stable token), and emails the passwordless take link.
router.post('/:id/send-invites', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'Publish the exam before sending invites.' });

    const { participant_ids = [] } = req.body;
    if (participant_ids.length === 0) return res.status(400).json({ error: 'Select at least one participant.' });

    const participants = await Participant.find({ _id: { $in: participant_ids } });
    const airlines = await Airline.find({});
    const airlineName = (id) => airlines.find((a) => String(a._id) === String(id))?.airlineName || '';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const sent = [];
    const skipped = [];
    // One batch per send action — every invite dispatched in this call shares it.
    const batchId = crypto.randomBytes(8).toString('hex');

    for (const p of participants) {
      if (!p.email) { skipped.push({ id: String(p._id), name: p.participant_name, reason: 'no email' }); continue; }

      // Make sure the participant is assigned (send implies assign).
      const alreadyAssigned = exam.assignments.some((a) => String(a.participant_id) === String(p._id));
      if (!alreadyAssigned) exam.assignments.push({ participant_id: p._id, airline_id: p.submitted_by });

      let invite = await ExamInvite.findOne({ exam_id: exam._id, participant_id: p._id });
      if (!invite) {
        invite = new ExamInvite({
          token: crypto.randomBytes(24).toString('hex'),
          exam_id: exam._id,
          exam_title_snapshot: exam.title,
          participant_id: p._id,
          participant_name: p.participant_name,
          participant_email: p.email,
          airline_id: p.submitted_by,
          airline_name: airlineName(p.submitted_by),
          batch_id: batchId,
        });
      } else {
        invite.participant_email = p.email;
        invite.participant_name = p.participant_name;
        invite.exam_title_snapshot = exam.title;
        invite.sent_at = new Date();
        invite.sent_count = (invite.sent_count || 1) + 1;
        invite.batch_id = batchId; // re-sending moves it into the new batch
      }
      await invite.save();

      try {
        await sendExamInviteEmail({
          toEmail: p.email,
          participantName: p.participant_name,
          examTitle: exam.title,
          durationMinutes: exam.duration_minutes,
          maxAttempts: exam.max_attempts,
          link: `${frontendUrl}/exam/${invite.token}`,
        });
        sent.push({ id: String(p._id), name: p.participant_name, email: p.email });
      } catch (mailErr) {
        skipped.push({ id: String(p._id), name: p.participant_name, reason: mailErr.message });
      }
    }

    await exam.save();
    res.json({ sent, skipped });
  } catch (err) {
    console.error('POST /exams/:id/send-invites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /exams/:id/invites — admin: invite + attempt status for an exam ────────
router.get('/:id/invites', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const invites = await ExamInvite.find({ exam_id: req.params.id }).sort({ created_at: -1 });
    const attemptIds = invites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    res.json(invites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.attempt = att
        ? { score: att.score, max_score: att.max_score, percentage: att.percentage, passed: att.passed, status: att.status }
        : null;
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/:id/invites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /exams/:id/attempts — start an attempt (airline, on behalf of a participant) ──
router.post('/:id/attempts', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'This exam is not published yet.' });

    const { participant_id } = req.body;
    if (!participant_id) return res.status(400).json({ error: 'participant_id is required.' });

    const assignment = exam.assignments.find((a) => String(a.participant_id) === String(participant_id));
    if (!assignment) return res.status(403).json({ error: 'This participant is not assigned to this exam.' });
    if (!isAdmin(req) && String(assignment.airline_id) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const priorAttempts = await ExamAttempt.countDocuments({ exam_id: exam._id, participant_id });
    if (priorAttempts >= exam.max_attempts) {
      return res.status(400).json({ error: 'Maximum attempts reached for this exam.' });
    }

    const participant = await Participant.findById(participant_id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    let questions = exam.questions.map((q) => q.toObject());
    if (exam.shuffle_questions) questions = questions.sort(() => Math.random() - 0.5);

    const attempt = await ExamAttempt.create({
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

    const json = attempt.toJSON();
    json.questions_snapshot = attempt.questions_snapshot.map(sanitizeQuestionForTaking);
    res.status(201).json(json);
  } catch (err) {
    console.error('POST /exams/:id/attempts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /exams/:id (admin) — cascades Cloudinary image cleanup ───────────
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    await deleteExamImages(exam);
    await exam.deleteOne();
    res.json({ message: 'Exam deleted.' });
  } catch (err) {
    console.error('DELETE /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
