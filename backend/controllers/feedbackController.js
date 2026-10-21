const crypto = require('crypto');
const mongoose = require('mongoose');
const Exam = require('../models/Exam');
const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const TrainingFeedback = require('../models/TrainingFeedback');
const { sendTrainingFeedbackEmail, sendFeedbackReportEmail } = require('../services/emailService');
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

// The airline feedback for this exam belongs to: the airline picked (or typed)
// under "For airline", else the airline that created the exam. null = none set.
async function examAirline(exam) {
  if (!exam.for_airline && exam.for_airline_name) return { id: null, name: exam.for_airline_name };
  const id = exam.for_airline || exam.owner_airline;
  if (!id) return null;
  const a = await Airline.findById(id).select('airlineName').lean();
  return a ? { id: a._id, name: a.airlineName || '' } : null;
}

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
  const airline = await examAirline(exam);

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
      if (airline) { fb.airline_id = airline.id; fb.airline_name = airline.name; }
    } else {
      fb = new TrainingFeedback({
        token: crypto.randomBytes(24).toString('hex'),
        exam_id: exam._id,
        exam_title_snapshot: exam.title,
        participant_id: p._id,
        participant_name: name,
        participant_email: p.email,
        airline_id: airline ? airline.id : null,
        airline_name: airline ? airline.name : (p.airline_name || p.company || ''),
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

// POST /feedback/exams/:examId/responses/bulk-delete { ids } — remove several
// responses at once (no resend). Ids from another exam are ignored.
exports.bulkDeleteExamFeedback = async (req, res) => {
  try {
    const exam = await loadIfoaExam(req, res);
    if (!exam) return;
    const mongoose = require('mongoose');
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) => mongoose.isValidObjectId(id));
    if (!ids.length) return res.status(400).json({ error: 'ids is required.' });
    const { deletedCount } = await TrainingFeedback.deleteMany({ _id: { $in: ids }, exam_id: exam._id });
    res.json({ deleted: deletedCount });
  } catch (err) {
    console.error('POST /feedback/exams/:examId/responses/bulk-delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete the feedback.' });
  }
};

// DELETE /feedback/responses/:feedbackId — remove one response from the
// dashboard, including imported (iSpring) ones and those of deleted exams.
exports.deleteFeedback = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.feedbackId)) return res.status(404).json({ error: 'Feedback not found.' });
    const fb = await TrainingFeedback.findById(req.params.feedbackId).select('exam_id');
    if (!fb) return res.status(404).json({ error: 'Feedback not found.' });
    if (fb.exam_id) {
      const exam = await Exam.findById(fb.exam_id).select('owner_airline owner_department');
      if (exam && !isIfoaExam(exam)) return res.status(403).json({ error: 'Feedback forms are only available for IFOA exams.' });
    }
    await TrainingFeedback.deleteOne({ _id: fb._id });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /feedback/responses/:feedbackId error:', err.message);
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
    // Submitted feedback is credited to the exam's airline as it is now.
    const exam = await Exam.findById(fb.exam_id).select('for_airline for_airline_name owner_airline').lean();
    const airline = exam ? await examAirline(exam) : null;
    if (airline) { fb.airline_id = airline.id; fb.airline_name = airline.name; }
    fb.status = 'submitted';
    fb.submitted_at = new Date();
    await fb.save();

    res.json({ ok: true, thank_you: FEEDBACK_FORM.thank_you });
  } catch (err) {
    console.error('POST /public-feedback/:token/submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
};

// ─── GET /feedback/dashboard — every training's feedback, rolled up ────────────
// Query (all optional): airline, exam_id, from, to (ISO dates, on submitted_at /
// sent_at). Averages are the mean of every individual 1–5 rating, so each
// answer counts once. Airline = the participant's airline when the form was
// sent, falling back to the company they typed on the form.
const round2 = (n) => Math.round(n * 100) / 100;
const airlineOf = (f) => (f.airline_name || f.company || '').trim() || 'No airline';
// Imported iSpring answers have no exam — they group by the training they named.
const examKeyOf = (f) => (f.exam_id ? String(f.exam_id) : `ispring:${(f.exam_title_snapshot || '').trim().toLowerCase()}`);
const examTitleOf = (f) => f.exam_title_snapshot || 'Untitled exam';

// { sum, n, dist[5] } accumulator for a set of ratings.
function tally() { return { sum: 0, n: 0, dist: [0, 0, 0, 0, 0] }; }
function addRating(t, v) { if (v >= 1 && v <= 5) { t.sum += v; t.n += 1; t.dist[v - 1] += 1; } }
const avgOf = (t) => (t.n ? round2(t.sum / t.n) : null);

exports.getFeedbackDashboard = async (req, res) => {
  try {
    const { airline, exam_id, from, to } = req.query;
    const all = await TrainingFeedback.find({})
      .select('exam_id exam_title_snapshot participant_name participant_email airline_name company status sent_at submitted_at ratings comments instructor_name training_title')
      .sort({ submitted_at: -1 })
      .lean();

    // Filter choices come from everything, before filtering.
    const options = {
      airlines: [...new Set(all.map(airlineOf))].sort((a, b) => a.localeCompare(b)),
      exams: Object.values(Object.fromEntries(all.map((f) => [examKeyOf(f), { id: examKeyOf(f), title: examTitleOf(f) }])))
        .sort((a, b) => a.title.localeCompare(b.title)),
      // Years with any feedback activity, newest first — for the year filter.
      years: [...new Set(all.flatMap((f) => [f.submitted_at, f.sent_at]).filter(Boolean).map((d) => new Date(d).getFullYear()))]
        .filter((y) => Number.isFinite(y)).sort((a, b) => b - a),
    };

    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    if (toD && !Number.isNaN(toD.getTime())) toD.setHours(23, 59, 59, 999);
    const inRange = (d) => d && (!fromD || d >= fromD) && (!toD || d <= toD);
    const scoped = all.filter((f) => (!airline || airlineOf(f) === airline) && (!exam_id || examKeyOf(f) === String(exam_id)));
    const sentDocs = scoped.filter((f) => (fromD || toD ? inRange(f.sent_at) : true));
    const submitted = scoped.filter((f) => f.status === 'submitted' && (fromD || toD ? inRange(f.submitted_at) : true));

    const sections = FEEDBACK_FORM.sections.map((s) => ({ key: s.key, title: s.title.replace(/:$/, '').replace(/\.\.\.$/, ''), keys: s.statements.map((st) => st.key) }));
    const sectionOfKey = Object.fromEntries(sections.flatMap((s) => s.keys.map((k) => [k, s.key])));

    const total = tally();
    const bySection = Object.fromEntries(sections.map((s) => [s.key, tally()]));
    const byStatement = Object.fromEntries(STATEMENT_KEYS.map((k) => [k, tally()]));
    const airlines = {};
    const exams = {};
    const months = {};
    const group = (map, key, init) => (map[key] = map[key] || { ...init, all: tally(), sections: Object.fromEntries(sections.map((s) => [s.key, tally()])), responses: 0, sent: 0, last_at: null });

    sentDocs.forEach((f) => {
      group(airlines, airlineOf(f), { name: airlineOf(f) }).sent += 1;
      group(exams, examKeyOf(f), { exam_id: examKeyOf(f), title: examTitleOf(f) }).sent += 1;
    });
    submitted.forEach((f) => {
      const a = group(airlines, airlineOf(f), { name: airlineOf(f) });
      const e = group(exams, examKeyOf(f), { exam_id: examKeyOf(f), title: examTitleOf(f) });
      const mKey = f.submitted_at ? new Date(f.submitted_at).toISOString().slice(0, 7) : null;
      const m = mKey ? (months[mKey] = months[mKey] || { month: mKey, responses: 0, all: tally() }) : null;
      [a, e].forEach((g) => { g.responses += 1; if (!g.last_at || f.submitted_at > g.last_at) g.last_at = f.submitted_at; });
      if (m) m.responses += 1;
      (f.ratings || []).forEach(({ key, value }) => {
        const sec = sectionOfKey[key];
        addRating(total, value);
        if (byStatement[key]) addRating(byStatement[key], value);
        if (sec) { addRating(bySection[sec], value); addRating(a.sections[sec], value); addRating(e.sections[sec], value); }
        addRating(a.all, value); addRating(e.all, value);
        if (m) addRating(m.all, value);
      });
    });

    const shape = (g) => ({
      ...Object.fromEntries(Object.entries(g).filter(([k]) => !['all', 'sections'].includes(k))),
      average: avgOf(g.all),
      distribution: g.all.dist,
      rate: g.sent ? Math.round((g.responses / g.sent) * 100) : null,
      sections: Object.fromEntries(Object.entries(g.sections).map(([k, t]) => [k, avgOf(t)])),
    });
    const byAvg = (x, y) => (y.average ?? -1) - (x.average ?? -1) || y.responses - x.responses;
    const ownAvg = (f) => { const v = (f.ratings || []).map((r) => r.value); return v.length ? round2(v.reduce((s, x) => s + x, 0) / v.length) : null; };

    const commented = submitted.filter((f) => (f.comments || '').trim()).slice(0, 30);
    const linked = [...new Set(commented.filter((f) => f.exam_id).map((f) => String(f.exam_id)))];
    const liveExamIds = new Set((await Exam.find({ _id: { $in: linked }, deleted_at: null }).select('_id').lean()).map((e) => String(e._id)));

    res.json({
      form: {
        scale: FEEDBACK_FORM.scale,
        sections: sections.map(({ key, title }, i) => ({ key, title, statements: FEEDBACK_FORM.sections[i].statements.map(({ key: k, text }) => ({ key: k, text })) })),
      },
      options,
      totals: {
        sent: sentDocs.length,
        submitted: submitted.length,
        rate: sentDocs.length ? Math.round((submitted.length / sentDocs.length) * 100) : null,
        average: avgOf(total),
        distribution: total.dist,
        airlines: new Set(submitted.map(airlineOf)).size,
      },
      sections: sections.map((s) => ({ key: s.key, title: s.title, average: avgOf(bySection[s.key]), distribution: bySection[s.key].dist })),
      statements: FEEDBACK_FORM.sections.flatMap((s) => s.statements.map((st) => ({
        key: st.key, section: sectionOfKey[st.key], text: st.text,
        average: avgOf(byStatement[st.key]), count: byStatement[st.key].n, distribution: byStatement[st.key].dist,
      }))),
      airlines: Object.values(airlines).map(shape).sort(byAvg),
      exams: Object.values(exams).map(shape).sort(byAvg),
      trend: Object.values(months).sort((x, y) => x.month.localeCompare(y.month)).slice(-12)
        .map((m) => ({ month: m.month, responses: m.responses, average: avgOf(m.all) })),
      comments: commented.map((f) => ({
        id: String(f._id), participant_name: f.participant_name, airline: airlineOf(f), exam_title: f.exam_title_snapshot,
        instructor_name: f.instructor_name || '', submitted_at: f.submitted_at, average: ownAvg(f), comments: f.comments,
        // Clicking a comment opens it: in its exam's feedback dialog when that
        // exam still exists, else (imports, deleted exams) from these answers.
        exam_id: f.exam_id && liveExamIds.has(String(f.exam_id)) ? String(f.exam_id) : null,
        participant_email: f.participant_email || '', company: f.company || f.airline_name || '',
        training_title: f.training_title || f.exam_title_snapshot || '', ratings: f.ratings || [],
      })),
    });
  } catch (err) {
    console.error('GET /feedback/dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load the feedback dashboard.' });
  }
};

// ─── POST /feedback/exams/:examId/email-report — email the PDF report ─────────
// Body: { to: [emails], message?, pdf_base64 }. The report is generated in the
// admin's browser (same file as Download); the server only checks it really is
// a PDF, then mails it with the exam's headline numbers in the email body.
exports.emailFeedbackReport = async (req, res) => {
  try {
    const exam = await loadIfoaExam(req, res);
    if (!exam) return;
    const { to, message, pdf_base64: b64 } = req.body;
    const pdfBuffer = Buffer.from(b64, 'base64');
    if (pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'The attachment is not a PDF.' });

    const [submitted, sent] = await Promise.all([
      TrainingFeedback.find({ exam_id: exam._id, status: 'submitted' }).select('ratings').lean(),
      TrainingFeedback.countDocuments({ exam_id: exam._id }),
    ]);
    const values = submitted.flatMap((f) => (f.ratings || []).map((r) => r.value)).filter((v) => v >= 1 && v <= 5);
    const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    const recipients = [...new Set(to.map((e) => e.trim().toLowerCase()))];

    await sendFeedbackReportEmail({
      to: recipients,
      examTitle: exam.title,
      message: (message || '').trim(),
      pdfBuffer,
      filename: `Training_Feedback_${String(exam.title).replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`,
      summary: { average, submitted: submitted.length, sent },
    });
    res.json({ sent: recipients });
  } catch (err) {
    console.error('POST /feedback/exams/:examId/email-report error:', err.message);
    res.status(500).json({ error: `Could not send the report: ${err.message}` });
  }
};
