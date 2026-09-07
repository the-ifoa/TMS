const crypto = require('crypto');
const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ExamInvite = require('../models/ExamInvite');
const Airline = require('../models/Airline');
const Participant = require('../models/Participant');
const { examImageUpload, deleteCloudinaryImage } = require('../services/upload');
const { sanitizeQuestionForTaking, computeAttemptScore } = require('../services/examGrading');
const { finalizeAttempt, schedulingError } = require('../services/examAttemptFlow');
const { sendExamInviteEmail } = require('../services/emailService');

function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

// Non-admin caller who is an airline with the admin-granted exam-authoring
// permission — resolves to the Airline doc, or null if not permitted.
async function authoringAirline(req) {
  if (isAdmin(req)) return null;
  const airline = await Airline.findById(req.admin.id).select('can_author_exams');
  return airline && airline.can_author_exams ? airline : null;
}

// True when this airline caller owns the given exam. A department owns exams
// tagged with its id; a top-level airline owns exams whose owner_airline is its
// id (which also covers every exam its departments authored).
function ownsExam(req, exam) {
  if (isAdmin(req)) return false;
  const me = String(req.admin.id);
  if (exam.owner_department && String(exam.owner_department) === me) return true;
  return exam.owner_airline && String(exam.owner_airline) === me;
}

// Who may edit/publish/assign/send/delete an exam: an IFOA admin for global
// (admin-owned) exams, or the owning airline for its own. IFOA admins are
// view-only on airline-owned exams.
function canManageExam(req, exam) {
  if (ownsExam(req, exam)) return true;
  return isAdmin(req) && !exam.owner_airline;
}

async function deleteExamImages(exam) {
  const ids = [];
  exam.questions.forEach((q) => {
    if (q.image_public_id) ids.push(q.image_public_id);
    (q.images || []).forEach((img) => img.public_id && ids.push(img.public_id));
    (q.options || []).forEach((o) => o.image_public_id && ids.push(o.image_public_id));
  });
  await Promise.all(ids.map((id) => deleteCloudinaryImage(id)));
}

// ─── GET /exams/airlines — admin only: airlines with participants, for assigning ──
exports.listAirlines = async (req, res) => {
  try {
    // An exam-authoring airline gets the same picker, scoped to itself only.
    if (!isAdmin(req) && !(await authoringAirline(req))) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const airlineFilter = isAdmin(req) ? {} : { _id: req.admin.id };
    const airlines     = await Airline.find(airlineFilter).sort({ airlineName: 1 });
    const participants = await Participant.find({}).sort({ created_at: -1 });

    const result = airlines.map((a) => ({
      airline: a.toJSON(),
      participants: participants
        .filter(
          (p) =>
            (p.submitted_by && String(p.submitted_by) === String(a._id)) ||
            (!p.submitted_by && (p.company === a.airlineName || p.airline_name === a.airlineName))
        )
        .map((p) => ({
          _id: String(p._id), participant_name: p.participant_name, training_type: p.training_type, email: p.email || '',
          cert_sequence: p.cert_sequence ?? null, cert_released: !!p.cert_released,
        })),
    }));

    res.json(result.filter((r) => r.participants.length > 0));
  } catch (err) {
    console.error('GET /exams/airlines error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/airline-results — airline: their participants' invite + score status ──
// Defined BEFORE `GET /exams/:id` so the literal path isn't captured as an :id.
exports.airlineResults = async (req, res) => {
  try {
    if (isAdmin(req)) return res.status(403).json({ error: 'Airline access required.' });
    const invites = await ExamInvite.find({ airline_id: req.admin.id }).sort({ created_at: -1 });

    // Exams with an expired visibility cutoff drop out of the airline's list
    // — their invites/scores stay reachable via the participant performance
    // view (GET /exams/participants/:id/performance), which doesn't filter
    // on this at all, so historical data is never actually lost. A per-airline
    // override in airline_visibility wins over the exam's global visible_until.
    const examIds = [...new Set(invites.map((i) => String(i.exam_id)))];
    const exams = await Exam.find({ _id: { $in: examIds } }).select('visible_until airline_visibility');
    const now = new Date();
    const hiddenExamIds = new Set(
      exams.filter((e) => {
        const override = (e.airline_visibility || []).find((v) => String(v.airline_id) === String(req.admin.id));
        const effective = override ? override.visible_until : e.visible_until;
        return effective && effective <= now;
      }).map((e) => String(e._id))
    );
    const visibleInvites = invites.filter((i) => !hiddenExamIds.has(String(i.exam_id)));

    const attemptIds = visibleInvites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status submitted_at time_taken_seconds');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    res.json(visibleInvites.map((i) => {
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
};

// ─── GET /exams/department-results — airline main account / department: exam
//     invite + score status across every department in scope, grouped-ready ────
exports.departmentResults = async (req, res) => {
  try {
    const s = req.scope;
    if (isAdmin(req) || !s || s.kind !== 'airline')
      return res.status(403).json({ error: 'Airline access required.' });

    const perms = s.permissions || [];
    if (s.isDepartment && !perms.includes('results.viewOwn') && !perms.includes('results.viewAll'))
      return res.status(403).json({ error: 'You do not have permission to view results.' });

    // Top-level account → its own + every department. Department with
    // results.viewAll → the whole tree. Department with only results.viewOwn →
    // strictly its own results.
    let ids;
    if (!s.isDepartment || perms.includes('results.viewAll')) {
      ids = [s.topAirlineId, ...(s.departmentIds || [])];
    } else {
      ids = [s.selfId];
    }

    const invites = await ExamInvite.find({ airline_id: { $in: ids } }).sort({ created_at: -1 });

    const attemptIds = invites.map((i) => i.attempt_id).filter(Boolean);
    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } })
      .select('score max_score percentage passed status submitted_at time_taken_seconds');
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));

    // Resolve a readable department label for every airline_id we surfaced.
    const airlineDocs = await Airline.find({ _id: { $in: ids } })
      .select('department_name airlineName parent_airline is_department');
    const labelById = {};
    airlineDocs.forEach((a) => {
      labelById[String(a._id)] = a.is_department
        ? (a.department_name || a.name || 'Department')
        : `${a.airlineName} (main account)`;
    });

    res.json(invites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.department_id = String(i.airline_id || '');
      json.department_label = labelById[String(i.airline_id)] || i.airline_name || 'Unknown';
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
    console.error('GET /exams/department-results error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/assigned — airline: exams assigned to their participants ─────────
exports.listAssigned = async (req, res) => {
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
};

// ─── GET /exams/attempts — list attempts ─────────────────────────────────────────
exports.listAttempts = async (req, res) => {
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
      json.answers = json.answers.map((a) => ({ question_id: a.question_id, type: a.type, response: a.response }));
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
};

// ─── GET /exams/participants/:participantId/performance — cross-exam profile ────
// Admin: any participant. Airline: only their own (submitted_by match), same
// ownership rule used everywhere else a participant record is read.
exports.participantPerformance = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.participantId);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });
    if (!isAdmin(req) && String(participant.submitted_by) !== String(req.admin.id)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const attempts = await ExamAttempt.find({
      participant_id: participant._id,
      status: { $ne: 'in_progress' },
    }).sort({ submitted_at: 1 });

    // Aggregate every scored answer across every finished attempt, broken
    // down by section (where in the syllabus they lag) and by question type
    // (what kind of question trips them up).
    const bySection = {};
    const byType = {};
    attempts.forEach((a) => {
      a.answers.forEach((ans) => {
        if (ans.needs_manual_grading || ans.is_correct == null) return;
        const q = a.questions_snapshot.id(ans.question_id);
        const sectionName = q ? (q.section || '') : '';

        if (!bySection[sectionName]) bySection[sectionName] = { section: sectionName, total: 0, correct: 0 };
        bySection[sectionName].total += 1;
        if (ans.is_correct) bySection[sectionName].correct += 1;

        if (!byType[ans.type]) byType[ans.type] = { type: ans.type, total: 0, correct: 0 };
        byType[ans.type].total += 1;
        if (ans.is_correct) byType[ans.type].correct += 1;
      });
    });
    const withAccuracy = (obj) => Object.values(obj)
      .map((s) => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 10000) / 100 : null }))
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)); // weakest first

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
};

// ─── POST /exams/attempts/:attemptId/submit — grade + finalize ──────────────────
exports.submitAttempt = async (req, res) => {
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
};

// ─── POST /exams/attempts/:attemptId/violation — record a lockdown-mode violation ─
// (fullscreen exit, tab switch, ...). Auto-submits the attempt once the exam's
// max_violations threshold is reached.
exports.reportViolation = async (req, res) => {
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
};

// ─── PUT /exams/attempts/:attemptId/grade — admin manually grades pending items ─
exports.gradeAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });
    if (!isAdmin(req)) {
      const ownerExam = await Exam.findById(attempt.exam_id).select('owner_airline');
      if (!ownerExam || !ownsExam(req, ownerExam)) return res.status(403).json({ error: 'Access denied.' });
    }
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
};

// ─── POST /exams/questions/upload-image — admin uploads a question image ────────
// examImageUpload runs the actual Cloudinary upload as multer middleware, so a
// failure there (bad credentials, network block, etc.) throws before the
// handler body below ever runs — invoke it manually to catch and report that.
exports.uploadQuestionImage = (req, res) => {
  examImageUpload.single('image')(req, res, async (uploadErr) => {
    if (uploadErr) {
      console.error('POST /exams/questions/upload-image upload error:', uploadErr.message);
      return res.status(500).json({ error: uploadErr.message || 'Image upload failed.' });
    }
    try {
      if (!isAdmin(req) && !(await authoringAirline(req))) {
        return res.status(403).json({ error: 'Admin access required.' });
      }
      if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
      res.json({ url: req.file.path, public_id: req.file.filename });
    } catch (err) {
      console.error('POST /exams/questions/upload-image error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};

// ─── DELETE /exams/questions/image/:publicId — admin removes an unsaved upload ──
exports.deleteQuestionImage = async (req, res) => {
  try {
    if (!isAdmin(req) && !(await authoringAirline(req))) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    await deleteCloudinaryImage(req.params.publicId);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /exams/questions/image error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams — list exams ──────────────────────────────────────────────────
exports.listExams = async (req, res) => {
  try {
    let exams;
    if (isAdmin(req)) {
      exams = await Exam.find({}).sort({ created_at: -1 });
      // Tag airline/department-created exams with readable owner names for the admin UI.
      const airlineIds = [...new Set([
        ...exams.filter((e) => e.owner_airline).map((e) => String(e.owner_airline)),
        ...exams.filter((e) => e.owner_department).map((e) => String(e.owner_department)),
      ])];
      if (airlineIds.length) {
        const owners = await Airline.find({ _id: { $in: airlineIds } })
          .select('airlineName department_name is_department');
        const byId = Object.fromEntries(owners.map((a) => [String(a._id), a]));
        return res.json(exams.map((e) => {
          const json = e.toJSON();
          if (json.owner_airline) json.owner_airline_name = byId[String(json.owner_airline)]?.airlineName || 'Airline';
          if (json.owner_department) {
            const d = byId[String(json.owner_department)];
            json.owner_department_name = d?.department_name || d?.name || 'Department';
          }
          return json;
        }));
      }
      return res.json(exams.map((e) => e.toJSON()));
    } else {
      // Airline sees: exams it owns (any status) + published exams assigned to it.
      // A top-level airline's scope also covers every department it owns; a plain
      // department's scope is just itself.
      const visibleIds = (req.scope && req.scope.visibleAirlineIds) || [req.admin.id];
      exams = await Exam.find({
        $or: [
          { owner_airline: { $in: visibleIds } },
          { owner_department: { $in: visibleIds } },
          { status: 'published', 'assignments.airline_id': { $in: visibleIds } },
        ],
      }).sort({ created_at: -1 });
    }
    res.json(exams.map((e) => e.toJSON()));
  } catch (err) {
    console.error('GET /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams — create (admin, draft) ──────────────────────────────────────
exports.createExam = async (req, res) => {
  try {
    const airline = isAdmin(req) ? null : await authoringAirline(req);
    if (!isAdmin(req) && !airline) return res.status(403).json({ error: 'Admin access required.' });
    if (!req.body.title) return res.status(400).json({ error: 'title is required.' });

    const { owner_airline, owner_department, created_by, ...body } = req.body;
    // A department's exams are owned by the top-level airline (so the main
    // account still sees them) and tagged with the department that manages them.
    const isDept = !isAdmin(req) && req.scope && req.scope.isDepartment;
    const exam = await Exam.create({
      ...body,
      created_by: isAdmin(req) ? req.admin.id : undefined,
      owner_airline: airline ? (isDept ? req.scope.topAirlineId : req.admin.id) : null,
      owner_department: isDept ? req.admin.id : null,
      status: 'draft',
    });
    res.status(201).json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/:id — single exam ─────────────────────────────────────────────
exports.getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    if (!isAdmin(req)) {
      // The owning airline gets the full exam for editing.
      if (ownsExam(req, exam)) return res.json(exam.toJSON());
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
};

// ─── PUT /exams/:id — update meta + questions (admin) ─────────────────────────
exports.updateExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const { created_by, owner_airline, _id, id, assignments, status, ...updatable } = req.body;
    Object.assign(exam, updatable);
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('PUT /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/publish — draft/archived -> published (admin) ───────────
exports.publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (exam.questions.length === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });

    exam.status = 'published';
    await exam.save();
    res.json(exam.toJSON());
  } catch (err) {
    console.error('POST /exams/:id/publish error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/assign — assign to participants (admin) ─────────────────
exports.assignExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const { participant_ids = [] } = req.body;
    const query = { _id: { $in: participant_ids } };
    // An airline can only assign participants within its own scope (a department:
    // just its own; a top-level airline: its own + every department's).
    if (ownsExam(req, exam)) {
      query.submitted_by = { $in: (req.scope && req.scope.visibleAirlineIds) || [req.admin.id] };
    }
    const participants = await Participant.find(query);

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
};

// ─── POST /exams/:id/send-invites — admin emails the take-link to participants ──
// Ensures each participant is assigned, creates/refreshes their ExamInvite (one
// per participant, stable token), and emails the passwordless take link.
exports.sendInvites = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (exam.status !== 'published') return res.status(400).json({ error: 'Publish the exam before sending invites.' });

    const { participant_ids = [] } = req.body;
    if (participant_ids.length === 0) return res.status(400).json({ error: 'Select at least one participant.' });

    const query = { _id: { $in: participant_ids } };
    // An airline can only invite participants within its own scope.
    if (ownsExam(req, exam)) {
      query.submitted_by = { $in: (req.scope && req.scope.visibleAirlineIds) || [req.admin.id] };
    }
    const participants = await Participant.find(query);
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
};

// ─── GET /exams/:id/invites — admin: invite + attempt status for an exam ────────
exports.listInvites = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      const exam = await Exam.findById(req.params.id).select('owner_airline');
      if (!exam || !ownsExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    }
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
};

// ─── GET /exams/:id/analytics — admin: per-question miss rate + pass-rate over time ──
exports.getAnalytics = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('questions title owner_airline');
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!isAdmin(req) && !ownsExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const attempts = await ExamAttempt.find({ exam_id: exam._id, status: { $ne: 'in_progress' } })
      .select('answers status passed percentage submitted_at');

    // Per-question stats, seeded from the CURRENT question bank so questions
    // with zero attempts still show up (with total 0), and ones removed from
    // the exam since don't clutter the list.
    const byQuestion = {};
    exam.questions.forEach((q) => {
      byQuestion[String(q._id)] = {
        question_id: String(q._id), prompt: q.prompt, type: q.type, section: q.section || '',
        total: 0, correct: 0, incorrect: 0, pending: 0,
      };
    });
    attempts.forEach((a) => {
      a.answers.forEach((ans) => {
        const stat = byQuestion[String(ans.question_id)];
        if (!stat) return;
        if (ans.needs_manual_grading) { stat.pending += 1; return; }
        if (ans.is_correct == null) return; // unscored (e.g. likert)
        stat.total += 1;
        if (ans.is_correct) stat.correct += 1; else stat.incorrect += 1;
      });
    });
    const perQuestion = Object.values(byQuestion)
      .map((s) => ({ ...s, miss_rate: s.total > 0 ? Math.round((s.incorrect / s.total) * 10000) / 100 : null }))
      .sort((a, b) => (b.miss_rate ?? -1) - (a.miss_rate ?? -1));

    // Pass-rate over time, bucketed by the day the attempt was submitted.
    const finished = attempts.filter((a) => a.status !== 'in_progress' && a.submitted_at);
    const byDate = {};
    finished.forEach((a) => {
      const day = a.submitted_at.toISOString().slice(0, 10);
      if (!byDate[day]) byDate[day] = { date: day, total: 0, passed: 0 };
      byDate[day].total += 1;
      if (a.passed) byDate[day].passed += 1;
    });
    const passRateOverTime = Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, pass_rate: d.total > 0 ? Math.round((d.passed / d.total) * 10000) / 100 : 0 }));

    const gradedOrScored = finished.filter((a) => a.percentage != null);
    res.json({
      overall: {
        total_attempts: attempts.length,
        finished_attempts: finished.length,
        passed: finished.filter((a) => a.passed).length,
        avg_percentage: gradedOrScored.length > 0
          ? Math.round((gradedOrScored.reduce((sum, a) => sum + a.percentage, 0) / gradedOrScored.length) * 100) / 100
          : null,
      },
      per_question: perQuestion,
      pass_rate_over_time: passRateOverTime,
    });
  } catch (err) {
    console.error('GET /exams/:id/analytics error:', err.message);
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
};

// ─── DELETE /exams/:id (admin) — cascades Cloudinary image cleanup ───────────
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    await deleteExamImages(exam);
    await exam.deleteOne();
    res.json({ message: 'Exam deleted.' });
  } catch (err) {
    console.error('DELETE /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
