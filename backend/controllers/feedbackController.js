const crypto = require('crypto');
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Participant = require('../models/Participant');
const TrainingFeedback = require('../models/TrainingFeedback');
const { sendTrainingFeedbackEmail } = require('../services/emailService');
const { frontendLink } = require('../config/appUrls');
const { FEEDBACK_FORM, FEEDBACK_VERSION, STATEMENT_KEYS } = require('../config/feedbackForm');

// Customer Training Feedback is an IFOA-only feature: it applies to exams the
// IFOA admin side owns, never to exams an airline or department created.
function isIfoaExam(exam) {
  return !exam.owner_airline && !exam.owner_department;
}

async function loadIfoaExam(req, res) {
  const exam = await Exam.findById(req.params.examId).select('title owner_airline owner_department assignments');
  if (!exam) { res.status(404).json({ error: 'Exam not found.' }); return null; }
  if (!isIfoaExam(exam)) { res.status(403).json({ error: 'Feedback forms are only available for IFOA exams.' }); return null; }
  return exam;
}

const personName = (p) => p.participant_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Participant';

// Per-statement average + 1..5 distribution over the submitted responses.
function summarise(submitted) {
  const statements = FEEDBACK_FORM.sections.flatMap((section) => section.statements.map((st) => {
    const values = submitted
      .map((f) => f.ratings.find((r) => r.key === st.key)?.value)
      .filter((v) => Number.isFinite(v));
    const distribution = [1, 2, 3, 4, 5].map((n) => values.filter((v) => v === n).length);
    return {
      key: st.key,
      section: section.title,
      text: st.text,
      count: values.length,
      average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
      distribution,
    };
  }));
  return { submitted: submitted.length, statements };
}

// ─── GET /feedback/exams/:examId — status per participant + responses ───────────
exports.getExamFeedback = async (req, res) => {
  try {
    const exam = await loadIfoaExam(req, res);
    if (!exam) return;

    // Everyone assigned to the exam, plus anyone else the form was sent to.
    const feedback = await TrainingFeedback.find({ exam_id: exam._id }).sort({ submitted_at: -1, sent_at: -1 });
    const assigned = new Set(exam.assignments.map((a) => String(a.participant_id)));
    const ids = [...new Set([...assigned, ...feedback.map((f) => String(f.participant_id))])];
    const people = await Participant.find({ _id: { $in: ids } })
      .select('participant_name first_name last_name email company airline_name').lean();
    const fbByPid = Object.fromEntries(feedback.map((f) => [String(f.participant_id), f]));

    const rows = people
      .map((p) => {
        const f = fbByPid[String(p._id)];
        return {
          participant_id: String(p._id),
          name: personName(p),
          email: p.email || '',
          airline: p.airline_name || p.company || '',
          assigned: assigned.has(String(p._id)),
          feedback: f ? {
            id: String(f._id), status: f.status, sent_at: f.sent_at, sent_count: f.sent_count,
            opened_at: f.opened_at, submitted_at: f.submitted_at,
          } : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const submitted = feedback.filter((f) => f.status === 'submitted');
    res.json({
      exam: { id: String(exam._id), title: exam.title },
      form: FEEDBACK_FORM,
      rows,
      responses: submitted.map((f) => f.toJSON()),
      summary: summarise(submitted),
    });
  } catch (err) {
    console.error('GET /feedback/exams/:examId error:', err.message);
    res.status(500).json({ error: 'Failed to load feedback.' });
  }
};

// Emails the form to the given participants — anyone on the IFOA admin's list,
// not only those assigned to the exam (the training may include people who
// never sat it). Re-sending reuses the participant's existing link; anyone who
// already submitted is skipped. Returns { sent, skipped }.
async function sendForms(exam, requested, adminId) {
  const ids = [...new Set(requested.filter((id) => mongoose.isValidObjectId(id)))];
  const participants = await Participant.find({ _id: { $in: ids } })
    .select('participant_name first_name last_name email company airline_name');
  const existing = await TrainingFeedback.find({ exam_id: exam._id, participant_id: { $in: ids } });
  const fbByPid = Object.fromEntries(existing.map((f) => [String(f.participant_id), f]));

  const sent = [];
  const found = new Set(participants.map((p) => String(p._id)));
  const skipped = requested
    .filter((id) => !found.has(String(id)))
    .map((id) => ({ id, reason: 'participant not found' }));

  for (const p of participants) {
    const name = personName(p);
    if (!p.email) { skipped.push({ id: String(p._id), name, reason: 'no email' }); continue; }
    let fb = fbByPid[String(p._id)];
    if (fb?.status === 'submitted') { skipped.push({ id: String(p._id), name, reason: 'already submitted' }); continue; }

    if (fb) {
      fb.sent_at = new Date();
      fb.sent_count += 1;
      fb.participant_email = p.email;
      fb.exam_title_snapshot = exam.title;
    } else {
      fb = new TrainingFeedback({
        token: crypto.randomBytes(24).toString('hex'),
        exam_id: exam._id,
        exam_title_snapshot: exam.title,
        participant_id: p._id,
        participant_name: name,
        participant_email: p.email,
        airline_name: p.airline_name || p.company || '',
        sent_by: adminId,
      });
    }

    try {
      await sendTrainingFeedbackEmail({
        toEmail: p.email,
        participantName: name,
        trainingTitle: exam.title,
        link: frontendLink(`/feedback/${fb.token}`),
      });
      await fb.save();
      sent.push({ id: String(p._id), name, email: p.email });
    } catch (err) {
      console.error('Feedback email failed:', p.email, err.message);
      skipped.push({ id: String(p._id), name, reason: `email failed: ${err.message}` });
    }
  }
  return { sent, skipped };
}

// ─── POST /feedback/exams/:examId/send — email the form to chosen participants ──
// Body: { participant_ids: [...] }.
exports.sendExamFeedback = async (req, res) => {
  try {
    const exam = await loadIfoaExam(req, res);
    if (!exam) return;
    const requested = Array.isArray(req.body?.participant_ids) ? req.body.participant_ids.map(String) : [];
    if (requested.length === 0) return res.status(400).json({ error: 'Select at least one participant.' });
    res.json(await sendForms(exam, requested, req.admin.id));
  } catch (err) {
    console.error('POST /feedback/exams/:examId/send error:', err.message);
    res.status(500).json({ error: 'Failed to send feedback forms.' });
  }
};

// ─── DELETE /feedback/exams/:examId/responses/:feedbackId[?resend=1] ──────────
// Removes a participant's feedback (answers included). Their old link stops
// working — it carried the deleted record's token — so they show as "Not sent".
// With ?resend=1 a fresh form link is emailed straight away.
exports.deleteExamFeedback = async (req, res) => {
  try {
    const exam = await loadIfoaExam(req, res);
    if (!exam) return;
    if (!require('mongoose').isValidObjectId(req.params.feedbackId)) return res.status(404).json({ error: 'Feedback not found.' });
    const fb = await TrainingFeedback.findOne({ _id: req.params.feedbackId, exam_id: exam._id });
    if (!fb) return res.status(404).json({ error: 'Feedback not found.' });
    await TrainingFeedback.deleteOne({ _id: fb._id });

    const resend = ['1', 'true'].includes(String(req.query.resend));
    const result = resend ? await sendForms(exam, [String(fb.participant_id)], req.admin.id) : null;
    res.json({ deleted: true, ...(result ? { resent: result.sent.length > 0, ...result } : {}) });
  } catch (err) {
    console.error('DELETE /feedback/exams/:examId/responses/:feedbackId error:', err.message);
    res.status(500).json({ error: 'Failed to delete the feedback.' });
  }
};

// ─── Public, passwordless form (/feedback/:token) ─────────────────────────────

// GET /public-feedback/:token — the form, pre-filled details, and status.
exports.getPublicFeedback = async (req, res) => {
  try {
    const fb = await TrainingFeedback.findOne({ token: String(req.params.token) });
    if (!fb) return res.status(404).json({ error: 'This feedback link is invalid or no longer available.' });

    if (fb.status === 'sent') {
      fb.status = 'opened';
      fb.opened_at = new Date();
      await fb.save();
    }

    res.json({
      form: FEEDBACK_FORM,
      status: fb.status,
      submitted_at: fb.submitted_at,
      participant_name: fb.participant_name,
      prefill: {
        company: fb.company || fb.airline_name || '',
        training_title: fb.training_title || fb.exam_title_snapshot || '',
        instructor_name: fb.instructor_name || '',
      },
    });
  } catch (err) {
    console.error('GET /public-feedback/:token error:', err.message);
    res.status(500).json({ error: 'Failed to load the feedback form.' });
  }
};

// POST /public-feedback/:token/submit — body validated by schemas.feedbackSubmit.
exports.submitPublicFeedback = async (req, res) => {
  try {
    const fb = await TrainingFeedback.findOne({ token: String(req.params.token) });
    if (!fb) return res.status(404).json({ error: 'This feedback link is invalid or no longer available.' });
    if (fb.status === 'submitted') return res.status(409).json({ error: 'This feedback has already been submitted. Thank you!' });

    const { company, training_title, instructor_name, ratings, comments } = req.body;
    const missing = STATEMENT_KEYS.filter((k) => !ratings[k]);
    if (missing.length) return res.status(400).json({ error: 'Please answer every statement before submitting.', missing });

    fb.company = company;
    fb.training_title = training_title;
    fb.instructor_name = instructor_name;
    fb.ratings = STATEMENT_KEYS.map((key) => ({ key, value: ratings[key] }));
    fb.comments = comments || '';
    fb.form_version = FEEDBACK_VERSION;
    fb.status = 'submitted';
    fb.submitted_at = new Date();
    await fb.save();

    res.json({ ok: true, thank_you: FEEDBACK_FORM.thank_you });
  } catch (err) {
    console.error('POST /public-feedback/:token/submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
};
