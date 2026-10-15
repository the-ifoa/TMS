#!/usr/bin/env node
/**
 * send-expiry-reminders.js — daily job (Render Cron Job, see render.yaml).
 *
 * Emails each airline about its participants whose IFOA certificate expires in
 * 30, 14 or 7 days. Each milestone is sent once per certificate (tracked in
 * participant.expiry_reminder), so running it more than once a day, or after a
 * missed day, never duplicates an email. A participant first seen at, say,
 * 5 days left gets one email, not three.
 *
 * Usage (from the backend folder):
 *   node scripts/send-expiry-reminders.js            # send
 *   node scripts/send-expiry-reminders.js --dry-run  # list who would be emailed
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const Participant = require('../models/Participant');
const { certExpiry } = require('../services/certValidity');
const { sendExpiryReminders } = require('../services/expiryReminders');

const MILESTONES = [30, 14, 7];   // days before expiry
const DRY_RUN = process.argv.includes('--dry-run');

// The milestone this participant is due for today, or null.
function dueMilestone(p) {
  const exp = certExpiry(p);
  if (!exp || exp.daysLeft < 0 || exp.daysLeft > Math.max(...MILESTONES)) return null;
  const milestone = Math.min(...MILESTONES.filter((m) => m >= exp.daysLeft));
  const record = p.expiry_reminder || {};
  const already = record.expires_on === exp.expiresOn ? (record.milestones || []) : [];
  if (already.includes(milestone)) return null;
  return { milestone, exp, already };
}

async function main() {
  if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required');
  await mongoose.connect(process.env.MONGODB_URL, { dbName: 'certificateSystem' });

  const candidates = await Participant.find({ cert_released: true, cert_validity: { $ne: 'Unlimited' } }).lean();
  const due = [];
  for (const p of candidates) {
    const d = dueMilestone(p);
    if (d) due.push({ p, ...d });
  }
  console.log(`[expiry] ${candidates.length} released certificate(s) checked, ${due.length} due for a reminder.`);
  for (const { p, milestone, exp } of due) {
    console.log(`  ${p.participant_name || p._id} — ${p.training_type}, expires ${exp.expiresOn} (${exp.daysLeft} days, ${milestone}-day reminder)`);
  }
  if (DRY_RUN || due.length === 0) return;

  const { sent, failed, skipped, sentParticipantIds } = await sendExpiryReminders(due.map((d) => d.p));
  const sentIds = new Set(sentParticipantIds.map(String));

  // Record every milestone at or above today's days-left as done, so a later
  // run doesn't send the bigger milestones that were skipped.
  const ops = due
    .filter((d) => sentIds.has(String(d.p._id)))
    .map(({ p, exp, already }) => ({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { expiry_reminder: {
          expires_on: exp.expiresOn,
          milestones: [...new Set([...already, ...MILESTONES.filter((m) => m >= exp.daysLeft)])].sort((a, b) => b - a),
        } } },
      },
    }));
  if (ops.length) await Participant.bulkWrite(ops);

  console.log(`[expiry] emails sent: ${sent.length}, failed: ${failed.length}, skipped participants: ${skipped.length}`);
  for (const f of failed) console.log(`  FAILED ${f.airline} <${f.email}>: ${f.error}`);
  for (const s of skipped) console.log(`  skipped ${s.name}: ${s.reason}`);
  if (failed.length) process.exitCode = 1;
}

module.exports = { dueMilestone, MILESTONES };

if (require.main === module) {
  main()
    .catch((err) => { console.error('[expiry] job failed:', err.message); process.exitCode = 1; })
    .finally(async () => {
      await mongoose.disconnect();
      process.exit();   // the email transport keeps a socket open; don't wait on it
    });
}
