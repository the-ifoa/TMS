#!/usr/bin/env node
/**
 * migrate-cert-counters.js — one-time migration (safe to re-run).
 *
 * Old CertCounter documents stored the counter in `seq`; current code uses
 * `high_water`. This copies seq → high_water and removes seq. It used to run
 * on every server start; it is a no-op once the data is migrated.
 *
 * Usage (from the backend folder):  node scripts/migrate-cert-counters.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const { CertCounter } = require('../models/CertCounter');

async function main() {
  if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required');
  await mongoose.connect(process.env.MONGODB_URL, { dbName: 'certificateSystem' });

  const old = await CertCounter.find({ seq: { $exists: true }, high_water: { $exists: false } }).lean();
  for (const doc of old) {
    await CertCounter.updateOne(
      { _id: doc._id },
      { $set: { high_water: doc.seq || 0 }, $unset: { seq: '' } },
      { strict: false },   // `seq` is no longer in the schema; without this the $unset is dropped
    );
    console.log(`CertCounter ${doc.training_type}: seq=${doc.seq} → high_water=${doc.seq || 0}`);
  }
  console.log(old.length ? `Migrated ${old.length} counter(s).` : 'Nothing to migrate.');
}

main()
  .catch((err) => { console.error('Migration failed:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
