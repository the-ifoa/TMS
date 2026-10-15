const Exam = require('../../models/Exam');
const ExamAttempt = require('../../models/ExamAttempt');
const Airline = require('../../models/Airline');
const Participant = require('../../models/Participant');
const { sendExamCertificateEmail } = require('../../services/emailService');
const { resolveEmailBranding } = require('../../services/emailBranding');
const r2 = require('../../services/r2');
const { canManageExam, pct1 } = require('./access');

// ─── Airline-uploaded certificates (one per passed attempt) ────────────────────
// The airline uploads its own certificate for a candidate who passed, then
// emails it to them. Nothing is generated, and the candidate never downloads
// it from the exam link — the email is the only delivery channel.

// What the client may know about an attempt's certificate (never the storage key).
function certificateSummary(attempt) {
  const c = attempt.certificate;
  if (!c || !c.r2_key) return null;
  return {
    original_name: c.original_name, content_type: c.content_type, size: c.size,
    uploaded_at: c.uploaded_at, emailed_at: c.emailed_at, emailed_to: c.emailed_to,
  };
}

// Loads the attempt + its exam and checks the caller may manage that exam.
// Sends the error response itself and returns null when access is refused.
async function loadManagedAttempt(req, res) {
  const attempt = await ExamAttempt.findById(req.params.attemptId).select('-questions_snapshot -answers');
  if (!attempt) { res.status(404).json({ error: 'Attempt not found.' }); return null; }
  const exam = await Exam.findById(attempt.exam_id).select('title owner_airline owner_department');
  if (!exam || !canManageExam(req, exam)) { res.status(403).json({ error: 'Access denied.' }); return null; }
  return { attempt, exam };
}

const CERT_EXT = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

// ─── POST /exams/attempts/:attemptId/certificate — upload / replace ────────────
exports.uploadAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt } = loaded;
    if (attempt.passed !== true) {
      return res.status(400).json({ error: 'A certificate can only be uploaded for a candidate who passed.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a certificate file to upload.' });

    const ext = CERT_EXT[req.file.mimetype];
    const key = `exam-certificates/${attempt.exam_id}/${attempt._id}-${Date.now()}.${ext}`;
    await r2.putObject(key, req.file.buffer, req.file.mimetype);
    const previousKey = attempt.certificate && attempt.certificate.r2_key;

    attempt.certificate = {
      r2_key: key,
      original_name: req.file.originalname || `certificate.${ext}`,
      content_type: req.file.mimetype,
      size: req.file.size,
      uploaded_at: new Date(),
      emailed_at: null, // a replaced file has not been sent yet
      emailed_to: '',
    };
    await attempt.save();
    if (previousKey) await r2.deleteObject(previousKey).catch(() => {});
    res.json({ certificate: certificateSummary(attempt) });
  } catch (err) {
    console.error('POST /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET /exams/attempts/:attemptId/certificate — view the uploaded file ───────
exports.getAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const c = loaded.attempt.certificate;
    if (!c || !c.r2_key) return res.status(404).json({ error: 'No certificate has been uploaded.' });
    const obj = await r2.getObject(c.r2_key);
    const safeName = (c.original_name || 'certificate').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', c.content_type || 'application/octet-stream');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    obj.Body.pipe(res);
  } catch (err) {
    console.error('GET /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── DELETE /exams/attempts/:attemptId/certificate — remove the file ───────────
exports.deleteAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt } = loaded;
    const key = attempt.certificate && attempt.certificate.r2_key;
    if (!key) return res.status(404).json({ error: 'No certificate has been uploaded.' });
    attempt.certificate = undefined;
    await attempt.save();
    await r2.deleteObject(key).catch(() => {});
    res.json({ certificate: null });
  } catch (err) {
    console.error('DELETE /exams/attempts/:id/certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── POST /exams/attempts/:attemptId/certificate/send — email it to the candidate ─
exports.sendAttemptCertificate = async (req, res) => {
  try {
    const loaded = await loadManagedAttempt(req, res);
    if (!loaded) return;
    const { attempt, exam } = loaded;
    const c = attempt.certificate;
    if (!c || !c.r2_key) return res.status(400).json({ error: 'Upload the certificate first.' });

    const participant = await Participant.findById(attempt.participant_id).select('email participant_name');
    const toEmail = participant && participant.email;
    if (!toEmail) return res.status(400).json({ error: 'This candidate has no email address on file.' });

    const obj = await r2.getObject(c.r2_key);
    const content = Buffer.from(await obj.Body.transformToByteArray());
    const issuerId = attempt.airline_id || exam.owner_airline;
    const issuer = issuerId ? await Airline.findById(issuerId).select('airlineName').lean() : null;
    const pct = attempt.percentage != null ? `${pct1(attempt.percentage)}%` : '';

    await sendExamCertificateEmail({
      toEmail,
      participantName: attempt.participant_name || (participant && participant.participant_name),
      examTitle: attempt.exam_title_snapshot || exam.title,
      scoreText: pct,
      file: { content, filename: c.original_name || 'certificate', contentType: c.content_type },
      issuerName: issuer && issuer.airlineName,
      branding: await resolveEmailBranding(issuerId).catch(() => null),
    });

    attempt.certificate.emailed_at = new Date();
    attempt.certificate.emailed_to = toEmail;
    await attempt.save();
    res.json({ certificate: certificateSummary(attempt) });
  } catch (err) {
    console.error('POST /exams/attempts/:id/certificate/send error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

Object.assign(exports, { certificateSummary, loadManagedAttempt, CERT_EXT });
