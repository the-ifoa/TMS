// ─────────────────────────────────────────────────────────────────────────────
//  Internal certificates — an airline's OWN certificate PDFs, uploaded per
//  candidate and stored in Cloudflare R2. We never generate these.
//
//  Who can touch a candidate's certificates:
//   • admin            → any candidate (reads; super admin may also write)
//   • department       → only candidates in its own list (submitted_by = self)
//   • top-level airline → its own candidates AND its departments' candidates
//  Writes additionally need `internalCerts.manage`, which only exists when an
//  admin has switched on `can_upload_internal_certs` for the airline (see
//  middleware/permissions.js ADMIN_GATED_AIRLINE_KEYS).
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const InternalCertificate = require('../models/InternalCertificate');
const r2 = require('../services/r2');
const { compressPdf } = require('../services/pdfCompress');

// Load the participant and verify the caller may access its certificates.
async function loadAccessibleParticipant(req, participantId) {
  const p = await Participant.findById(participantId)
    .select('submitted_by company airline_name participant_name')
    .lean()
    .catch(() => null);
  if (!p) return null;
  const s = req.scope || {};
  if (s.kind === 'admin') return p;

  const owner = p.submitted_by ? String(p.submitted_by) : null;
  if (s.isDepartment) return owner === String(s.selfId) ? p : null;

  const tree = [String(s.topAirlineId), ...(s.departmentIds || [])];
  if (owner) return tree.includes(owner) ? p : null;
  // Legacy record with no owner id — match by airline name, like the list view.
  const name = (req.admin.airlineName || '').toLowerCase();
  const matches = [p.company, p.airline_name].some((v) => (v || '').toLowerCase() === name);
  return name && matches ? p : null;
}

// Mongo filter for every participant the caller may see certificates for —
// mirrors loadAccessibleParticipant. null = no restriction (admin).
function accessibleParticipantFilter(req) {
  const s = req.scope || {};
  if (s.kind === 'admin') return null;
  if (s.isDepartment) return { submitted_by: s.selfId };
  const tree = [String(s.topAirlineId), ...(s.departmentIds || [])];
  const clauses = [{ submitted_by: { $in: tree } }];
  const name = req.admin.airlineName;
  if (name) {
    const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    clauses.push({ submitted_by: null, $or: [{ company: rx }, { airline_name: rx }] });
  }
  return { $or: clauses };
}

async function uploaderName(req) {
  if (req.scope.kind === 'airline') {
    const me = await Airline.findById(req.admin.id).select('department_name airlineName').lean();
    if (me) return me.department_name || me.airlineName;
  }
  return req.admin.name || req.admin.email || '';
}

// ─── GET /api/internal-certificates/participant/:participantId ──────────────
exports.listForParticipant = async (req, res) => {
  try {
    const p = await loadAccessibleParticipant(req, req.params.participantId);
    if (!p) return res.status(404).json({ error: 'Candidate not found.' });
    const docs = await InternalCertificate.find({ participant: p._id }).sort({ createdAt: -1 });
    res.json({ certificates: docs.map((d) => d.toJSON()), storageConfigured: r2.isConfigured });
  } catch (err) {
    console.error('GET internal-certificates error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET /api/internal-certificates — every certificate the caller can see ──
exports.listAll = async (req, res) => {
  try {
    const pFilter = accessibleParticipantFilter(req);
    const certFilter = {};
    if (pFilter) {
      const ids = await Participant.find(pFilter).distinct('_id');
      certFilter.participant = { $in: ids };
    }
    const docs = await InternalCertificate.find(certFilter)
      .sort({ createdAt: -1 })
      .populate('participant', 'participant_name email submitted_by');

    // Label each candidate with the department that owns it (main airline view).
    const ownerIds = [...new Set(docs.map((d) => d.participant?.submitted_by).filter(Boolean).map(String))];
    const owners = await Airline.find({ _id: { $in: ownerIds } })
      .select('department_name airlineName is_department').lean();
    const ownerName = Object.fromEntries(owners.map((o) => [
      String(o._id), o.is_department ? (o.department_name || o.airlineName) : o.airlineName,
    ]));

    res.json({
      certificates: docs.map((d) => {
        const p = d.participant;
        return {
          ...d.toJSON(),
          participant: p ? {
            id: String(p._id),
            participant_name: p.participant_name,
            email: p.email,
            owner_name: p.submitted_by ? ownerName[String(p.submitted_by)] || '' : '',
          } : null,
        };
      }),
    });
  } catch (err) {
    console.error('GET internal-certificates (all) error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/internal-certificates/participant/:participantId (multipart) ─
exports.upload = async (req, res) => {
  try {
    const p = await loadAccessibleParticipant(req, req.params.participantId);
    if (!p) return res.status(404).json({ error: 'Candidate not found.' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Attach a PDF file.' });
    const { title, issued_on, expires_on } = req.body;
    const noExpiry = req.body.no_expiry === 'true' || req.body.no_expiry === true;
    if (!noExpiry && issued_on && expires_on && new Date(expires_on) < new Date(issued_on))
      return res.status(400).json({ error: 'Expiry date cannot be before the issue date.' });
    // Content sniff, not just the browser-reported mimetype.
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-')
      return res.status(400).json({ error: 'Only PDF files are allowed.' });

    const s = req.scope;
    let ownerAirline = s.kind === 'airline' ? s.topAirlineId : null;
    if (!ownerAirline && p.submitted_by) {
      // Admin upload: file it under the candidate's top-level airline.
      const owner = await Airline.findById(p.submitted_by).select('parent_airline').lean();
      ownerAirline = owner ? String(owner.parent_airline || owner._id) : null;
    }
    const key = `internal-certs/${ownerAirline || 'unowned'}/${p._id}/${crypto.randomUUID()}.pdf`;
    // Shrink before storing (Ghostscript); falls back to the original bytes.
    const { buffer: stored } = await compressPdf(file.buffer);
    await r2.putObject(key, stored, 'application/pdf');

    const doc = await InternalCertificate.create({
      participant: p._id,
      owner_airline: ownerAirline,
      uploaded_by: req.admin.id,
      uploaded_by_role: s.kind === 'admin' ? 'admin' : 'airline',
      uploaded_by_name: await uploaderName(req),
      title: (title || '').trim() || file.originalname.replace(/\.pdf$/i, ''),
      issued_on: issued_on || null,
      expires_on: noExpiry ? null : (expires_on || null),
      no_expiry: noExpiry,
      r2_key: key,
      original_name: file.originalname,
      size: stored.length,
      original_size: file.size,
    });
    res.status(201).json({ certificate: doc.toJSON() });
  } catch (err) {
    console.error('POST internal-certificates error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

async function loadAccessibleCert(req) {
  const doc = await InternalCertificate.findById(req.params.id).catch(() => null);
  if (!doc) return null;
  const p = await loadAccessibleParticipant(req, doc.participant);
  return p ? doc : null;
}

// ─── GET /api/internal-certificates/:id/file — stream the PDF ──────────────
exports.download = async (req, res) => {
  try {
    const doc = await loadAccessibleCert(req);
    if (!doc) return res.status(404).json({ error: 'Certificate not found.' });
    const obj = await r2.getObject(doc.r2_key);
    const safeName = (doc.original_name || 'certificate.pdf').replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safeName}"`);
    obj.Body.pipe(res);
  } catch (err) {
    console.error('GET internal-certificate file error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── DELETE /api/internal-certificates/:id ─────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const doc = await loadAccessibleCert(req);
    if (!doc) return res.status(404).json({ error: 'Certificate not found.' });
    // A department may only delete what it uploaded itself.
    if (req.scope.isDepartment && String(doc.uploaded_by) !== String(req.admin.id))
      return res.status(403).json({ error: 'You can only delete certificates your department uploaded.' });
    await r2.deleteObject(doc.r2_key);
    await doc.deleteOne();
    res.json({ message: 'Certificate deleted.' });
  } catch (err) {
    console.error('DELETE internal-certificate error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};
