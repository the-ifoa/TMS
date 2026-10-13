// ─────────────────────────────────────────────────────────────────────────────
//  Internal assessments — an airline's OWN assessments: a titled list of
//  candidates (picked from its participants or typed in manually), each with
//  an optional certificate PDF stored in Cloudflare R2.
//
//  Who can touch an assessment:
//   • department        → only the ones it created
//   • top-level airline → its own AND its departments'
//  Every route needs `internalAssessments.manage`, which only exists when an
//  admin has switched on `can_manage_internal_assessments` for the airline (see
//  middleware/permissions.js ADMIN_GATED_AIRLINE_KEYS).
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const InternalAssessment = require('../models/InternalAssessment');
const r2 = require('../services/r2');
const { compressPdf } = require('../services/pdfCompress');
const { accessibleParticipantFilter } = require('./internalCertificatesController');

// Mongo filter for the assessments the caller may see. null = none.
function scopeFilter(req) {
  const s = req.scope || {};
  if (s.kind !== 'airline') return null;
  if (s.isDepartment) return { created_by: s.selfId };
  return { owner_airline: s.topAirlineId };
}

async function loadAssessment(req) {
  const filter = scopeFilter(req);
  if (!filter) return null;
  return InternalAssessment.findOne({ _id: req.params.id, ...filter }).catch(() => null);
}

async function accountName(req) {
  const me = await Airline.findById(req.admin.id).select('department_name airlineName').lean();
  return me ? (me.department_name || me.airlineName) : (req.admin.name || req.admin.email || '');
}

// Best effort — a missing/unreachable object must not block the DB change.
async function dropObject(key) {
  if (!key) return;
  try { await r2.deleteObject(key); } catch (err) { console.error('R2 delete failed:', key, err.message); }
}

function airlineOnly(req, res) {
  if (req.scope?.kind === 'airline') return true;
  res.status(403).json({ error: 'Internal assessments are managed by the airline.' });
  return false;
}

// ─── GET /api/internal-assessments ──────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const filter = scopeFilter(req);
    if (!filter) return res.json({ assessments: [] });
    const docs = await InternalAssessment.find(filter).sort({ createdAt: -1 });
    res.json({ assessments: docs.map((d) => d.toJSON()), storageConfigured: r2.isConfigured });
  } catch (err) {
    console.error('GET internal-assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/internal-assessments ─────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    if (!airlineOnly(req, res)) return;
    const { title, description, assessment_date } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Give the assessment a title.' });
    const doc = await InternalAssessment.create({
      owner_airline: req.scope.topAirlineId,
      created_by: req.scope.selfId,
      created_by_name: await accountName(req),
      title: String(title).trim(),
      description: (description || '').trim(),
      assessment_date: assessment_date || null,
    });
    res.status(201).json({ assessment: doc.toJSON() });
  } catch (err) {
    console.error('POST internal-assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── PATCH /api/internal-assessments/:id ────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    if (!doc) return res.status(404).json({ error: 'Assessment not found.' });
    const { title, description, assessment_date } = req.body;
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
      doc.title = String(title).trim();
    }
    if (description !== undefined) doc.description = (description || '').trim();
    if (assessment_date !== undefined) doc.assessment_date = assessment_date || null;
    await doc.save();
    res.json({ assessment: doc.toJSON() });
  } catch (err) {
    console.error('PATCH internal-assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /api/internal-assessments/:id ───────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    if (!doc) return res.status(404).json({ error: 'Assessment not found.' });
    await Promise.all(doc.candidates.map((c) => dropObject(c.certificate?.r2_key)));
    await doc.deleteOne();
    res.json({ message: 'Assessment deleted.' });
  } catch (err) {
    console.error('DELETE internal-assessments error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/internal-assessments/:id/candidates ──────────────────────────
// Body: { participant_ids: [id], manual: [{ name, email }] }
exports.addCandidates = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    if (!doc) return res.status(404).json({ error: 'Assessment not found.' });
    const participantIds = Array.isArray(req.body.participant_ids) ? req.body.participant_ids : [];
    const manual = Array.isArray(req.body.manual) ? req.body.manual : [];

    const have = new Set(doc.candidates.map((c) => String(c.participant || '')).filter(Boolean));
    let added = 0;

    if (participantIds.length) {
      // Only participants the caller can actually see.
      const people = await Participant.find({
        $and: [{ _id: { $in: participantIds } }, accessibleParticipantFilter(req) || {}],
      }).select('participant_name email').lean();
      people.forEach((p) => {
        if (have.has(String(p._id))) return;
        have.add(String(p._id));
        doc.candidates.push({ participant: p._id, name: p.participant_name || 'Unnamed', email: p.email || '' });
        added += 1;
      });
    }

    manual.forEach((m) => {
      const name = String(m?.name || '').trim();
      if (!name) return;
      doc.candidates.push({ participant: null, name, email: String(m.email || '').trim() });
      added += 1;
    });

    if (!added) return res.status(400).json({ error: 'No new candidates to add.' });
    await doc.save();
    res.status(201).json({ assessment: doc.toJSON(), added });
  } catch (err) {
    console.error('POST internal-assessments candidates error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /api/internal-assessments/:id/candidates/:candidateId ───────────
exports.removeCandidate = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    const cand = doc?.candidates.id(req.params.candidateId);
    if (!cand) return res.status(404).json({ error: 'Candidate not found.' });
    await dropObject(cand.certificate?.r2_key);
    doc.candidates.pull(cand._id);
    await doc.save();
    res.json({ assessment: doc.toJSON() });
  } catch (err) {
    console.error('DELETE internal-assessments candidate error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/internal-assessments/:id/candidates/:candidateId/certificate ─
// Multipart `file` (PDF). Replaces any certificate already uploaded.
exports.uploadCertificate = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    const cand = doc?.candidates.id(req.params.candidateId);
    if (!cand) return res.status(404).json({ error: 'Candidate not found.' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Attach a PDF file.' });
    // Content sniff, not just the browser-reported mimetype.
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-')
      return res.status(400).json({ error: 'Only PDF files are allowed.' });

    const key = `internal-assessments/${doc.owner_airline}/${doc._id}/${crypto.randomUUID()}.pdf`;
    // Shrink before storing (Ghostscript); falls back to the original bytes.
    const { buffer: stored } = await compressPdf(file.buffer);
    await r2.putObject(key, stored, 'application/pdf');

    const oldKey = cand.certificate?.r2_key;
    cand.certificate = {
      r2_key: key,
      original_name: file.originalname,
      size: stored.length,
      uploaded_at: new Date(),
      uploaded_by_name: await accountName(req),
    };
    await doc.save();
    await dropObject(oldKey);
    res.status(201).json({ assessment: doc.toJSON() });
  } catch (err) {
    console.error('POST internal-assessments certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── GET /api/internal-assessments/:id/candidates/:candidateId/certificate ──
exports.downloadCertificate = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    const cand = doc?.candidates.id(req.params.candidateId);
    if (!cand?.certificate?.r2_key) return res.status(404).json({ error: 'Certificate not found.' });
    const obj = await r2.getObject(cand.certificate.r2_key);
    const safeName = (cand.certificate.original_name || 'certificate.pdf').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safeName}"`);
    obj.Body.pipe(res);
  } catch (err) {
    console.error('GET internal-assessments certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── DELETE /api/internal-assessments/:id/candidates/:candidateId/certificate
exports.removeCertificate = async (req, res) => {
  try {
    const doc = await loadAssessment(req);
    const cand = doc?.candidates.id(req.params.candidateId);
    if (!cand?.certificate?.r2_key) return res.status(404).json({ error: 'Certificate not found.' });
    await dropObject(cand.certificate.r2_key);
    cand.certificate = { r2_key: null, original_name: '', size: 0, uploaded_at: null, uploaded_by_name: '' };
    await doc.save();
    res.json({ assessment: doc.toJSON() });
  } catch (err) {
    console.error('DELETE internal-assessments certificate error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
