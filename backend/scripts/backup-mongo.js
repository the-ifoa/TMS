#!/usr/bin/env node
/**
 * backup-mongo.js
 *
 * Downloads a full local backup of every collection in a MongoDB database —
 * one JSON file per collection (plus its indexes), written with EJSON so
 * BSON types (ObjectId, Date, etc.) round-trip correctly on restore. Read-only
 * against the source — never writes anything back to Mongo.
 *
 * Usage:
 *   node backup-mongo.js --uri "<mongo uri>" [--db <name>] [--out <dir>]
 *
 * Optional flags:
 *   --db <name>    Override the database name (default: db name embedded in
 *                  the URI's path, e.g. "certificateSystem")
 *   --out <dir>    Output directory (default: ./backups/<db>-<timestamp>)
 *
 * Output layout:
 *   <out>/<collection>.json          — array of documents (EJSON)
 *   <out>/<collection>.indexes.json  — that collection's index definitions
 *   <out>/_manifest.json             — db name, timestamp, per-collection doc counts
 *
 * To restore a backup into a (possibly different) database, use
 * restore-mongo.js against the same output directory.
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = args.uri || process.env.BACKUP_MONGO_URI;

  if (!uri) {
    console.error('Usage: node backup-mongo.js --uri "<mongo uri>" [--db <name>] [--out <dir>]');
    process.exit(1);
  }

  const dbName = args.db || dbNameFromUri(uri);
  if (!dbName) {
    console.error('Could not determine the database name from the URI. Pass --db <name> explicitly.');
    process.exit(1);
  }

  const outDir = args.out || path.join(__dirname, 'backups', `${dbName}-${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Database: "${dbName}"`);
  console.log(`Output:   ${outDir}\n`);

  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected.\n');

  try {
    const db = client.db(dbName);
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();

    if (collections.length === 0) {
      console.log('No collections found — nothing to back up.');
      return;
    }

    const manifest = { database: dbName, backed_up_at: new Date().toISOString(), collections: [] };

    for (const collInfo of collections) {
      const name = collInfo.name;
      if (name.startsWith('system.')) continue;

      const coll = db.collection(name);
      const docs = await coll.find({}).toArray();
      const indexes = await coll.indexes().catch(() => []);

      fs.writeFileSync(path.join(outDir, `${name}.json`), EJSON.stringify(docs, null, 2));
      fs.writeFileSync(path.join(outDir, `${name}.indexes.json`), EJSON.stringify(indexes, null, 2));

      console.log(`→ ${name}: ${docs.length} document(s), ${indexes.length} index(es)`);
      manifest.collections.push({ name, documents: docs.length, indexes: indexes.length });
    }

    fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2));

    const totalDocs = manifest.collections.reduce((s, c) => s + c.documents, 0);
    console.log('\n─── Summary ───────────────────────────────────────');
    console.log(`${manifest.collections.length} collection(s), ${totalDocs} document(s) total`);
    console.log(`Backup saved to: ${outDir}`);
    console.log('──────────────────────────────────────────────────');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
