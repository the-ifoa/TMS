const Exam = require('../../models/Exam');
const ExamInvite = require('../../models/ExamInvite');
const ExamAttempt = require('../../models/ExamAttempt');
const Airline = require('../../models/Airline');
const Participant = require('../../models/Participant');
const { examImageUpload, deleteImagesIfUnused } = require('../../services/upload');
const { sanitizeQuestionForTaking, answerKeyProblems } = require('../../services/examGrading');
const { remarkExam, changedKeyQuestionIds, changedContentQuestionIds, refreshInProgressContent } = require('../../services/examRemark');
const { isAdmin, authoringAirline, ownsExam, canAssignExam, assignableOwnerIds, canManageExam, deleteExamImages } = require('./access');

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
    // Removing / replacing an image in the editor: only really delete it when no
    // saved exam, bank question or attempt uses it (it may be a copy's image,
    // or the saved version of this exam until it is saved again).
    await deleteImagesIfUnused([req.params.publicId]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /exams/questions/image error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams — list exams ──────────────────────────────────────────────────
// The list page only needs a question count, not every question (with its
// answers and image URLs) — so skip the array and count it in the database.
const LIST_EXCLUDE = '-questions';
async function withQuestionCounts(exams) {
  if (!exams.length) return {};
  const rows = await Exam.aggregate([
    { $match: { _id: { $in: exams.map((e) => e._id) } } },
    { $project: { n: { $size: { $ifNull: ['$questions', []] } } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

// Drop assignments whose participant has since been deleted, so the card's
// "N Assigned" count matches the list GET /exams/:id/assignments shows.
async function dropDeletedAssignments(list) {
  const ids = [...new Set(list.flatMap((e) => (e.assignments || []).map((a) => String(a.participant_id))))];
  if (!ids.length) return list;
  const existing = new Set((await Participant.find({ _id: { $in: ids } }).select('_id').lean()).map((p) => String(p._id)));
  for (const e of list) e.assignments = (e.assignments || []).filter((a) => existing.has(String(a.participant_id)));
  return list;
}

exports.listExams = async (req, res) => {
  try {
    let exams;
    if (isAdmin(req)) {
      exams = await Exam.find({}).select(LIST_EXCLUDE).sort({ created_at: -1 });
      const counts = await withQuestionCounts(exams);
      // Tag airline/department-created exams with readable owner names for the admin UI.
      const airlineIds = [...new Set([
        ...exams.filter((e) => e.owner_airline).map((e) => String(e.owner_airline)),
        ...exams.filter((e) => e.owner_department).map((e) => String(e.owner_department)),
      ])];
      if (airlineIds.length) {
        const owners = await Airline.find({ _id: { $in: airlineIds } })
          .select('airlineName department_name is_department');
        const byId = Object.fromEntries(owners.map((a) => [String(a._id), a]));
        return res.json(await dropDeletedAssignments(exams.map((e) => {
          const json = e.toJSON();
          json.question_count = counts[String(e._id)] || 0;
          if (json.owner_airline) json.owner_airline_name = byId[String(json.owner_airline)]?.airlineName || 'Airline';
          if (json.owner_department) {
            const d = byId[String(json.owner_department)];
            json.owner_department_name = d?.department_name || d?.name || 'Department';
          }
          return json;
        })));
      }
      return res.json(await dropDeletedAssignments(exams.map((e) => ({ ...e.toJSON(), question_count: counts[String(e._id)] || 0 }))));
    } else if (req.scope && req.scope.isDepartment) {
      // A plain department manages ONLY the exams it authored itself. It must not
      // see the parent airline's own exams or sibling departments' exams (both
      // carry owner_airline = topAirlineId). It still sees published exams
      // assigned to its own team so it can monitor / assign them.
      const selfId = String(req.admin.id);
      exams = await Exam.find({
        $or: [
          { owner_department: selfId },
          { status: 'published', 'assignments.airline_id': selfId },
        ],
      }).select(LIST_EXCLUDE).sort({ created_at: -1 });
    } else {
      // Top-level airline: exams it owns (any status, which covers every exam its
      // departments authored) + published exams assigned anywhere in its tree.
      const visibleIds = (req.scope && req.scope.visibleAirlineIds) || [req.admin.id];
      exams = await Exam.find({
        $or: [
          { owner_airline: { $in: visibleIds } },
          { owner_department: { $in: visibleIds } },
          { status: 'published', 'assignments.airline_id': { $in: visibleIds } },
        ],
      }).select(LIST_EXCLUDE).sort({ created_at: -1 });
    }
    const counts = await withQuestionCounts(exams);
    // An exam can be assigned across several airlines — keep only the
    // assignments in this caller's own scope (matches GET /exams/:id/assignments).
    const ownIds = new Set(assignableOwnerIds(req).map(String));
    res.json(await dropDeletedAssignments(exams.map((e) => {
      const json = e.toJSON();
      json.assignments = (json.assignments || []).filter((a) => ownIds.has(String(a.airline_id)));
      json.question_count = counts[String(e._id)] || 0;
      json.can_edit = !!ownsExam(req, e); // full questions (with answers) available — e.g. to copy from
      return json;
    })));
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
    // ?summary=1 — just the header fields (results page), skipping the
    // question list. Same access rules as the full fetch below.
    if (req.query.summary) {
      const exam = await Exam.findById(req.params.id)
        .select('title status pass_percentage max_attempts owner_airline owner_department assignments.airline_id');
      if (!exam) return res.status(404).json({ error: 'Exam not found.' });
      if (!isAdmin(req) && !ownsExam(req, exam)) {
        const assigned = exam.assignments.some((a) => String(a.airline_id) === String(req.admin.id));
        if (exam.status !== 'published' || !assigned) return res.status(403).json({ error: 'Access denied.' });
      }
      const { _id, title, status, pass_percentage, max_attempts, owner_airline, owner_department } = exam;
      // Extra attempts granted by reassigns, per candidate — the results page
      // shows "attempts used / allowed" (allowed = max_attempts + extra).
      const extras = await ExamInvite.find({ exam_id: _id, bonus_attempts: { $gt: 0 } }).select('participant_id bonus_attempts').lean();
      const extra_attempts = Object.fromEntries(extras.map((i) => [String(i.participant_id), i.bonus_attempts]));
      return res.json({ id: String(_id), _id, title, status, pass_percentage, max_attempts, extra_attempts, owner_airline, owner_department });
    }

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
    const questionsBefore = exam.questions.map((q) => q.toObject());
    Object.assign(exam, updatable);
    // Every auto-graded question needs its answer key: without one every
    // candidate is silently marked wrong on it.
    const problems = answerKeyProblems(exam.questions);
    if (problems.length) return res.status(400).json({ error: `Fix the answer key before saving: ${problems.join(' ')}`, problems });
    await exam.save();

    // Changes go live (see services/examRemark.js): a changed answer key or
    // points re-marks every attempt; changed wording reaches candidates who are
    // taking the exam now.
    const json = exam.toJSON();
    const changed = changedKeyQuestionIds(questionsBefore, exam.questions);
    const reworded = changedContentQuestionIds(questionsBefore, exam.questions);
    try {
      if (changed.length) {
        const { rows, ...summary } = await remarkExam(exam, { questionIds: changed, apply: true });
        json.remark = summary;
      }
      if (reworded.length) await refreshInProgressContent(exam, reworded);
    } catch (err) {
      console.error('PUT /exams/:id re-mark error:', err.message);
      json.remark = { error: 'The exam was saved, but updating existing results failed. Run backend/regrade-attempts.js for this exam.' };
    }
    res.json(json);
  } catch (err) {
    console.error('PUT /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /exams/:id/remark-preview — what saving these edits would re-mark ──
// Body: the same payload as PUT /exams/:id. Nothing is saved.
exports.remarkPreview = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    const { created_by, owner_airline, _id, id, assignments, status, ...updatable } = req.body;
    const questionsBefore = exam.questions.map((q) => q.toObject());
    Object.assign(exam, updatable);
    const problems = answerKeyProblems(exam.questions);
    if (problems.length) return res.status(400).json({ error: `Fix the answer key before saving: ${problems.join(' ')}`, problems });
    const changed = changedKeyQuestionIds(questionsBefore, exam.questions);
    if (!changed.length) return res.json({ changed_questions: [] });
    const { rows, ...summary } = await remarkExam(exam, { questionIds: changed, apply: false });
    const numberOf = new Map(exam.questions.map((q, i) => [String(q._id), i + 1]));
    summary.needs_hand_check = summary.needs_hand_check.map((h) => ({ ...h, question: h.question_id ? numberOf.get(h.question_id) : null }));
    res.json({ changed_questions: changed.map((qid) => numberOf.get(qid)), ...summary });
  } catch (err) {
    console.error('POST /exams/:id/remark-preview error:', err.message);
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
    const problems = answerKeyProblems(exam.questions);
    if (problems.length) return res.status(400).json({ error: `Fix the answer key before publishing: ${problems.join(' ')}`, problems });

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
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    const { participant_ids = [] } = req.body;
    const query = { _id: { $in: participant_ids } };
    // An airline can only assign participants within its own scope (a department:
    // just its own "My Team"; a top-level airline: its own + every department's).
    if (!isAdmin(req)) {
      query.submitted_by = { $in: assignableOwnerIds(req) };
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

// ─── GET /exams/:id/analytics — admin: per-question miss rate + pass-rate over time ──
exports.getAnalytics = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('questions title owner_airline owner_department');
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

// ─── DELETE /exams/:id (admin) — cascades Cloudinary image cleanup ───────────
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canManageExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });

    await exam.deleteOne();
    await deleteExamImages(exam); // after the delete, so its own references don't count
    res.json({ message: 'Exam deleted.' });
  } catch (err) {
    console.error('DELETE /exams/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

Object.assign(exports, { LIST_EXCLUDE, withQuestionCounts });
