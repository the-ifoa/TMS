const crypto = require('crypto');
const mongoose = require('mongoose');
const Exam = require('../../models/Exam');
const ExamAttempt = require('../../models/ExamAttempt');
const ExamInvite = require('../../models/ExamInvite');
const Airline = require('../../models/Airline');
const Participant = require('../../models/Participant');
const { closeOpenAttempts, attemptCycleFilter } = require('../../services/examAttemptFlow');
const { sendExamInviteEmail } = require('../../services/emailService');
const { brandingResolver } = require('../../services/emailBranding');
const r2 = require('../../services/r2');
const { frontendLink } = require('../../config/appUrls');
const { hasPermission } = require('../../middleware/permissions');
const { isAdmin, canAssignExam, assignableOwnerIds, canManageExam, rejectDeleted } = require('./access');

// ─── POST /exams/:id/quick-participant — add candidates from the Assign dialog ──
// Body: { people: [{ name, email }], airline_id, keep } (or a single { name,
// email, ... }). Creates each participant under the chosen airline/department —
// or, for the IFOA admin, with no airline (airline_id 'none') — or reuses the
// one already there with that email, so they can be assigned straight away.
// keep=false → temporary: hidden from participant lists, visible only in this
// exam. Assigning + emailing stays the normal flow.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_QUICK_ADD = 50;
exports.addQuickParticipant = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('owner_airline owner_department status deleted_at');
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (rejectDeleted(res, exam)) return;

    const keep = req.body?.keep !== false;
    const rawPeople = Array.isArray(req.body?.people) ? req.body.people : [{ name: req.body?.name, email: req.body?.email }];
    if (!rawPeople.length) return res.status(400).json({ error: 'Add at least one participant.' });
    if (rawPeople.length > MAX_QUICK_ADD) return res.status(400).json({ error: `Add at most ${MAX_QUICK_ADD} participants at a time.` });

    // Whose roster they join: the admin picks any airline/department or none;
    // an airline only within its own scope (default: itself).
    const requested = String(req.body?.airline_id || '');
    let owner = null;
    let company = 'Individual';
    let airlineLabel = null;
    let department = 'Exam candidate';
    if (isAdmin(req) && (requested === 'none' || requested === '')) {
      if (requested === '') return res.status(400).json({ error: 'Choose an airline, or "No airline".' });
    } else {
      const ownerId = requested || String(req.admin.id);
      if (!mongoose.isValidObjectId(ownerId)) return res.status(400).json({ error: 'Choose the airline these participants belong to.' });
      if (!isAdmin(req) && !assignableOwnerIds(req).map(String).includes(ownerId)) {
        return res.status(403).json({ error: 'You can only add participants to your own airline.' });
      }
      owner = await Airline.findById(ownerId).select('airlineName department_name name is_department parent_airline');
      if (!owner) return res.status(404).json({ error: 'Airline not found.' });
      const parent = owner.is_department && owner.parent_airline ? await Airline.findById(owner.parent_airline).select('airlineName') : null;
      airlineLabel = (parent || owner).airlineName;
      company = airlineLabel;
      if (owner.is_department) department = owner.department_name || owner.name || 'Department';
    }

    const results = [];
    const seen = new Set();
    for (const raw of rawPeople) {
      const name = String(raw?.name || '').trim().replace(/\s+/g, ' ');
      const email = String(raw?.email || '').trim().toLowerCase();
      if (!EMAIL_RX.test(email) || email.length > 200) { results.push({ email, name, error: 'invalid email' }); continue; }
      if (!name) { results.push({ email, name, error: 'missing name' }); continue; }
      if (name.length > 120) { results.push({ email, name, error: 'name too long' }); continue; }
      if (seen.has(email)) { results.push({ email, name, error: 'listed twice' }); continue; }
      seen.add(email);

      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let participant = await Participant.findOne({ submitted_by: owner ? owner._id : null, email: new RegExp(`^${escaped}$`, 'i') });
      let reused = false;
      if (participant) {
        reused = true;
        if (keep && participant.temporary) {
          participant.temporary = false;
          participant.temporary_exam_id = null;
          await participant.save();
        }
      } else {
        const [first, ...rest] = name.split(' ');
        participant = await Participant.create({
          participant_name: name,
          first_name: first,
          last_name: rest.join(' '),
          email,
          company,
          airline_name: airlineLabel,
          department,
          submitted_by: owner ? owner._id : null,
          temporary: !keep,
          temporary_exam_id: keep ? null : exam._id,
        });
      }
      results.push({
        participant: {
          _id: String(participant._id), participant_name: participant.participant_name, email: participant.email,
          temporary: !!participant.temporary, airline_id: owner ? String(owner._id) : 'none',
        },
        reused,
      });
    }

    const okRows = results.filter((r) => r.participant);
    res.status(okRows.some((r) => !r.reused) ? 201 : 200).json({
      results,
      created: okRows.filter((r) => !r.reused).length,
      reused: okRows.filter((r) => r.reused).length,
      failed: results.filter((r) => r.error).length,
      // Back-compat with a single add.
      participant: okRows[0]?.participant || null,
    });
  } catch (err) {
    console.error('POST /exams/:id/quick-participant error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PATCH /exams/:id/quick-participant/:participantId — keep permanently ──────
exports.keepQuickParticipant = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('owner_airline owner_department');
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (!mongoose.isValidObjectId(req.params.participantId)) return res.status(404).json({ error: 'Participant not found.' });
    const filter = { _id: req.params.participantId, temporary: true };
    if (!isAdmin(req)) filter.submitted_by = { $in: assignableOwnerIds(req) };
    const p = await Participant.findOneAndUpdate(filter, { $set: { temporary: false, temporary_exam_id: null } }, { returnDocument: 'after' });
    if (!p) return res.status(404).json({ error: 'Participant not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /exams/:id/quick-participant error:', err.message);
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
    if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
    if (rejectDeleted(res, exam)) return;
    if (exam.status !== 'published') return res.status(400).json({ error: 'Publish the exam before sending invites.' });

    const { participant_ids = [], valid_days, expires_at, reassign = false } = req.body;
    if (participant_ids.length === 0) return res.status(400).json({ error: 'Select at least one participant.' });

    // Optional validity window: an explicit ISO cutoff, or "valid for N days"
    // from now. When neither is supplied on this send, existing invites keep
    // whatever expiry they already had.
    const expiryProvided = valid_days != null || expires_at != null;
    let expiresAt = null;
    if (expires_at != null && expires_at !== '') {
      const d = new Date(expires_at);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid expiry date.' });
      expiresAt = d;
    } else if (valid_days != null && valid_days !== '') {
      const n = Number(valid_days);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ error: 'Validity period must be a positive number of days.' });
      expiresAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }

    const query = { _id: { $in: participant_ids } };
    // An airline can only invite participants within its own scope (a department:
    // just its own "My Team").
    if (!isAdmin(req)) {
      query.submitted_by = { $in: assignableOwnerIds(req) };
    }
    const participants = await Participant.find(query);
    const airlines = await Airline.find({});
    const airlineName = (id) => airlines.find((a) => String(a._id) === String(id))?.airlineName || '';

    const sent = [];
    const brandingFor = brandingResolver();
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
          expires_at: expiresAt,
        });
      } else {
        invite.participant_email = p.email;
        invite.participant_name = p.participant_name;
        invite.exam_title_snapshot = exam.title;
        invite.sent_at = new Date();
        invite.sent_count = (invite.sent_count || 1) + 1;
        invite.batch_id = batchId; // re-sending moves it into the new batch
        if (expiryProvided) invite.expires_at = expiresAt; // null clears it
      }

      const cycle = attemptCycleFilter(exam._id, p._id, invite);
      const [used, active, passed] = await Promise.all([
        ExamAttempt.countDocuments({ exam_id: exam._id, participant_id: p._id }), // every attempt counts
        ExamAttempt.exists({ ...cycle, status: 'in_progress' }),
        ExamAttempt.exists({ ...cycle, passed: true }),
      ]);
      // Plain Assign never grants attempts or changes the link — only Reassign
      // does. Re-sending to someone with no attempts left would just email a
      // link to "You have completed this exam", so tell the admin instead.
      const exhausted = !active && used >= exam.max_attempts + (invite.bonus_attempts || 0);
      if (!reassign && exhausted) {
        skipped.push({ id: String(p._id), name: p.participant_name, reason: 'all attempts used — use Reassign to give a new attempt', code: 'no_attempts_left' });
        continue;
      }
      // Same for someone who already passed: their link only says "You have
      // already passed". Reassign starts a new cycle so they can sit it again.
      if (!reassign && !active && passed) {
        skipped.push({ id: String(p._id), name: p.participant_name, reason: 'already passed — use Reassign to let them take it again', code: 'already_passed' });
        continue;
      }

      // A reassign is a brand-new exam for the candidate: a NEW token (the old
      // link, and any exam tab still open on it, stops working) and a new
      // cycle — "passed", "awaiting review" and results from before it no
      // longer block or show on the link, so it always starts a fresh attempt
      // instead of resuming or showing the old one. Any attempt still open is
      // closed. Max attempts keeps counting EVERY attempt: if none are left,
      // exactly one extra is granted for the new exam. The exam's close date no
      // longer applies and a stale expiry is cleared.
      const newCycle = reassign;
      const rotating = newCycle && !invite.isNew;
      if (newCycle) {
        if (rotating) invite.token = crypto.randomBytes(24).toString('hex');
        invite.cycle_started_at = new Date();
        invite.bonus_attempts = Math.max(invite.bonus_attempts || 0, used + 1 - exam.max_attempts);
        invite.ignore_close = true;
        if (!expiryProvided && invite.expires_at && invite.expires_at < new Date()) invite.expires_at = null;
        invite.status = 'sent';
        invite.attempt_id = null;
        invite.completed_at = null;
        invite.opened_at = null;
      }

      const emailLink = async () => {
        const branding = await brandingFor(p.submitted_by || exam.owner_department || exam.owner_airline);
        await sendExamInviteEmail({
          toEmail: p.email,
          participantName: p.participant_name,
          examTitle: exam.title,
          durationMinutes: exam.duration_minutes,
          maxAttempts: exam.max_attempts,
          link: frontendLink(`/exam/${invite.token}`),
          expiresAt: invite.expires_at,
          branding,
        });
      };

      if (rotating) {
        // Email the NEW link first. If it can't be delivered nothing changes:
        // the candidate keeps a working link instead of a dead one.
        try {
          await emailLink();
        } catch (mailErr) {
          skipped.push({ id: String(p._id), name: p.participant_name, reason: `${mailErr.message} — nothing was changed, the current link still works` });
          continue;
        }
        await closeOpenAttempts(exam, p._id);
        await invite.save();
        sent.push({ id: String(p._id), name: p.participant_name, email: p.email });
        continue;
      }

      await invite.save();
      try {
        await emailLink();
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

// ─── DELETE /exams/:id/candidates/:participantId — take one person off an exam ──
// Removes that candidate's assignment and invite link for this exam, plus any
// result they already have. Same reach as assigning: IFOA admin on IFOA exams;
// an airline on its own exams; a department on its own team only. Deleting an
// existing RESULT additionally needs what deleting results always needs —
// ownership of the exam and the `exams.author` power.
exports.removeCandidate = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    const allowed = isAdmin(req) ? canManageExam(req, exam) : canAssignExam(req, exam);
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });
    if (rejectDeleted(res, exam)) return;

    const pid = req.params.participantId;
    const scope = { exam_id: exam._id, participant_id: pid };
    if (!isAdmin(req)) scope.airline_id = { $in: assignableOwnerIds(req) };

    const [invites, attempts] = await Promise.all([
      ExamInvite.find(scope).select('_id'),
      ExamAttempt.find(scope).select('certificate'),
    ]);
    const assigned = exam.assignments.some((a) => String(a.participant_id) === String(pid));
    if (!invites.length && !attempts.length && !assigned) {
      return res.status(404).json({ error: 'This candidate is not on this exam.' });
    }
    if (attempts.length && !(canManageExam(req, exam) && hasPermission(req, ['exams.author']))) {
      return res.status(403).json({ error: 'This candidate already has a result. Only the exam owner with the "Create & edit exams" power can remove it.' });
    }

    // Uploaded certificates go with the result (best effort).
    await Promise.all(attempts
      .filter((a) => a.certificate && a.certificate.r2_key)
      .map((a) => r2.deleteObject(a.certificate.r2_key).catch(() => {})));
    await ExamAttempt.deleteMany({ _id: { $in: attempts.map((a) => a._id) } });
    await ExamInvite.deleteMany({ _id: { $in: invites.map((i) => i._id) } });
    if (assigned) {
      exam.assignments = exam.assignments.filter((a) => String(a.participant_id) !== String(pid));
      await exam.save();
    }
    res.json({ message: 'Candidate removed from the exam.', invites: invites.length, results: attempts.length });
  } catch (err) {
    console.error('DELETE /exams/:id/candidates/:participantId error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /exams/:id/assignments — who the exam is assigned to ──────────────────
// One row per assigned participant (the exam card's "N Assigned" list), with
// their latest attempt's status. Same access as /invites: admins see everyone,
// an airline / department only the participants in its own scope.
exports.listAssignments = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).select('owner_airline owner_department assignments');
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    let assignments = exam.assignments;
    if (!isAdmin(req)) {
      if (!canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
      const allowed = new Set(assignableOwnerIds(req).map(String));
      assignments = assignments.filter((a) => allowed.has(String(a.airline_id)));
    }

    const ids = assignments.map((a) => a.participant_id);
    const [people, attempts, invites] = await Promise.all([
      Participant.find({ _id: { $in: ids } })
        .select('participant_name first_name last_name email company airline_name').lean(),
      ExamAttempt.find({ exam_id: exam._id, participant_id: { $in: ids } })
        .select('participant_id status passed percentage started_at created_at').sort({ started_at: -1 }).lean(),
      ExamInvite.find({ exam_id: exam._id, participant_id: { $in: ids } })
        .select('participant_id cycle_started_at').lean(),
    ]);
    const personById = Object.fromEntries(people.map((p) => [String(p._id), p]));
    const cycleStart = Object.fromEntries(invites.map((i) => [String(i.participant_id), i.cycle_started_at]));
    const latestAttempt = {};
    for (const a of attempts) latestAttempt[String(a.participant_id)] ??= a;  // sorted newest first

    const rows = assignments
      .map((a) => {
        const p = personById[String(a.participant_id)];
        if (!p) return null;   // participant deleted since assignment
        let att = latestAttempt[String(a.participant_id)];
        // Reassigned and not started again yet: the old result belongs to the
        // previous cycle, so show them as waiting to start.
        const since = cycleStart[String(a.participant_id)];
        const reassigned = !!since;
        if (att && since && new Date(att.created_at) < new Date(since)) att = null;
        return {
          participant_id: String(p._id),
          name: p.participant_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          email: p.email || '',
          airline: p.airline_name || p.company || '',
          assigned_at: a.assigned_at,
          attempt: att ? { status: att.status, passed: att.passed, percentage: att.percentage } : null,
          reassigned,
        };
      })
      .filter(Boolean)
      .sort((x, y) => x.name.localeCompare(y.name));
    res.json(rows);
  } catch (err) {
    console.error('GET /exams/:id/assignments error:', err.message);
    res.status(500).json({ error: 'Failed to load assigned participants.' });
  }
};

// ─── GET /exams/:id/invites — admin: invite + attempt status for an exam ────────
exports.listInvites = async (req, res) => {
  try {
    const inviteQuery = { exam_id: req.params.id };
    if (!isAdmin(req)) {
      const exam = await Exam.findById(req.params.id).select('owner_airline owner_department');
      if (!exam || !canAssignExam(req, exam)) return res.status(403).json({ error: 'Access denied.' });
      // Only show invites for participants in this caller's own scope (a
      // department: just its own "My Team").
      inviteQuery.airline_id = { $in: assignableOwnerIds(req) };
    }
    const invites = await ExamInvite.find(inviteQuery).sort({ created_at: -1 });
    const attemptIds = invites.map((i) => i.attempt_id).filter(Boolean);
    const [attempts, exam, usage] = await Promise.all([
      ExamAttempt.find({ _id: { $in: attemptIds } }).select('score max_score percentage passed status').lean(),
      Exam.findById(req.params.id).select('max_attempts').lean(),
      // Attempts per candidate on this exam (all of them — Max attempts counts every one).
      ExamAttempt.aggregate([
        { $match: { exam_id: new mongoose.Types.ObjectId(String(req.params.id)), participant_id: { $in: invites.map((i) => i.participant_id) } } },
        { $group: { _id: '$participant_id', used: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } } } },
      ]),
    ]);
    const attemptById = Object.fromEntries(attempts.map((a) => [String(a._id), a]));
    const usageByPid = Object.fromEntries(usage.map((u) => [String(u._id), u]));
    const maxAttempts = exam ? exam.max_attempts : 1;

    res.json(invites.map((i) => {
      const json = i.toJSON();
      const att = i.attempt_id && attemptById[String(i.attempt_id)];
      json.attempt = att
        ? { score: att.score, max_score: att.max_score, percentage: att.percentage, passed: att.passed, status: att.status }
        : null;
      // What the Assign dialog shows: "Attempts used/allowed" and whether only a
      // Reassign can let this candidate sit the exam again.
      const u = usageByPid[String(i.participant_id)] || { used: 0, open: 0 };
      json.attempts_used = u.used;
      json.attempts_allowed = maxAttempts + (i.bonus_attempts || 0);
      json.attempts_left = Math.max(0, json.attempts_allowed - u.used);
      // The invite's attempt is the latest one of the current cycle (a reassign
      // clears it), so a pass here means the link only says "already passed".
      json.passed_in_cycle = u.open === 0 && att?.passed === true;
      json.needs_reassign = u.open === 0 && (json.attempts_left === 0 || json.passed_in_cycle);
      return json;
    }));
  } catch (err) {
    console.error('GET /exams/:id/invites error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
