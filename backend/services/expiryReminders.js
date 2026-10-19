// ─────────────────────────────────────────────────────────────────────────────
//  Certificate expiry reminders
//
//  sendExpiryReminders(participants) emails each owning airline (cc its parent
//  airline for a department) one table of its participants whose certificates
//  expire. Used by the admin "send reminder" action and by the daily job in
//  scripts/send-expiry-reminders.js.
// ─────────────────────────────────────────────────────────────────────────────
const Airline = require('../models/Airline');
const { sendCertExpiryReminderEmail } = require('./emailService');
const { brandingResolver } = require('./emailBranding');
const { certExpiry } = require('./certValidity');

// participants: lean Participant docs. Returns { sent, failed, skipped,
// sentParticipantIds } — the ids whose airline email went out successfully.
async function sendExpiryReminders(participants, { message = '' } = {}) {
  const docs = participants;
  const skipped = [];
  const groups = new Map(); // recipient key -> { airline, parent, rows, ids }

  const ownerIds = [...new Set(docs.map((p) => p.submitted_by).filter(Boolean).map(String))];
  const owners = await Airline.find({ _id: { $in: ownerIds } })
    .select('email airlineName department_name is_department parent_airline').lean();
  const ownerById = Object.fromEntries(owners.map((o) => [String(o._id), o]));
  const parentIds = owners.filter((o) => o.parent_airline).map((o) => o.parent_airline);
  const parents = await Airline.find({ _id: { $in: parentIds } }).select('email airlineName').lean();
  const parentById = Object.fromEntries(parents.map((o) => [String(o._id), o]));

  for (const p of docs) {
    const exp = certExpiry(p);
    if (!exp) { skipped.push({ id: p._id, name: p.participant_name, reason: 'No released certificate with a limited validity' }); continue; }

    let airline = p.submitted_by ? ownerById[String(p.submitted_by)] : null;
    if (!airline) {
      // Legacy record with no owner id — match the top-level airline by name.
      const name = p.airline_name || p.company;
      if (name) {
        const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        airline = await Airline.findOne({ airlineName: rx, parent_airline: null }).select('email airlineName').lean();
      }
    }
    if (!airline?.email) { skipped.push({ id: p._id, name: p.participant_name, reason: 'No airline email on file' }); continue; }

    const key = String(airline._id);
    if (!groups.has(key)) {
      groups.set(key, { airline, parent: airline.parent_airline ? parentById[String(airline.parent_airline)] : null, rows: [], ids: [] });
    }
    const year = p.cert_year_override || new Date(String(p.end_date || p.training_date).slice(0, 10)).getFullYear();
    groups.get(key).ids.push(p._id);
    groups.get(key).rows.push({
      name: p.participant_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      trainingType: p.training_type,
      certNo: p.cert_sequence ? `${p.training_type}-${String(p.cert_sequence).padStart(5, '0')}-${year}` : '',
      ...exp,
    });
  }

  const sent = [];
  const failed = [];
  const sentParticipantIds = [];
  const brandingFor = brandingResolver();
  for (const { airline, parent, rows, ids } of groups.values()) {
    rows.sort((a, b) => a.daysLeft - b.daysLeft);
    const label = airline.is_department
      ? `${parent?.airlineName || airline.airlineName} · ${airline.department_name || 'Department'}`
      : airline.airlineName;
    try {
      await sendCertExpiryReminderEmail({
        toEmail: airline.email,
        cc: parent?.email && parent.email !== airline.email ? [parent.email] : [],
        airlineName: label,
        rows,
        message: typeof message === 'string' ? message.trim().slice(0, 2000) : '',
        branding: await brandingFor(airline._id),
      });
      sent.push({ airline: label, email: airline.email, count: rows.length });
      sentParticipantIds.push(...ids);
    } catch (err) {
      console.error('Expiry reminder email failed:', airline.email, err.message);
      failed.push({ airline: label, email: airline.email, error: err.message });
    }
  }

  return { sent, failed, skipped, sentParticipantIds };
}

module.exports = { sendExpiryReminders };
