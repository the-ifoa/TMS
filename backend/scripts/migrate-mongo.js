#!/usr/bin/env node
/**
 * migrate-mongo.js
 *
 * One-time full database migration — copies EVERY collection and EVERY
 * document from a source MongoDB deployment to a destination one, using the
 * raw MongoDB driver (not Mongoose), so it isn't limited to the models this
 * app happens to define. Any collection that exists in the source db (known
 * schema or not, leftover/legacy or not) gets copied, including its indexes.
 *
 * Usage:
 *   node migrate-mongo.js --source "<source mongo uri>" --dest "<dest mongo uri>"
 *
 * Optional flags:
 *   --source-db <name>   Override the source db name (default: db name embedded
 *                         in the source URI's path, e.g. "certificateSystem")
 *   --dest-db <name>     Override the destination db name (default: same as
 *                         --source-db, or the dest URI's embedded db name)
 *   --drop                Drop each destination collection before copying into
 *                          it (clean re-run). Without this flag, existing docs
 *                          with the same _id are left alone (upsert-by-_id).
 *   --dry-run             Only print what would be copied — connects to both
 *                          ends and counts documents, but writes nothing.
 *   --batch-size <n>      Documents per bulk-write batch (default: 500)
 *
 * Nothing here is destructive to the SOURCE database — it is only ever read.
 * The DESTINATION is written to; by default existing docs are left as-is
 * unless you pass --drop.
 */

const { MongoClient } = require('mongodb');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function dbNameFromUri(uri) {
  try {
    // mongodb://.../<dbname>?opts  or  mongodb+srv://.../<dbname>?opts
    const afterScheme = uri.split('://')[1] || '';
    const afterHost = afterScheme.split('/').slice(1).join('/'); // dbname?opts or empty
    const dbPart = afterHost.split('?')[0];
    return dbPart || null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const sourceUri = args.source || process.env.MIGRATE_SOURCE_URI;
  const destUri = args.dest || process.env.MIGRATE_DEST_URI;
  const dropFirst = !!args.drop;
  const dryRun = !!args['dry-run'];
  const batchSize = Number(args['batch-size']) || 500;

  if (!sourceUri || !destUri) {
    console.error('Usage: node migrate-mongo.js --source "<source uri>" --dest "<dest uri>" [--source-db name] [--dest-db name] [--drop] [--dry-run]');
    process.exit(1);
  }

  const sourceDbName = args['source-db'] || dbNameFromUri(sourceUri);
  const destDbName = args['dest-db'] || dbNameFromUri(destUri) || sourceDbName;

  if (!sourceDbName) {
    console.error('Could not determine the source database name. Pass --source-db <name> explicitly.');
    process.exit(1);
  }
  if (!destDbName) {
    console.error('Could not determine the destination database name. Pass --dest-db <name> explicitly.');
    process.exit(1);
  }

  console.log(`Source DB: "${sourceDbName}"`);
  console.log(`Dest DB:   "${destDbName}"`);
  console.log(dryRun ? 'Mode: DRY RUN (no writes)' : dropFirst ? 'Mode: LIVE (dropping destination collections first)' : 'Mode: LIVE (upsert by _id, existing docs left alone otherwise)');
  console.log('');

  const sourceClient = new MongoClient(sourceUri);
  const destClient = new MongoClient(destUri);

  await sourceClient.connect();
  await destClient.connect();
  console.log('Connected to both source and destination.\n');

  try {
    const sourceDb = sourceClient.db(sourceDbName);
    const destDb = destClient.db(destDbName);

    const collections = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
    if (collections.length === 0) {
      console.log('No collections found in the source database — nothing to migrate.');
      return;
    }

    console.log(`Found ${collections.length} collection(s): ${collections.map((c) => c.name).join(', ')}\n`);

    const summary = [];

    for (const collInfo of collections) {
      const name = collInfo.name;
      // Skip system collections (system.views, system.indexes, etc.) — not
      // real user data and MongoDB doesn't let you write to them anyway.
      if (name.startsWith('system.')) continue;

      const sourceColl = sourceDb.collection(name);
      const destColl = destDb.collection(name);

      const totalDocs = await sourceColl.countDocuments();
      console.log(`→ ${name}: ${totalDocs} document(s)`);

      if (dryRun) {
        summary.push({ name, docs: totalDocs, copied: 0, indexes: 0 });
        continue;
      }

      if (dropFirst) {
        const existed = await destDb.listCollections({ name }).toArray();
        if (existed.length > 0) {
          await destColl.drop();
          console.log(`   dropped existing destination collection "${name}"`);
        }
      }

      // Copy indexes (skip the default _id_ index — every collection has it).
      let indexCount = 0;
      try {
        const indexes = await sourceColl.indexes();
        for (const idx of indexes) {
          if (idx.name === '_id_') continue;
          const { key, name: idxName, ...options } = idx;
          try {
            await destColl.createIndex(key, { name: idxName, ...options });
            indexCount += 1;
          } catch (idxErr) {
            console.warn(`   ! could not recreate index "${idxName}" on "${name}": ${idxErr.message}`);
          }
        }
      } catch (err) {
        console.warn(`   ! could not read indexes for "${name}": ${err.message}`);
      }

      // Copy documents in batches, upserting by _id so re-runs are safe and
      // idempotent even without --drop.
      let copied = 0;
      const cursor = sourceColl.find({});
      let batch = [];

      const flush = async () => {
        if (batch.length === 0) return;
        const ops = batch.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        }));
        await destColl.bulkWrite(ops, { ordered: false });
        copied += batch.length;
        batch = [];
      };

      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= batchSize) await flush();
      }
      await flush();

      console.log(`   copied ${copied}/${totalDocs} document(s), ${indexCount} index(es) recreated`);
      summary.push({ name, docs: totalDocs, copied, indexes: indexCount });
    }

    console.log('\n─── Summary ───────────────────────────────────────');
    let totalDocs = 0;
    let totalCopied = 0;
    summary.forEach((s) => {
      console.log(`${s.name.padEnd(28)} ${String(s.copied).padStart(6)} / ${String(s.docs).padEnd(6)} docs   ${s.indexes} index(es)`);
      totalDocs += s.docs;
      totalCopied += s.copied;
    });
    console.log('──────────────────────────────────────────────────');
    console.log(dryRun ? `Would copy ${totalDocs} document(s) across ${summary.length} collection(s).` : `Copied ${totalCopied}/${totalDocs} document(s) across ${summary.length} collection(s).`);
  } finally {
    await sourceClient.close();
    await destClient.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
