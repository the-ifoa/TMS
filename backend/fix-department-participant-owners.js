// ─────────────────────────────────────────────────────────────────────────────
//  One-off repair: department candidates that leaked into the main airline list
//
//  A department's participants must carry submitted_by = the department's own
//  _id. Records created before that was enforced can have submitted_by = null
//  while still carrying the parent airline's name (departments inherit
//  `airlineName`), so the main airline's legacy name-match picks them up.
//
//  This script finds participants whose `department` field matches a real
//  department account's name AND whose submitted_by is null (or points at the
//  parent airline), and re-stamps submitted_by with that department's _id.
//
//  Usage:  node fix-department-participant-owners.js          (dry run)
//          node fix-department-participant-owners.js --apply   (write changes)
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  const url = process.env.MONGODB_URL;
  if (!url) { console.error('MONGODB_URL not set'); process.exit(1); }
  await mongoose.connect(url);
  const db = mongoose.connection;
  console.log(`Connected to "${db.name}" — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const airlines = db.collection('airlines');
  const participants = db.collection('participants');

  const depts = await airlines
    .find({ parent_airline: { $ne: null } })
    .project({ _id: 1, parent_airline: 1, department_name: 1, name: 1 })
    .toArray();

  console.log(`Found ${depts.length} department account(s).`);

  let fixed = 0;
  for (const d of depts) {
    const names = [d.department_name, d.name].filter(Boolean);
    if (!names.length) continue;

    // Candidates that belong to this department but are mis-owned: department
    // name matches, and submitted_by is null or the parent airline.
    const q = {
      department: { $in: names },
      $or: [
        { submitted_by: null },
        { submitted_by: { $exists: false } },
        { submitted_by: d.parent_airline },
      ],
    };
    const stray = await participants.find(q).project({ _id: 1, participant_name: 1, submitted_by: 1 }).toArray();
    if (!stray.length) continue;

    console.log(`\nDepartment "${names[0]}" (${d._id}) — ${stray.length} record(s) to re-own:`);
    stray.forEach((p) => console.log(`  - ${p.participant_name} (was ${p.submitted_by || 'null'})`));
    fixed += stray.length;

    if (APPLY) {
      await participants.updateMany(q, { $set: { submitted_by: d._id } });
    }
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${fixed} participant record(s).`);
  if (!APPLY && fixed) console.log('Re-run with --apply to write the changes.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
