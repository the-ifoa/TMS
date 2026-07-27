const express = require('express');
const router = express.Router();
const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const DhlCertificate = require('../models/DhlCertificate');
const { authMiddleware } = require('./auth');
const { sendSubmissionConfirmation } = require('../services/emailService');

// All participant routes require a valid token
router.use(authMiddleware);

// ─── GET all participants ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, training_type, company } = req.query;
    const filter = {};

    // Airlines see ONLY their own submissions
    if (req.admin.role === 'airline') {
      if (!req.admin.id) {
        // No ID in token — cannot safely identify ownership, return nothing
        return res.json([]);
      }

      // PRIMARY filter: match by submitted_by (MongoDB _id of the airline account).
      // This is the ONLY safe filter — two airline accounts with the same airlineName
      // (e.g. both named "indigo") must NOT see each other's data.
      const airlineFilters = [{ submitted_by: req.admin.id }];

      // LEGACY fallback: for old records that were created before submitted_by existed
      // (submitted_by === null), also match by airline_name/company name.
      // The submitted_by: null condition ensures a record owned by another airline
      // (which has a different submitted_by ObjectId) is never accidentally included.
      if (req.admin.airlineName) {
        const escaped = req.admin.airlineName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const airlineRegex = new RegExp(`^${escaped}$`, 'i');
        airlineFilters.push({
          submitted_by: null,
          $or: [
            { airline_name: airlineRegex },
            { company: airlineRegex },
          ],
        });
      }

      filter.$or = airlineFilters;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      const searchOr = {
        $or: [
          { participant_name: regex },
          { first_name: regex },
          { last_name: regex },
          { company: regex },
          { department: regex },
        ],
      };
      // If filter already has $or (airline filtering), combine with AND
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, searchOr];
        delete filter.$or;
      } else {
        Object.assign(filter, searchOr);
      }
    }
    if (training_type) filter.training_type = training_type;
    if (company) filter.company = company;

    const participantDocs = await Participant.find(filter).sort({ created_at: -1 });

    // Attach DHL ST-001 extra-cert status — lives in its own collection (see
    // GET /by-airline for the same merge on the admin grouped view).
    const ids      = participantDocs.map(p => p._id);
    const dhlCerts = await DhlCertificate.find({ participant: { $in: ids } }).lean();
    const dhlMap   = new Map(dhlCerts.map(d => [String(d.participant), d]));
    const participants = participantDocs.map((p) => {
      const obj = p.toJSON();
      const dc  = dhlMap.get(String(p._id));
      obj.dhl_cert_sequence = dc?.sequence ?? null;
      obj.dhl_cert_released = dc?.released ?? false;
      return obj;
    });

    res.json(participants);
  } catch (err) {
    console.error('GET /participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET all airlines with their participants (admin only) ────────────────────
router.get('/by-airline', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const airlines        = await Airline.find({}).sort({ airlineName: 1 });
    const participantDocs = await Participant.find({}).sort({ created_at: -1 });

    // Attach DHL ST-001 extra-cert status — lives in its own collection, so
    // it's merged in here rather than being a field on Participant itself.
    const dhlCerts = await DhlCertificate.find({}).lean();
    const dhlMap   = new Map(dhlCerts.map(d => [String(d.participant), d]));
    const participants = participantDocs.map((p) => {
      const obj = p.toJSON();
      const dc  = dhlMap.get(String(p._id));
      obj.dhl_cert_sequence = dc?.sequence ?? null;
      obj.dhl_cert_released = dc?.released ?? false;
      return obj;
    });

    const result = airlines.map((a) => ({
      airline: a.toJSON(),
      participants: participants.filter(
        (p) =>
          (p.submitted_by && String(p.submitted_by) === String(a._id)) ||
          (!p.submitted_by && (p.company === a.airlineName || p.airline_name === a.airlineName))
      ),
    }));

    // Filter out airline entries with zero participants — keeps UI clean
    const nonEmpty = result.filter(r => r.participants.length > 0);
    // Orphaned participants (submitted_by points to deleted airline) are silently
    // excluded from the admin view — they remain in DB and can be found by direct search.
    res.json(nonEmpty);
  } catch (err) {
    console.error('GET /by-airline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET all airline names (admin only) ──────────────────────────────────────
router.get('/airlines', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const airlines = await Airline.find({}).sort({ airlineName: 1 }).select('airlineName email -_id');
    res.json(airlines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET single participant ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    if (req.admin.role === 'airline') {
      const ownedById   = participant.submitted_by && String(participant.submitted_by) === String(req.admin.id);
      const ownedByName = !participant.submitted_by && participant.airline_name === req.admin.airlineName;
      if (!ownedById && !ownedByName) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    res.json(participant);
  } catch (err) {
    console.error('GET /participants/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE participant ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      first_name, last_name, email,
      participant_name,
      company, department,
      training_type, training_date,
      end_date, location, modules,
      ndg_subtype, online_synchronous,
    } = req.body;

    const fName = (first_name || '').trim()
      || (participant_name ? participant_name.trim().split(' ')[0] : '');
    const lName = (last_name || '').trim()
      || (participant_name ? participant_name.trim().split(' ').slice(1).join(' ') : '');

    const missing = [];
    if (!fName)         missing.push('First name');
    if (!lName)         missing.push('Last name');
    if (!company)       missing.push('Airline name');
    if (!department)    missing.push('Department');
    if (!training_type) missing.push('Training type');
    if (!training_date) missing.push('Training date');

    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const modulesStr = Array.isArray(modules) ? modules.join(',') : (modules || null);

    const doc = new Participant({
      first_name:       fName,
      last_name:        lName,
      email:            (email || '').trim().toLowerCase(),
      participant_name: `${fName} ${lName}`.trim(),
      company,
      department,
      training_type,
      training_date,
      end_date:          end_date  || null,
      location:          online_synchronous ? null : (location || null),
      modules:           modulesStr,
      // cert_sequence intentionally omitted — must be absent (not null) for sparse index
      ndg_subtype:       training_type === 'NDG' ? (ndg_subtype || 'I') : 'I',
      online_synchronous: !!online_synchronous,
      airline_name: req.admin.role === 'airline'
        ? (req.admin.airlineName || company)
        : company,
      submitted_by: req.admin.role === 'airline' ? req.admin.id : null,
      locked: true,
    });

    await doc.save();
    console.log('Created participant:', doc.participant_name);
    res.status(201).json(doc);
  } catch (err) {
    console.error('POST /participants error:', err.message, err.errors || '');
    res.status(500).json({ error: err.message });
  }
});

// ─── BULK CREATE participants ─────────────────────────────────────────────────
router.post('/bulk', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of participants' });
    }

    const results = [];
    for (const item of rows) {
      try {
        const {
          first_name, last_name, participant_name,
          company, department, training_type, training_date,
          end_date, location, modules,
          ndg_subtype, online_synchronous,
        } = item;

        const fName = (first_name || '').trim()
          || (participant_name ? participant_name.trim().split(' ')[0] : '');
        const lName = (last_name || '').trim()
          || (participant_name ? participant_name.trim().split(' ').slice(1).join(' ') : '');

        const missing = [];
        if (!fName)         missing.push('First name');
        if (!lName)         missing.push('Last name');
        if (!company)       missing.push('Airline name');
        if (!department)    missing.push('Department');
        if (!training_type) missing.push('Training type');
        if (!training_date) missing.push('Training date');

        if (missing.length) {
          results.push({ success: false, error: `Missing: ${missing.join(', ')}` });
          continue;
        }

        const modulesStr = Array.isArray(modules) ? modules.join(',') : (modules || null);

        const doc = new Participant({
          first_name:       fName,
          last_name:        lName,
          participant_name: `${fName} ${lName}`.trim(),
          company,
          department,
          training_type,
          training_date,
          end_date:          end_date || null,
          location:          online_synchronous ? null : (location || null),
          modules:           modulesStr,
          // cert_sequence intentionally omitted — must be absent (not null) for sparse index
          ndg_subtype:       training_type === 'NDG' ? (ndg_subtype || 'I') : 'I',
          online_synchronous: !!online_synchronous,
          airline_name: req.admin.role === 'airline'
            ? (req.admin.airlineName || company)
            : company,
          submitted_by: req.admin.role === 'airline' ? req.admin.id : null,
          locked: true,
        });

        await doc.save();
        results.push({
          success: true,
          id: doc._id,
          participant_name: doc.participant_name,
          first_name: doc.first_name,
          last_name: doc.last_name,
          department: doc.department,
        });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.status(207).json({ results, successCount, failCount: rows.length - successCount });
  } catch (err) {
    console.error('POST /participants/bulk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── SEND SUBMISSION CONFIRMATION EMAIL (airline only) ───────────────────────
router.post('/send-confirmation', async (req, res) => {
  try {
    if (req.admin.role !== 'airline') {
      return res.status(403).json({ error: 'Airline access only.' });
    }
    const { participants, trainingType, trainingDate, endDate } = req.body;
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: 'participants array required.' });
    }
    const airlineDoc = await Airline.findById(req.admin.id);
    if (!airlineDoc?.email) {
      return res.status(404).json({ error: 'Airline email not found.' });
    }
    sendSubmissionConfirmation({
      toEmail:     airlineDoc.email,
      airlineName: airlineDoc.airlineName,
      contactName: req.admin.name,
      participants,
      trainingType,
      trainingDate,
      endDate: endDate || null,
    });
    res.json({ message: 'Confirmation email queued.' });
  } catch (err) {
    console.error('POST /send-confirmation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH participant email — airline (owner) or admin ──────────────────────
// The only field an airline may change on an otherwise-locked record, so they
// can add/fix a candidate's email for exam invitations.
router.patch('/:id/email', async (req, res) => {
  try {
    const doc = await Participant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Participant not found' });

    const isOwnerAirline = req.admin.role === 'airline'
      && doc.submitted_by && String(doc.submitted_by) === String(req.admin.id);
    if (req.admin.role !== 'admin' && req.admin.role !== 'Administrator' && !isOwnerAirline) {
      return res.status(403).json({ error: 'Not allowed to edit this record.' });
    }

    doc.email = (req.body.email || '').trim().toLowerCase();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('PATCH /participants/:id/email error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE participant (admin only) ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Submitted records are locked. Only admins can edit.' });
    }

    const {
      first_name, last_name, email,
      participant_name,
      company, department,
      training_type, training_date,
      end_date, location, modules,
      ndg_subtype, online_synchronous,
    } = req.body;

    const doc = await Participant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Participant not found' });

    if (first_name !== undefined) doc.first_name = first_name.trim();
    if (last_name  !== undefined) doc.last_name  = last_name.trim();
    if (email      !== undefined) doc.email      = (email || '').trim().toLowerCase();

    if (!first_name && !last_name && participant_name) {
      const parts = participant_name.trim().split(' ');
      doc.first_name = parts[0] || doc.first_name;
      doc.last_name  = parts.slice(1).join(' ') || doc.last_name;
    }

    doc.participant_name = `${doc.first_name} ${doc.last_name}`.trim();

    if (company)       doc.company       = company;
    if (department)    doc.department    = department;
    if (training_type) doc.training_type = training_type;
    if (training_date) doc.training_date = training_date;
    if (end_date  !== undefined) doc.end_date  = end_date  || null;
    if (online_synchronous !== undefined) doc.online_synchronous = !!online_synchronous;
    if (location  !== undefined) doc.location  = doc.online_synchronous ? null : (location || null);
    if (ndg_subtype && (training_type || doc.training_type) === 'NDG') doc.ndg_subtype = ndg_subtype;
    doc.modules = Array.isArray(modules) ? modules.join(',') : (modules || null);

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('PUT /participants/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH ndg_score (admin only) ────────────────────────────────────────────
router.patch('/:id/ndg-score', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can update the NDG score.' });
    }
    const { ndg_score } = req.body;
    if (ndg_score === undefined || ndg_score === null || String(ndg_score).trim() === '') {
      return res.status(400).json({ error: 'ndg_score is required.' });
    }
    const score = Number(ndg_score);
    if (isNaN(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'ndg_score must be a number between 0 and 100.' });
    }
    const doc = await Participant.findByIdAndUpdate(
      req.params.id,
      { ndg_score: score },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Participant not found' });
    res.json(doc);
  } catch (err) {
    console.error('PATCH ndg-score error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH fdr_hours (admin only) ────────────────────────────────────────────
// Unlike ndg-score above, this accepts null/empty to CLEAR the value — the
// admin toggles hours on/off, and unchecking clears it back to unset.
router.patch('/:id/fdr-hours', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can update FDR hours.' });
    }
    const { fdr_hours } = req.body;
    let hours = null;
    if (fdr_hours !== undefined && fdr_hours !== null && String(fdr_hours).trim() !== '') {
      hours = Number(fdr_hours);
      if (isNaN(hours) || hours < 0) {
        return res.status(400).json({ error: 'fdr_hours must be a non-negative number.' });
      }
    }
    const doc = await Participant.findByIdAndUpdate(
      req.params.id,
      { fdr_hours: hours },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Participant not found' });
    res.json(doc);
  } catch (err) {
    console.error('PATCH fdr-hours error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH cert_sequence only (admin only) ───────────────────────────────────
router.patch('/:id/cert-sequence', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can update certificate numbers.' });
    }
    const { cert_sequence } = req.body;
    if (cert_sequence === undefined || cert_sequence === null || String(cert_sequence).trim() === '') {
      return res.status(400).json({ error: 'cert_sequence is required.' });
    }
    const doc = await Participant.findByIdAndUpdate(
      req.params.id,
      { cert_sequence: Number(cert_sequence) },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Participant not found' });
    res.json(doc);
  } catch (err) {
    console.error('PATCH cert-sequence error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE all participants for an airline (admin only) ──────────────────────
router.delete('/airline/:airlineName', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can perform bulk deletions.' });
    }
    const name = decodeURIComponent(req.params.airlineName);
    const filter = { $or: [{ airline_name: name }, { company: name }] };
    const ids = await Participant.find(filter, { _id: 1 }).lean();
    const result = await Participant.deleteMany(filter);
    // Cascade: free up any DHL ST-001 numbers held by the deleted participants
    await DhlCertificate.deleteMany({ participant: { $in: ids.map(d => d._id) } });
    res.json({
      message: `Deleted ${result.deletedCount} participant(s) for "${name}"`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error('DELETE /participants/airline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE airline account + all their participants by airline _id (admin only) ──────
// Safe: uses MongoDB _id so two accounts with same airlineName never collide.
router.delete('/airline-by-id/:airlineId', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can perform bulk deletions.' });
    }
    const { airlineId } = req.params;

    const airlineDoc = await Airline.findById(airlineId);
    if (!airlineDoc) return res.status(404).json({ error: 'Airline not found.' });

    // Delete participants owned by this exact account (submitted_by = _id)
    // Also catch legacy records that have no submitted_by but match the name
    const deleteFilter = {
      $or: [
        { submitted_by: airlineDoc._id },
        {
          submitted_by: null,
          $or: [
            { airline_name: airlineDoc.airlineName },
            { company:      airlineDoc.airlineName },
          ],
        },
      ],
    };
    const ids = await Participant.find(deleteFilter, { _id: 1 }).lean();
    const result = await Participant.deleteMany(deleteFilter);
    // Cascade: free up any DHL ST-001 numbers held by the deleted participants
    await DhlCertificate.deleteMany({ participant: { $in: ids.map(d => d._id) } });

    // NOTE: The Airline account document is intentionally NOT deleted here.
    // The airline can still log in — only their participant submissions are removed
    // from the admin view.

    res.json({
      message: `Removed ${result.deletedCount} participant(s) for "${airlineDoc.airlineName}".`,
      deletedCount: result.deletedCount,
      airlineId,
    });
  } catch (err) {
    console.error('DELETE /participants/airline-by-id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE single participant (admin only) ───────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can delete records.' });
    }
    const deleted = await Participant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Participant not found' });
    // Cascade: free up the DHL ST-001 number, if any, held by this participant
    await DhlCertificate.deleteOne({ participant: deleted._id });
    res.json({ message: 'Participant deleted successfully' });
  } catch (err) {
    console.error('DELETE /participants/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:id/validity (admin only) ───────────────────────────────────────
router.patch('/:id/validity', async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admins only' });
    const { cert_validity } = req.body;
    const allowed = ['12', '24', '36', 'Unlimited'];
    if (!allowed.includes(cert_validity)) return res.status(400).json({ error: 'Invalid validity value' });
    const doc = await Participant.findByIdAndUpdate(req.params.id, { cert_validity }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Participant not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:id/revoke-cert (admin only) ─────────────────────────────────────
// Revokes access AND clears cert_sequence so the next generate always assigns
// a brand-new unique number — the old number is never reused.
router.patch('/:id/revoke-cert', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can revoke certificates.' });
    }
    const doc = await Participant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Participant not found.' });
    if (!doc.cert_sequence && !doc.cert_released) {
      return res.status(400).json({ error: 'No certificate exists to revoke for this participant.' });
    }
    // Clear BOTH cert_sequence AND cert_released:
    // — cert_released = false  → airline immediately loses access
    // — $unset cert_sequence   → field fully absent (not null) so sparse index ignores it
    await Participant.updateOne(
      { _id: doc._id },
      { $unset: { cert_sequence: '' }, $set: { cert_released: false } }
    );
    const updated = await Participant.findById(doc._id);
    res.json({ message: `Certificate revoked for ${doc.participant_name}.`, participant: updated });
  } catch (err) {
    console.error('PATCH revoke-cert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:id/revoke-dhl-cert (admin only) ─────────────────────────────────
// Revokes the extra DHL ST-001 certificate. Unsetting `sequence` is what frees
// the number for the next reserveDhlCertSequence() gap-fill scan — no separate
// "release" bookkeeping needed, same mechanic as revoke-cert above.
router.patch('/:id/revoke-dhl-cert', async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can revoke certificates.' });
    }
    const doc = await Participant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Participant not found.' });

    const dhlCert = await DhlCertificate.findOne({ participant: doc._id });
    if (!dhlCert || (!dhlCert.sequence && !dhlCert.released)) {
      return res.status(400).json({ error: 'No DHL certificate exists to revoke for this participant.' });
    }
    await DhlCertificate.updateOne(
      { _id: dhlCert._id },
      { $unset: { sequence: '' }, $set: { released: false } }
    );
    res.json({ message: `DHL certificate revoked for ${doc.participant_name}.` });
  } catch (err) {
    console.error('PATCH revoke-dhl-cert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /:id/full-cert-id (admin only) ────────────────────────────────────
router.patch('/:id/full-cert-id', async (req, res) => {
  try {
    if (req.admin.role === 'airline') return res.status(403).json({ error: 'Admins only' });
    const { cert_sequence, cert_year } = req.body;
    const seq  = Number(cert_sequence);
    const year = Number(cert_year);
    if (!seq  || seq  <= 0)                  return res.status(400).json({ error: 'Invalid sequence' });
    if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: 'Invalid year' });

    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    const dup = await Participant.findOne({
      _id: { $ne: req.params.id },
      training_type: participant.training_type,
      cert_sequence: seq,
    });
    if (dup) return res.status(409).json({ error: `This number is already used by ${dup.participant_name}` });

    await Participant.findByIdAndUpdate(req.params.id, { cert_sequence: seq, cert_year_override: year });
    res.json({ message: 'Updated', cert_sequence: seq, cert_year: year });
  } catch (err) {
    console.error('PATCH full-cert-id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
