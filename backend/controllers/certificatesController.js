'use strict';
const Participant = require('../models/Participant');
const { generateCertificate, MODULES_LIST } = require('../services/certificateGenerator');
const { generateDhlCertificate } = require('../services/dhlCertGenerator');
const DhlCertificate = require('../models/DhlCertificate');
const { CertCounter, reserveCertSequence, reserveDhlCertSequence, TO_CODE } = require('../models/CertCounter');

// -- DHL Bahrain / DHL Air (Bahrain) — case-insensitive airline match ---------
const DHL_BAHRAIN_NAMES = ['dhl bahrain', 'dhl air (bahrain)'];
function isDhlBahrainAirline(name) {
  return DHL_BAHRAIN_NAMES.includes(String(name || '').trim().toLowerCase());
}

// -- Is admin -----------------------------------------------------------------
function isAdmin(req) {
  return req.admin?.role === 'admin' || req.admin?.role === 'Administrator';
}

// -- Ownership check (airline only) -------------------------------------------
function airlineOwns(req, participant) {
  if (req.admin?.role !== 'airline') return false;
  if (participant.submitted_by && String(participant.submitted_by) === String(req.admin.id)) return true;
  if (!participant.submitted_by && req.admin.airlineName) {
    const n = req.admin.airlineName.toLowerCase();
    if ((participant.airline_name || '').toLowerCase() === n) return true;
    if ((participant.company      || '').toLowerCase() === n) return true;
  }
  return false;
}

// -- PDF response headers -----------------------------------------------------
function setPdfHeaders(res, filename, disposition = 'attachment') {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
}

// -- Assign a guaranteed-unique cert_sequence ---------------------------------
// Calls reserveCertSequence which returns the lowest unused number (gap-fill
// first, then next sequential). After writing we do a final collision check —
// if another concurrent request beat us to the same number we wipe and retry.
async function assignNewCertSequence(participant) {
  const code = TO_CODE[participant.training_type] || participant.training_type;

  const MAX_RETRIES = 10;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const seq = await reserveCertSequence(participant.training_type);

    // Belt-and-suspenders: check if another participant of the SAME type already holds this number.
    const collision = await Participant.findOne({
      _id:           { $ne: participant._id },
      training_type: code,
      cert_sequence: seq,
    }).lean();

    if (collision) {
      console.warn(
        `[cert] Collision on ${code} #${seq} (attempt ${attempt}/${MAX_RETRIES}) — retrying`
      );
      continue;
    }

    participant.cert_sequence = seq;
    await participant.save();
    console.log(
      `[cert] Assigned #${seq} to ${participant.participant_name} (${code}) on attempt ${attempt}`
    );
    return seq;
  }

  throw new Error(
    `[cert] Failed to assign a unique cert_sequence for ${code} after ${MAX_RETRIES} attempts.`
  );
}

// =============================================================================
//  ADMIN ENDPOINTS
// =============================================================================

// -- GET /generate/:id --------------------------------------------------------
exports.generateGet = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Certificate generation is restricted to IFOA administrators.' });
    }

    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    const forceNew = req.query.force === 'true';

    if (!participant.cert_sequence || forceNew) {
      if (forceNew && participant.cert_sequence) {
        console.log(
          `[cert] ?force=true — releasing old #${participant.cert_sequence} for ` +
          `${participant.participant_name} before assigning new number`
        );
        participant.cert_sequence = null;
        await participant.save();
      }
      await assignNewCertSequence(participant);
    } else {
      console.log(
        `[cert] Reusing existing #${participant.cert_sequence} for ` +
        `${participant.participant_name} (pass ?force=true to reassign)`
      );
    }

    const incomingVariant = req.query.variant || participant.templateVariant || 'default';
    participant.templateVariant = incomingVariant;
    participant.cert_released   = true;
    await participant.save();

    const data = participant.toObject();
    data.templateVariant = incomingVariant;

    const pdfBuffer = await generateCertificate(data);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename  = `Certificate_${safeName}_${participant.training_type}.pdf`;

    setPdfHeaders(res, filename, 'attachment');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /generate] error:', err);
    res.status(500).json({ error: 'Failed to generate certificate.' });
  }
};

// -- POST /generate/:id -------------------------------------------------------
exports.generatePost = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Certificate generation is restricted to IFOA administrators.' });
    }

    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    const forceNew = req.query.force === 'true' || req.body.force === true;

    if (!participant.cert_sequence || forceNew) {
      if (forceNew && participant.cert_sequence) {
        console.log(
          `[cert] force=true — releasing old #${participant.cert_sequence} for ` +
          `${participant.participant_name} before assigning new number`
        );
        participant.cert_sequence = null;
        await participant.save();
      }
      await assignNewCertSequence(participant);
    } else {
      console.log(
        `[cert] Reusing existing #${participant.cert_sequence} for ` +
        `${participant.participant_name} (pass force:true to reassign)`
      );
    }

    if (req.body.modules) {
      participant.modules = Array.isArray(req.body.modules)
        ? req.body.modules.join(',')
        : req.body.modules;
    }

    const variant = req.body.templateVariant || req.query.variant || participant.templateVariant || 'default';
    participant.templateVariant = variant;
    participant.cert_released   = true;
    await participant.save();

    const data = participant.toObject();
    data.templateVariant = variant;

    const pdfBuffer = await generateCertificate(data);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename  = `Certificate_${safeName}_${participant.training_type}.pdf`;

    setPdfHeaders(res, filename, 'attachment');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[POST /generate] error:', err);
    res.status(500).json({ error: 'Failed to generate certificate.' });
  }
};

// -- POST /dhl-generate/:id ----------------------------------------------------
// Extra DHL FORM ST-001 certificate — only for DHL Bahrain / DHL Air (Bahrain)
// FDR (Flight Dispatch Recurrent) participants. Fully separate pipeline from
// the main cert_sequence/generateCertificate flow: own model (DhlCertificate),
// own numbering pool (reserveDhlCertSequence), additive to the normal certificate.
exports.dhlGenerate = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Certificate generation is restricted to IFOA administrators.' });
    }

    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    if (!isDhlBahrainAirline(participant.airline_name)) {
      return res.status(400).json({ error: 'This certificate is only available for DHL Bahrain / DHL Air (Bahrain) participants.' });
    }
    if (participant.training_type !== 'FDR') {
      return res.status(400).json({ error: 'This certificate is only available for FDR (Flight Dispatch Recurrent) training records.' });
    }

    let dhlCert = await DhlCertificate.findOne({ participant: participant._id });
    if (!dhlCert) dhlCert = new DhlCertificate({ participant: participant._id });

    if (!dhlCert.sequence) {
      const MAX_RETRIES = 10;
      let assigned = false;
      for (let attempt = 1; attempt <= MAX_RETRIES && !assigned; attempt++) {
        const seq = await reserveDhlCertSequence();
        const collision = await DhlCertificate.findOne({ _id: { $ne: dhlCert._id }, sequence: seq }).lean();
        if (collision) {
          console.warn(`[dhl-cert] Collision on #${seq} (attempt ${attempt}/${MAX_RETRIES}) — retrying`);
          continue;
        }
        dhlCert.sequence = seq;
        assigned = true;
      }
      if (!assigned) {
        return res.status(500).json({ error: 'Failed to assign a unique DHL certificate number. Please retry.' });
      }
    }

    dhlCert.released = true;
    await dhlCert.save();

    const pdfBuffer = await generateDhlCertificate(participant.toObject(), dhlCert.sequence);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename  = `DHL_ST001_${safeName}.pdf`;

    setPdfHeaders(res, filename, 'attachment');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[POST /dhl-generate] error:', err);
    res.status(500).json({ error: 'Failed to generate DHL certificate.' });
  }
};

// -- GET /dhl-preview/:id ------------------------------------------------------
// Airline-facing (or admin) read-only preview of an already-released DHL cert.
exports.dhlPreview = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    const dhlCert = await DhlCertificate.findOne({ participant: participant._id });

    if (!isAdmin(req)) {
      if (!airlineOwns(req, participant)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (!dhlCert || !dhlCert.released) {
        return res.status(403).json({ error: 'DHL certificate has not been released yet by IFOA.' });
      }
    }
    if (!dhlCert || !dhlCert.sequence) {
      return res.status(404).json({ error: 'DHL certificate not found for this participant.' });
    }

    const pdfBuffer = await generateDhlCertificate(participant.toObject(), dhlCert.sequence);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');

    setPdfHeaders(res, `DHL_ST001_${safeName}_Preview.pdf`, 'inline');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /dhl-preview] error:', err);
    res.status(500).json({ error: 'Failed to preview DHL certificate.' });
  }
};

// -- GET /dhl-download/:id -----------------------------------------------------
exports.dhlDownload = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    const dhlCert = await DhlCertificate.findOne({ participant: participant._id });

    if (!isAdmin(req) && !airlineOwns(req, participant)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!dhlCert || !dhlCert.released) {
      return res.status(403).json({ error: 'DHL certificate has not been released yet by IFOA.' });
    }
    if (!dhlCert.sequence) {
      return res.status(409).json({ error: 'DHL certificate number not assigned. Please contact IFOA.' });
    }

    const pdfBuffer = await generateDhlCertificate(participant.toObject(), dhlCert.sequence);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');

    setPdfHeaders(res, `DHL_ST001_${safeName}.pdf`, 'attachment');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /dhl-download] error:', err);
    res.status(500).json({ error: 'Failed to download DHL certificate.' });
  }
};

// -- DELETE /revoke/:id -------------------------------------------------------
exports.revoke = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Certificate revocation is restricted to IFOA administrators.' });
    }

    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    const oldSeq = participant.cert_sequence;

    // Use $unset so cert_sequence is fully absent (not null) — required for the
    // sparse unique index to ignore this document. Setting null would store a
    // value and cause E11000 duplicate key errors across multiple participants.
    await Participant.updateOne(
      { _id: participant._id },
      { $unset: { cert_sequence: '' }, $set: { cert_released: false } }
    );

    console.log(`[cert] Certificate revoked for ${participant.participant_name}: freed number #${oldSeq}`);
    res.json({
      message:          'Certificate revoked successfully',
      participant_name: participant.participant_name,
      freedNumber:      oldSeq,
    });
  } catch (err) {
    console.error('[DELETE /revoke] error:', err);
    res.status(500).json({ error: 'Failed to revoke certificate.' });
  }
};

// -- GET /preview/:id ---------------------------------------------------------
exports.preview = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    if (!isAdmin(req)) {
      if (!airlineOwns(req, participant)) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (!participant.cert_released) {
        return res.status(403).json({ error: 'Certificate has not been released yet by IFOA.' });
      }
    }

    const data = participant.toObject();
    if (isAdmin(req) && req.query.modules) {
      data.modules = req.query.modules;
    }
    data.templateVariant = req.query.variant || participant.templateVariant || 'default';

    const pdfBuffer = await generateCertificate(data);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');

    setPdfHeaders(res, `Certificate_${safeName}_Preview.pdf`, 'inline');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /preview] error:', err);
    res.status(500).json({ error: 'Failed to preview certificate.' });
  }
};

// -- GET /download/:id --------------------------------------------------------
exports.download = async (req, res) => {
  try {
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found.' });

    if (!isAdmin(req) && !airlineOwns(req, participant)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (!participant.cert_released) {
      return res.status(403).json({ error: 'Certificate has not been released yet by IFOA.' });
    }

    if (!participant.cert_sequence) {
      return res.status(409).json({ error: 'Certificate number not assigned. Please contact IFOA.' });
    }

    const data = participant.toObject();
    data.templateVariant = participant.templateVariant || 'default';

    const pdfBuffer = await generateCertificate(data);
    const safeName  = participant.participant_name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename  = `Certificate_${safeName}_${participant.training_type}.pdf`;

    setPdfHeaders(res, filename, 'attachment');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[GET /download] error:', err);
    res.status(500).json({ error: 'Failed to download certificate.' });
  }
};

// -- GET /modules -------------------------------------------------------------
exports.listModules = (req, res) => {
  res.json(MODULES_LIST);
};

// -- GET /counters -------------------------------------------------------------
// Returns one entry per training type with:
//   high_water : highest number ever issued (never decreases)
//   active     : current highest cert_sequence held by a live participant
//                (decreases when certs are revoked or participants deleted)
exports.getCounters = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required.' });

    const TYPES = ['FDI', 'FDA', 'FDR', 'FTL', 'NDG', 'HF', 'GD', 'TCD'];

    // Fetch counter docs and compute live active max in parallel
    const [counterDocs, liveMaxes] = await Promise.all([
      CertCounter.find({}).lean(),
      // One aggregation to get the max cert_sequence per type across all live participants
      Participant.aggregate([
        { $match: { cert_sequence: { $exists: true, $gt: 0 } } },
        { $group: { _id: '$training_type', activeMax: { $max: '$cert_sequence' }, activeCount: { $sum: 1 } } },
      ]),
    ]);

    // Build a lookup map from the aggregation results
    const liveMap = {};
    liveMaxes.forEach(({ _id, activeMax, activeCount }) => {
      liveMap[_id] = { activeMax, activeCount };
    });

    // Merge counter docs with live data
    const result = TYPES.map(type => {
      const counter = counterDocs.find(c => c.training_type === type) || {};
      const live    = liveMap[type] || { activeMax: 0, activeCount: 0 };
      return {
        training_type: type,
        high_water:    counter.high_water   ?? 0,
        floor:         counter.floor        ?? 0,
        // active = highest cert_sequence currently held by a live participant
        // This is what the Reset Modal should display — it goes down on revoke/delete
        active:        live.activeMax,
        activeCount:   live.activeCount,
        _id:           counter._id,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// -- POST /counters/reset -----------------------------------------------------
exports.resetCounters = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const rawStart    = Number(req.body.startFrom);
    const startFrom   = (!isNaN(rawStart) && rawStart >= 0) ? rawStart : 1;
    const isZeroReset = startFrom === 0;
    const mode        = req.body.mode === 'hard' ? 'hard' : 'soft';
    const types       = [];

    if (req.body.all) {
      const counters = await CertCounter.find({}).lean();
      const ptypes   = await Participant.distinct('training_type');
      const allTypes = new Set([...counters.map(c => c.training_type), ...ptypes]);
      types.push(...allTypes);
    } else {
      if (!req.body.training_type) {
        return res.status(400).json({ error: 'training_type or all:true is required.' });
      }
      types.push(req.body.training_type);
    }

    const results = [];

    for (const type of types) {
      if (isZeroReset || mode === 'hard') {
        await Participant.updateMany(
          { training_type: type },
          { $set: { cert_sequence: null, cert_released: false } }
        );
        const effectiveNext = isZeroReset ? 1 : startFrom;
        await CertCounter.findOneAndUpdate(
          { training_type: type },
          { $set: { high_water: 0, floor: effectiveNext } },
          { upsert: true, returnDocument: 'after', new: true }
        );
        results.push({
          type,
          mode:       isZeroReset ? 'zero-reset' : 'hard',
          nextNumber: effectiveNext,
          message:    isZeroReset
            ? `Full reset. All cert numbers wiped. Next number will be 1.`
            : `All participant cert numbers wiped. Next number: ${startFrom}.`,
        });
      } else {
        const highest = await Participant.findOne(
          { training_type: type, cert_sequence: { $exists: true, $ne: null } },
          { cert_sequence: 1 },
          { sort: { cert_sequence: -1 } }
        ).lean();
        const existingMax    = highest ? (highest.cert_sequence || 0) : 0;
        const effectiveStart = Math.max(startFrom, existingMax + 1);
        await CertCounter.findOneAndUpdate(
          { training_type: type },
          { $set: { high_water: existingMax, floor: effectiveStart } },
          { upsert: true, returnDocument: 'after', new: true }
        );
        const warning = effectiveStart > startFrom
          ? ` (adjusted to ${effectiveStart} to avoid collision with existing #${existingMax})` : '';
        results.push({
          type,
          mode: 'soft',
          effectiveStart,
          message: `Existing numbers preserved. Next new number: ${effectiveStart}${warning}.`,
        });
      }
    }

    res.json({ startFrom, mode, results });
  } catch (err) {
    console.error('[POST /counters/reset] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
