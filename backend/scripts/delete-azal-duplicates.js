#!/usr/bin/env node
/**
 * delete-azal-duplicates.js
 *
 * One-off cleanup: Azerbaijan Airlines' FDI batch (07 Sep – 09 Oct 2026) was
 * entered twice on 8 Oct 2026 — at 12:49 and again at 14:38 (UTC). This keeps
 * the original 12:49 records and deletes the 10 copies from 14:38, by exact id.
 *
 * Safety checks — nothing is deleted unless ALL pass:
 *   • all 10 ids still match (Azerbaijan Airlines, FDI, 14:38 batch, unowned,
 *     no cert_sequence, certificate not released)
 *   • no exam result / attempt / invite / exam assignment / DHL cert /
 *     attendance sheet / internal cert / DGR form references them
 *   • the 10 original 12:49 records are still present
 *
 * Usage:
 *   node delete-azal-duplicates.js --uri "<mongo uri>"            # preview only
 *   node delete-azal-duplicates.js --uri "<mongo uri>" --confirm  # delete
 *
 * Optional flags:
 *   --db <name>    Database name (default: certificateSystem)
 *
 * Take a backup first (backup-mongo.js).
 */

const { MongoClient, ObjectId } = require('mongodb');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i += 1; }
      else args[key] = true;
    }
  }
  return args;
}

const DUPLICATE_IDS = [
  '6ac7aadc2558ef0428349a6f', // Mahammadali Dostuyev
  '6ac7aadc2558ef0428349a71', // Maksim Buqlak Iqorevich
  '6ac7aadc2558ef0428349a73', // Ali İsmayilli
  '6ac7aadd2558ef0428349a75', // Ramal Guluzade
  '6ac7aadd2558ef0428349a77', // Mahammadali Aliyev
  '6ac7aadd2558ef0428349a79', // Ismayil Maharramov
  '6ac7aade2558ef0428349a7b', // Ravan Hasanov
  '6ac7aade2558ef0428349a7d', // Zeynab Valiyeva
  '6ac7aade2558ef0428349a7f', // Zeynab Zeynalova
  '6ac7aadf2558ef0428349a81', // Manzar Fuladi
].map((id) => new ObjectId(id));

const REF_COLLECTIONS = [
  'examresults', 'examattempts', 'examinvites', 'exams', 'dhlcertificates',
  'attendancesheets', 'internalcertificates', 'dgrforms',
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = args.uri;
  if (!uri) {
    console.error('Usage: node delete-azal-duplicates.js --uri "<mongo uri>" [--db <name>] [--confirm]');
    process.exit(1);
  }
  const dbName = args.db || 'certificateSystem';
  const confirm = args.confirm === true;

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const participants = db.collection('participants');

    // Only records that are still exactly the duplicates.
    const query = {
      _id: { $in: DUPLICATE_IDS },
      company: 'Azerbaijan Airlines',
      training_type: 'FDI',
      submitted_by: null,
      cert_released: { $ne: true },
      cert_sequence: { $exists: false },
      created_at: { $gte: new Date('2026-10-08T14:38:00Z'), $lt: new Date('2026-10-08T14:39:00Z') },
    };

    const targets = await participants
      .find(query, { projection: { participant_name: 1, created_at: 1 } })
      .toArray();
    console.log(`Database: "${dbName}"`);
    console.log(`Matching duplicates: ${targets.length} of ${DUPLICATE_IDS.length}`);
    targets.forEach((p) => console.log(`  ${p._id}  ${p.created_at.toISOString()}  ${p.participant_name}`));

    // Nothing else may point at them.
    const refQuery = {
      $or: [
        { participant: { $in: DUPLICATE_IDS } },
        { participant_id: { $in: DUPLICATE_IDS } },
        { participants: { $in: DUPLICATE_IDS } },
        { 'participants.participant_id': { $in: DUPLICATE_IDS } },
        { 'participants._id': { $in: DUPLICATE_IDS } },
        { 'assignments.participant_id': { $in: DUPLICATE_IDS } },
      ],
    };
    let refs = 0;
    for (const name of REF_COLLECTIONS) {
      const n = await db.collection(name).countDocuments(refQuery);
      if (n) console.log(`  linked in ${name}: ${n}`);
      refs += n;
    }

    // The 12:49 originals must still be there before removing the copies.
    const originals = await participants.countDocuments({
      company: 'Azerbaijan Airlines',
      training_type: 'FDI',
      created_at: { $gte: new Date('2026-10-08T12:49:00Z'), $lt: new Date('2026-10-08T12:50:00Z') },
    });
    console.log(`Originals (12:49) present: ${originals} of ${DUPLICATE_IDS.length}`);

    if (targets.length !== DUPLICATE_IDS.length || refs !== 0 || originals !== DUPLICATE_IDS.length) {
      console.error('\nABORT — checks failed, nothing deleted.');
      process.exitCode = 1;
      return;
    }

    if (!confirm) {
      console.log('\nPreview only — nothing deleted. Re-run with --confirm to delete.');
      return;
    }

    const before = await participants.countDocuments();
    const res = await participants.deleteMany(query);
    const after = await participants.countDocuments();
    console.log(`\nDeleted: ${res.deletedCount}  (participants ${before} → ${after})`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
