#!/usr/bin/env node
// ─── Import iSpring survey emails into Training feedback ──────────────────────
// Reads a mailbox export (scripts/fetch-inbox.js → inbox-export.json), keeps the
// iSpring "[Complete] Survey results: Customer Training Feedback" mails, parses
// each into a TrainingFeedback row (source 'ispring') and upserts it by mail
// uid, so running it again never duplicates anything.
//
//   node scripts/seedIspringFeedback.js <inbox-export.json> [--out reviews.json] [--dry-run]
//
// Writes to MONGODB_URL (database certificateSystem). Only a local database is
// accepted unless --allow-remote is passed. Undo:
//   db.trainingfeedbacks.deleteMany({ source: 'ispring' })
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const TrainingFeedback = require('../models/TrainingFeedback');
const { parseSurveyMail } = require('./ispringFeedbackParser');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

// ── Airline names: participants typed the company freely ──────────────────────
const AIRLINES = [
  ['Global Jet', /^global ?jet/],
  ['DHL Air Austria', /^(dha\b|dhl (air )?\(? ?austria|dha air austria|dhl austria)/],
  ['DHL Bahrain', /(dhl.*bahrain|bahrain dhl|dhl aviation \(eemea\))/],
  ['European Air Transport (EAT)', /^(eat\b|eat\/dhl|eat leipzig|european air transport)/],
  ['DHL', /^dhl( aviation| air)?$/],
  ['Jetfly', /^jetfly/],
  ['AeroLogic', /^aerologic/],
  ['Azerbaijan Airlines', /^(azal|azerba)/],
  ['DC Aviation', /^dc[- ]aviation/],
  ['Air Alsie', /^air alsie/],
  ['Challenge Airlines', /^chall?e[mn]?ge/],
  ['EVO', /^(evo|flyevo)/],
  ['Silk Way West Airlines', /^silk ?way/],
  ['Comlux', /comlux/],
  ['Valo Aviation', /^valo/],
  ['Airbus Beluga Transport', /^airbus b[eé]luga/],
  ['Flight Consulting Group (FCG)', /^fcg/],
  ['Hahn Air', /^hahn ?air/],
  ['K5-Aviation', /^k5-aviation/],
  ['Avcon Jet', /^avcon ?jet/],
  ['Albinati Aeronautics', /^albinati/],
  ["Air Côte d'Ivoire", /^air c[oô]t[eé] d.ivoire/],
  ['Finnair', /^finnai/],
  ['DAT', /^dat\b/],
  ['ASL Airlines Belgium', /^asl\b/],
  ['Air Belgium', /^air belgium/],
  ['Nordic Regional Airlines', /^(nordic regional|norra)/],
  ['Poonawalla Aviation', /^poonawalla/],
  ['Swedish Armed Forces', /^f[oö]rsvarsmakten/],
  ['IFOA', /^(ifoa|iofa|the ifoa|international flight operations academy)/],
];
// Things typed that are people, not companies.
const INDIVIDUAL = /^(self|private|cadet pilot|sparsh gupta|dr parmod kumar|harshita|roop|abulfaz|krystian koloz)$/;

const titleCase = (s) => s.replace(/\S+/g, (w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)));
function airlineName(company) {
  const key = company.toLowerCase().normalize('NFC').replace(/̇/g, '').replace(/\s+/g, ' ').trim();
  if (!key) return 'No airline';
  if (INDIVIDUAL.test(key)) return 'Individual';
  const hit = AIRLINES.find(([, re]) => re.test(key));
  return hit ? hit[0] : titleCase(company.trim());
}

// ── Training names: grouped into IFOA's courses ───────────────────────────────
const COURSES = [
  ['Train the Trainer', /(train(ing)?\.? the train|\bt{3,4}\b|instructor)/],
  ['Maintenance Control (MCC)', /(\bmcc\b|maintenance control)/],
  ['Slot Coordination', /slot ?coordination/],
  ['Flight Planning', /(flight plann|\bfpl\b|charts)/],
  ['Human Factors', /(human factor|\bhf\b|\bcrm\b|resource management)/],
  ['EDTO / ETOPS', /(edto|etops)/],
  ['Winter Operations', /winter/],
  ['Fatigue & Flight Time Limitations', /(fatigue|\bftl\b|flight time)/],
  ['Dangerous Goods', /(dangerous|\bdgr?\b)/],
  ['Mass & Balance / Performance', /(mass|balance|load ?(sheet|control)|performance)/],
  ['Initial Flight Dispatch', /(initial|basic|ab.?initio|license|licence)/],
  ['Flight Dispatch Recurrent', /(rec+ur+(e?nt|ing)|refresh|annual)/],
  ['Flight Dispatch', /(dispatch|despatch|dispacth|dispacther|\bocct?\b|\bdsp\b|\bfoo\b|flight op|operations? control|ops training|operation)/],
];
function courseName(title) {
  const key = title.toLowerCase();
  const hit = COURSES.find(([, re]) => re.test(key));
  return hit ? hit[0] : 'Other training';
}

async function main() {
  if (!input) throw new Error('Usage: node scripts/seedIspringFeedback.js <inbox-export.json> [--out reviews.json] [--dry-run]');
  const mails = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const reviews = mails
    .filter((m) => /^\[Complete\] Survey results: "Customer Training Feedback"/.test(m.subject || ''))
    .map(parseSurveyMail)
    .filter((r) => r && r.ratings.length)
    .map((r) => ({ ...r, airline: airlineName(r.company), course: courseName(r.training_title) }))
    .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));

  console.log(`Parsed ${reviews.length} survey results (${mails.length} mails).`);
  const count = (k) => Object.entries(reviews.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  console.log('By airline:', count('airline').map(([k, n]) => `${k} ${n}`).join(' · '));
  console.log('By course: ', count('course').map(([k, n]) => `${k} ${n}`).join(' · '));

  const out = opt('--out');
  if (out) {
    fs.writeFileSync(path.resolve(out), JSON.stringify(reviews, null, 2));
    console.log(`Wrote ${path.resolve(out)}`);
  }
  if (flag('--dry-run')) return;

  const url = process.env.MONGODB_URL;
  if (!url) throw new Error('MONGODB_URL is not set.');
  const local = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
  if (!local && !flag('--allow-remote')) throw new Error('MONGODB_URL is not a local database — pass --allow-remote to write to it.');

  await mongoose.connect(url, { dbName: 'certificateSystem' });
  // The (exam, participant) unique index used to be non-partial; imported rows
  // have neither, so rebuild it as partial before inserting.
  const indexes = await TrainingFeedback.collection.indexes().catch(() => []);
  const old = indexes.find((i) => i.name === 'exam_id_1_participant_id_1' && !i.partialFilterExpression);
  if (old) await TrainingFeedback.collection.dropIndex(old.name);
  await TrainingFeedback.createIndexes();

  const ops = reviews.map((r) => {
    const at = r.submitted_at ? new Date(r.submitted_at) : new Date();
    return {
      updateOne: {
        filter: { source_ref: r.source_ref },
        update: {
          $set: {
            source: 'ispring',
            exam_title_snapshot: r.course,
            airline_name: r.airline,
            status: 'submitted',
            sent_at: at,
            submitted_at: at,
            form_version: r.ratings.length === 11 ? 1 : 0, // pre-2025 survey wording lacked one statement
            company: r.company,
            training_title: r.training_title,
            instructor_name: r.instructor_name,
            ratings: r.ratings,
            comments: r.comments.slice(0, 5000),
          },
          $setOnInsert: { token: `ispring_${crypto.randomBytes(18).toString('hex')}` },
        },
        upsert: true,
      },
    };
  });
  const res = await TrainingFeedback.bulkWrite(ops, { ordered: false });
  console.log(`Seeded: ${res.upsertedCount} new, ${res.modifiedCount} updated, ${await TrainingFeedback.countDocuments({ source: 'ispring' })} iSpring rows in total.`);
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
