const Participant = require('../models/Participant');
const Airline = require('../models/Airline');
const DhlCertificate = require('../models/DhlCertificate');
const { sendSubmissionConfirmation } = require('../services/emailService');

// Owner (`submitted_by`) for a newly created participant.
//   admin              → null
//   top-level airline  → its own id
//   department         → ALWAYS its own id. A department keeps a completely
//                        separate participant list from the main airline; the
//                        record never lands in the shared main list.
function resolveOwnerOnCreate(req) {
  if (req.admin.role !== 'airline') return null;
  const s = req.scope;
  if (s && s.isDepartment) return s.selfId;
  return req.admin.id;
}

// Owner ids a caller is allowed to SEE in the participant list.
//   admin              → null (no ownership filter — sees everything)
//   department         → only its own records
//   top-level airline  → only its own records, NOT its departments' (those are
//                        private to each department)
function visibleOwnerIds(req) {
  if (req.admin.role !== 'airline') return null;
  const s = req.scope || {};
  if (s.isDepartment) return [String(s.selfId || req.admin.id)];
  return [String(s.topAirlineId || req.admin.id)];
}

// ─── PATCH /participants/:id/scope — DEPRECATED ─────────────────────────────
//     A department's participant list is now fully separate from the main
//     airline's: records are never moved between the two. Kept only so old
//     clients get a clear message instead of a silent failure.
exports.updateParticipantScope = async (_req, res) => {
  res.status(410).json({
    error: 'Participant lists are now separate per department; records can no longer be moved between a department and the main airline.',
  });
};

// ─── GET all participants ─────────────────────────────────────────────────────
exports.listParticipants = async (req, res) => {
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
      // A department sees ONLY its own records; a top-level airline sees only its
      // own — NOT its departments' (each department keeps a separate list).
      const visibleIds = visibleOwnerIds(req) || [req.admin.id];
      const airlineFilters = [{ submitted_by: { $in: visibleIds } }];

      // LEGACY fallback: for old records that were created before submitted_by existed
      // (submitted_by === null), also match by airline_name/company name.
      // The submitted_by: null condition ensures a record owned by another airline
      // (which has a different submitted_by ObjectId) is never accidentally included.
      // Departments are excluded — a legacy record has no owner, so it belongs to
      // the main airline list, never a department's private list.
      if (req.admin.airlineName && !(req.scope && req.scope.isDepartment)) {
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

    // Airline side: tag each record with which account submitted it — the main
    // airline account or a specific department — so the UI can label & filter.
    if (req.scope && req.scope.kind === 'airline') {
      const ownerIds = [...new Set(participants.map(p => String(p.submitted_by || '')).filter(Boolean))];
      const ownerDocs = await Airline.find({ _id: { $in: ownerIds } })
        .select('airlineName department_name is_department parent_airline');
      const infoById = {};
      ownerDocs.forEach((a) => {
        infoById[String(a._id)] = {
          label: a.is_department
            ? (a.department_name || a.name || 'Department')
            : `${a.airlineName} · main account`,
          isDepartment: !!a.is_department,
        };
      });
      participants.forEach((p) => {
        const oid = String(p.submitted_by || '');
        const info = infoById[oid];
        p.owner_id = oid || null;
        p.owner_label = info ? info.label : 'Unknown';
        p.owner_is_department = info ? info.isDepartment : false;
      });
    }

    res.json(participants);
  } catch (err) {
    console.error('GET /participants error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET all airlines with their participants (admin only) ────────────────────
exports.listByAirline = async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    // Only top-level airline accounts appear as cards here — department
    // sub-users (parent_airline set) are managed from the Team page instead.
    // Their participants still roll up under the parent airline's card.
    const airlines        = await Airline.find({ parent_airline: null }).sort({ airlineName: 1 });
    const departments     = await Airline.find({ parent_airline: { $ne: null } }).select('parent_airline').lean();
    const parentByDept    = new Map(departments.map(d => [String(d._id), String(d.parent_airline)]));
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
      participants: participants.filter((p) => {
        if (p.submitted_by) {
          const owner = String(p.submitted_by);
          return owner === String(a._id) || parentByDept.get(owner) === String(a._id);
        }
        return p.company === a.airlineName || p.airline_name === a.airlineName;
      }),
    }));

    // Return every airline, including ones with zero submissions — the admin UI
    // has a "Empty airlines" toggle that decides whether to show them.
    // Orphaned participants (submitted_by points to deleted airline) are silently
    // excluded from the admin view — they remain in DB and can be found by direct search.
    res.json(result);
  } catch (err) {
    console.error('GET /by-airline error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET all airline names (admin only) ──────────────────────────────────────
exports.listAirlineNames = async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    const airlines = await Airline.find({}).sort({ airlineName: 1 }).select('airlineName email -_id');
    res.json(airlines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET single participant ───────────────────────────────────────────────────
exports.getParticipant = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    if (req.admin.role === 'airline') {
      const isDept = !!(req.scope && req.scope.isDepartment);
      const ownedById   = participant.submitted_by && String(participant.submitted_by) === String(req.admin.id);
      // Legacy name fallback only for a top-level airline — a department has no
      // legacy records (its roster is always explicitly owned) and must not read
      // the parent airline's unowned records via the shared airlineName.
      const ownedByName = !isDept && !participant.submitted_by && participant.airline_name === req.admin.airlineName;
      if (!ownedById && !ownedByName) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    res.json(participant);
  } catch (err) {
    console.error('GET /participants/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── CREATE participant ───────────────────────────────────────────────────────
exports.createParticipant = async (req, res) => {
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
      // Ownership: an admin → null. A top-level airline → itself. A department →
      // always itself; a department's participants are a separate list, never
      // merged into the main airline's.
      submitted_by: resolveOwnerOnCreate(req),
      locked: true,
    });

    await doc.save();
    console.log('Created participant:', doc.participant_name);
    res.status(201).json(doc);
  } catch (err) {
    console.error('POST /participants error:', err.message, err.errors || '');
    res.status(500).json({ error: err.message });
  }
};

// ─── CREATE a "My Team" candidate (department only) ─────────────────────────
//   A lightweight roster entry: name + email only. company/department are
//   auto-filled from the department's own account; no training is assigned yet.
exports.createCandidate = async (req, res) => {
  try {
    const s = req.scope;
    if (!s || s.kind !== 'airline' || !s.isDepartment) {
      return res.status(403).json({ error: 'Only a department can add team candidates.' });
    }

    const email = (req.body.email || '').trim().toLowerCase();
    let fName = (req.body.first_name || '').trim();
    let lName = (req.body.last_name || '').trim();
    if (!fName && !lName && req.body.participant_name) {
      const parts = String(req.body.participant_name).trim().split(/\s+/);
      fName = parts[0] || '';
      lName = parts.slice(1).join(' ');
    }
    if (!fName) return res.status(400).json({ error: 'First name is required.' });

    const me = await Airline.findById(req.admin.id).select('airlineName department_name name');
    const company    = me?.airlineName || req.admin.airlineName || 'Airline';
    const department = me?.department_name || me?.name || 'Department';

    const doc = new Participant({
      first_name:       fName,
      last_name:        lName,
      participant_name: `${fName} ${lName}`.trim(),
      email,
      company,
      department,
      training_type:    null,
      training_date:    null,
      airline_name:     company,
      submitted_by:     req.admin.id,   // department owns its own roster
      locked:           true,
    });

    await doc.save();
    res.status(201).json(doc.toJSON());
  } catch (err) {
    console.error('POST /participants/candidate error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── BULK CREATE participants ─────────────────────────────────────────────────
exports.bulkCreateParticipants = async (req, res) => {
  try {
    const body = req.body;
    // Accept either a bare array (legacy) or { rows }.
    const rows = Array.isArray(body) ? body : (body.rows || []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Expected a non-empty array of participants' });
    }
    const owner = resolveOwnerOnCreate(req);

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
          submitted_by: owner,
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
};

// ─── SEND SUBMISSION CONFIRMATION EMAIL (airline only) ───────────────────────
exports.sendConfirmation = async (req, res) => {
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
};

// ─── PATCH participant email — airline (owner) or admin ──────────────────────
// The only field an airline may change on an otherwise-locked record, so they
// can add/fix a candidate's email for exam invitations.
exports.updateEmail = async (req, res) => {
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
};

// ─── UPDATE participant ─────────────────────────────────────────────────────
//   • admin (with participants.edit) — may edit any record
//   • airline (with participants.edit) — may edit ONLY a record it owns
//     (submitted_by === its own account id). Departments own their own list.
exports.updateParticipant = async (req, res) => {
  try {
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

    if (req.admin.role === 'airline') {
      const owns = doc.submitted_by && String(doc.submitted_by) === String(req.admin.id);
      if (!owns) {
        return res.status(403).json({ error: 'You can only edit records in your own list.' });
      }
    }

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
};

// ─── PATCH ndg_score (admin only) ────────────────────────────────────────────
exports.updateNdgScore = async (req, res) => {
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
};

// ─── PATCH fdr_hours (admin only) ────────────────────────────────────────────
// Unlike ndg-score above, this accepts null/empty to CLEAR the value — the
// admin toggles hours on/off, and unchecking clears it back to unset.
exports.updateFdrHours = async (req, res) => {
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
};

// ─── PATCH cert_sequence only (admin only) ───────────────────────────────────
exports.updateCertSequence = async (req, res) => {
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
};

// ─── DELETE all participants for an airline (admin only) ──────────────────────
exports.deleteByAirlineName = async (req, res) => {
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
};

// ─── DELETE airline account + all their participants by airline _id (admin only) ──────
// Safe: uses MongoDB _id so two accounts with same airlineName never collide.
exports.deleteByAirlineId = async (req, res) => {
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
};

// ─── DELETE the airline account document itself + any submissions (admin only) ────────
// Unlike deleteByAirlineId, this also removes the Airline doc, so the account and
// its login are gone. Used by the admin grid to fully remove empty airlines.
exports.deleteAirlineAccount = async (req, res) => {
  try {
    if (req.admin.role === 'airline') {
      return res.status(403).json({ error: 'Only admins can delete airline accounts.' });
    }
    const { airlineId } = req.params;

    const airlineDoc = await Airline.findById(airlineId);
    if (!airlineDoc) return res.status(404).json({ error: 'Airline not found.' });

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
    const ids    = await Participant.find(deleteFilter, { _id: 1 }).lean();
    const result = await Participant.deleteMany(deleteFilter);
    await DhlCertificate.deleteMany({ participant: { $in: ids.map(d => d._id) } });
    await Airline.findByIdAndDelete(airlineId);

    res.json({
      message: `Deleted airline "${airlineDoc.airlineName}"${result.deletedCount ? ` and ${result.deletedCount} submission(s)` : ''}.`,
      deletedCount: result.deletedCount,
      airlineId,
    });
  } catch (err) {
    console.error('DELETE /participants/airline-account error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE single participant ──────────────────────────────────────────────
//   • admin (with participants.delete) — any record
//   • airline (with participants.delete) — ONLY a record it owns
exports.deleteParticipant = async (req, res) => {
  try {
    const doc = await Participant.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Participant not found' });

    if (req.admin.role === 'airline') {
      const owns = doc.submitted_by && String(doc.submitted_by) === String(req.admin.id);
      if (!owns) {
        return res.status(403).json({ error: 'You can only delete records in your own list.' });
      }
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
};

// ─── PATCH /:id/validity (admin only) ───────────────────────────────────────
exports.updateValidity = async (req, res) => {
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
};

// ─── PATCH /:id/revoke-cert (admin only) ─────────────────────────────────────
// Revokes access AND clears cert_sequence so the next generate always assigns
// a brand-new unique number — the old number is never reused.
exports.revokeCert = async (req, res) => {
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
};

// ─── PATCH /:id/revoke-dhl-cert (admin only) ─────────────────────────────────
// Revokes the extra DHL ST-001 certificate. Unsetting `sequence` is what frees
// the number for the next reserveDhlCertSequence() gap-fill scan — no separate
// "release" bookkeeping needed, same mechanic as revoke-cert above.
exports.revokeDhlCert = async (req, res) => {
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
};

// ─── PATCH /:id/full-cert-id (admin only) ────────────────────────────────────
exports.updateFullCertId = async (req, res) => {
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
};
