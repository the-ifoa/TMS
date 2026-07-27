#!/usr/bin/env node
/**
 * restore-mongo.js
 *
 * Restores a backup created by backup-mongo.js into a MongoDB database —
 * recreates indexes and upserts every document by _id (safe to re-run).
 * Use this if a migration goes wrong and you need to roll back to the backup,
 * or to seed a fresh destination database from a known-good snapshot.
 *
 * Usage:
 *   node restore-mongo.js --uri "<mongo uri>" --in "<backup dir>" [--db <name>] [--drop]
 *
 * Optional flags:
 *   --db <name>   Override the destination database name (default: db name
 *                 embedded in the URI's path)
 *   --drop        Drop each destination collection before restoring into it
 *   --dry-run     Read the backup and print what would be restored, write nothing
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

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

function dbNameFromUri(uri) {
  try {
    const afterScheme = uri.split('://')[1] || '';
    const afterHost = afterScheme.split('/').slice(1).join('/');
    const dbPart = afterHost.split('?')[0];
    return dbPart || null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = args.uri || process.env.RESTORE_MONGO_URI;
  const inDir = args.in;
  const dropFirst = !!args.drop;
  const dryRun = !!args['dry-run'];

  if (!uri || !inDir) {
    console.error('Usage: node restore-mongo.js --uri "<mongo uri>" --in "<backup dir>" [--db <name>] [--drop] [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(inDir)) {
    console.error(`Backup directory not found: ${inDir}`);
    process.exit(1);
  }

  const dbName = args.db || dbNameFromUri(uri);
  if (!dbName) {
    console.error('Could not determine the destination database name. Pass --db <name> explicitly.');
    process.exit(1);
  }

  const manifestPath = path.join(inDir, '_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`No _manifest.json found in ${inDir} — is this a valid backup-mongo.js output directory?`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log(`Backup:   ${inDir} (from "${manifest.database}", taken ${manifest.backed_up_at})`);
  console.log(`Dest DB:  "${dbName}"`);
  console.log(dryRun ? 'Mode: DRY RUN (no writes)' : dropFirst ? 'Mode: LIVE (dropping destination collections first)' : 'Mode: LIVE (upsert by _id)');
  console.log('');

  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected.\n');

  try {
    const db = client.db(dbName);

    for (const { name, documents: expectedCount } of manifest.collections) {
      const docsFile = path.join(inDir, `${name}.json`);
      const indexesFile = path.join(inDir, `${name}.indexes.json`);
      if (!fs.existsSync(docsFile)) {
        console.warn(`! skipping "${name}" — ${docsFile} not found`);
        continue;
      }

      const docs = EJSON.parse(fs.readFileSync(docsFile, 'utf8'));
      const indexes = fs.existsSync(indexesFile) ? EJSON.parse(fs.readFileSync(indexesFile, 'utf8')) : [];

      console.log(`→ ${name}: ${docs.length} document(s) (expected ${expectedCount}), ${indexes.length} index(es)`);

      if (dryRun) continue;

      const coll = db.collection(name);

      if (dropFirst) {
        const existed = await db.listCollections({ name }).toArray();
        if (existed.length > 0) {
          await coll.drop();
          console.log(`   dropped existing destination collection "${name}"`);
        }
      }

      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const { key, name: idxName, ...options } = idx;
        try { await coll.createIndex(key, { name: idxName, ...options }); }
        catch (idxErr) { console.warn(`   ! could not recreate index "${idxName}": ${idxErr.message}`); }
      }

      let restored = 0;
      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const ops = batch.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        }));
        await coll.bulkWrite(ops, { ordered: false });
        restored += batch.length;
      }
      console.log(`   restored ${restored} document(s)`);
    }

    console.log('\nRestore complete.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
