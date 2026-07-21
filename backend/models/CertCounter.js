'use strict';
const mongoose = require('mongoose');

const certCounterSchema = new mongoose.Schema(
  {
    training_type: { type: String, required: true, unique: true },
    // high_water: the highest cert_sequence number ever issued for this type.
    // This ONLY ever increases — it is never decremented on revoke.
    high_water: { type: Number, default: 0 },
    // floor: admin-set minimum for the next new (non-gap) number.
    // 0 means no floor is set.
    floor: { type: Number, default: 0 },
  },
  { timestamps: false }
);

const CertCounter = mongoose.model('CertCounter', certCounterSchema);

// Each training_type maps to its OWN independent counter.
// No two types share a counter — resetting one never affects another.
const TO_CODE = {
  'Dispatch Graduate': 'FDI',
  FDI: 'FDI',
  FDA: 'FDA',
  GD:  'GD',
  TCD: 'TCD',
  'Human Factors': 'HF',
  HF:  'HF',
  NDG: 'NDG',
  'Recurrent': 'FDR',
  FDR: 'FDR',
  FTL: 'FTL',
};

/**
 * Ensure a CertCounter document exists for `code`.
 * Uses findOneAndUpdate with upsert:true so it is safe under concurrency.
 * Returns the document (always non-null after this call).
 */
async function ensureCounter(code) {
  return CertCounter.findOneAndUpdate(
    { training_type: code },
    { $setOnInsert: { training_type: code, high_water: 0, floor: 0 } },
    { upsert: true, returnDocument: 'after', new: true }
  );
}

/**
 * Reserve the next unique certificate sequence number for a given training type.
 *
 * Algorithm:
 *   1. Ensure the CertCounter document exists (creates it if first time).
 *   2. Query every cert_sequence in use across ALL aliases of this type.
 *   3. Scan upward from 1 to find the lowest positive integer NOT in use.
 *      - Gap-fill (holes below high_water) always happens before issuing new numbers.
 *      - If admin set a floor and the first free number is below it, jump to floor.
 *   4. If chosen > high_water, atomically advance the counter with upsert:true.
 *      - If a concurrent writer beat us, retry.
 *   5. If chosen <= high_water (gap fill), no counter update needed — return directly.
 *
 * Every training type starts at 00001 (sequence 1) unless admin set a floor.
 */
async function reserveCertSequence(training_type) {
  const code = TO_CODE[training_type] || training_type;

  // Lazy-require to avoid circular dependency at module load time
  const Participant = require('./Participant');

  const MAX_SCAN_RETRIES = 15;

  // Ensure counter document exists before we start (safe under concurrency)
  await ensureCounter(code);

  for (let scanAttempt = 1; scanAttempt <= MAX_SCAN_RETRIES; scanAttempt++) {

    // -- Step 1: fetch all in-use sequence numbers for THIS type only ---------
    // Each type is now fully independent — no cross-type alias sharing.
    const inUseDocs = await Participant.find(
      {
        training_type: code,
        cert_sequence: { $exists: true, $ne: null },
      },
      { cert_sequence: 1 },
      { sort: { cert_sequence: 1 } }
    ).lean();

    const inUse = new Set(
      inUseDocs
        .map(p => p.cert_sequence)
        .filter(n => typeof n === 'number' && n > 0)
    );

    // -- Step 3: read current counter state -----------------------------------
    const counterDoc = await CertCounter.findOne({ training_type: code }).lean();
    const floor      = counterDoc ? (counterDoc.floor || 0) : 0;
    const highWater  = counterDoc ? (counterDoc.high_water || 0) : 0;

    // -- Step 4: find lowest unused positive integer --------------------------
    // Always start scanning from 1 so we gap-fill first.
    let candidate = 1;
    while (inUse.has(candidate)) {
      candidate++;
    }

    // If the lowest free number is below the admin floor AND above highWater
    // (i.e. it's a new number, not a gap), jump to the floor instead.
    if (candidate > highWater && floor > 0 && candidate < floor) {
      candidate = floor;
      while (inUse.has(candidate)) {
        candidate++;
      }
    }

    const chosen = candidate;

    // -- Step 5: advance high-water if needed ---------------------------------
    if (chosen > highWater) {
      // Atomically advance the counter only if nobody else already pushed past chosen.
      // upsert:true so this also handles the first-ever issuance correctly.
      const updateResult = await CertCounter.findOneAndUpdate(
        { training_type: code, high_water: { $lt: chosen } },
        { $set: { high_water: chosen } },
        { upsert: true, returnDocument: 'after', new: true }
      );

      if (!updateResult) {
        // Another concurrent request advanced the counter — re-scan with fresh state.
        console.warn(
          `[cert] Concurrent write detected for ${code} at candidate ${chosen}` +
          ` (scan attempt ${scanAttempt}/${MAX_SCAN_RETRIES}) — retrying`
        );
        continue;
      }
    }
    // chosen <= highWater means it's a gap fill — no counter update needed.

    console.log(
      `[cert] Reserved sequence #${chosen} for ${code}` +
      ` (highWater was ${highWater}, floor=${floor}, attempt=${scanAttempt})`
    );
    return chosen;
  }

  throw new Error(
    `[cert] reserveCertSequence failed for ${code} after ${MAX_SCAN_RETRIES} scan attempts. ` +
    'Check for extreme concurrency or stale CertCounter documents.'
  );
}

// Fixed counter key for the DHL FORM ST-001 extra certificate. It is ONE
// shared pool across all DHL Bahrain / FDR candidates — not split per
// training type — so it lives under its own single CertCounter document.
const DHL_ST001_CODE = 'DHL-ST001';

/**
 * Reserve the next unique DHL ST-001 certificate number.
 *
 * Same gap-fill-first algorithm as reserveCertSequence(), but scans the
 * separate DhlCertificate collection (one doc per participant) instead of
 * Participant.cert_sequence, and is not scoped by training type.
 */
async function reserveDhlCertSequence() {
  // Lazy-require to avoid circular dependency at module load time
  const DhlCertificate = require('./DhlCertificate');

  const MAX_SCAN_RETRIES = 15;

  await ensureCounter(DHL_ST001_CODE);

  for (let scanAttempt = 1; scanAttempt <= MAX_SCAN_RETRIES; scanAttempt++) {
    const inUseDocs = await DhlCertificate.find(
      { sequence: { $exists: true, $ne: null } },
      { sequence: 1 },
      { sort: { sequence: 1 } }
    ).lean();

    const inUse = new Set(
      inUseDocs.map(d => d.sequence).filter(n => typeof n === 'number' && n > 0)
    );

    const counterDoc = await CertCounter.findOne({ training_type: DHL_ST001_CODE }).lean();
    const floor      = counterDoc ? (counterDoc.floor || 0) : 0;
    const highWater  = counterDoc ? (counterDoc.high_water || 0) : 0;

    let candidate = 1;
    while (inUse.has(candidate)) {
      candidate++;
    }

    if (candidate > highWater && floor > 0 && candidate < floor) {
      candidate = floor;
      while (inUse.has(candidate)) {
        candidate++;
      }
    }

    const chosen = candidate;

    if (chosen > highWater) {
      const updateResult = await CertCounter.findOneAndUpdate(
        { training_type: DHL_ST001_CODE, high_water: { $lt: chosen } },
        { $set: { high_water: chosen } },
        { upsert: true, returnDocument: 'after', new: true }
      );

      if (!updateResult) {
        console.warn(
          `[cert] Concurrent write detected for ${DHL_ST001_CODE} at candidate ${chosen}` +
          ` (scan attempt ${scanAttempt}/${MAX_SCAN_RETRIES}) — retrying`
        );
        continue;
      }
    }

    console.log(
      `[cert] Reserved DHL ST-001 sequence #${chosen}` +
      ` (highWater was ${highWater}, floor=${floor}, attempt=${scanAttempt})`
    );
    return chosen;
  }

  throw new Error(
    `[cert] reserveDhlCertSequence failed after ${MAX_SCAN_RETRIES} scan attempts. ` +
    'Check for extreme concurrency or stale CertCounter documents.'
  );
}

/**
 * syncHighWater — call once at server startup.
 *
 * Scans every participant's cert_sequence and advances any CertCounter
 * whose high_water is behind the actual maximum in the DB.
 * This is a self-healing guard: if a counter ever drifts out of sync
 * (e.g. after running fix-null-cert-sequences or a manual DB edit),
 * the server will silently correct it on next boot.
 *
 * Safe to call multiple times: never decreases high_water,
 * never touches participant records.
 */
async function syncHighWater() {
  const Participant = require('./Participant');
  const types = Object.values(TO_CODE).filter((v, i, a) => a.indexOf(v) === i); // unique codes

  for (const code of types) {
    const highest = await Participant.findOne(
      { training_type: code, cert_sequence: { $exists: true, $gt: 0 } },
      { cert_sequence: 1 },
      { sort: { cert_sequence: -1 } }
    ).lean();

    const maxSeq = highest?.cert_sequence ?? 0;
    if (maxSeq === 0) continue; // no certs issued yet — nothing to sync

    const counter = await CertCounter.findOne({ training_type: code }).lean();
    if (counter && counter.high_water >= maxSeq) continue; // already correct

    // Counter is behind — advance it
    await CertCounter.findOneAndUpdate(
      { training_type: code, $or: [{ high_water: { $lt: maxSeq } }, { high_water: { $exists: false } }] },
      { $set: { high_water: maxSeq }, $setOnInsert: { training_type: code, floor: 0 } },
      { upsert: true, new: true }
    );
    console.log(`[cert] syncHighWater: ${code} high_water synced to ${maxSeq}`);
  }
}

module.exports = { CertCounter, reserveCertSequence, reserveDhlCertSequence, syncHighWater, TO_CODE };
