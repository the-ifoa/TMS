// Prints current Cloudinary account usage (storage, bandwidth, credits,
// transformations, requests) using the same credentials as the app.
//
// Usage:
//   cd backend && node scripts/check-cloudinary-usage.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { cloudinary } = require('../services/upload');

function fmtBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(2)} ${units[i]}`;
}

function fmtPct(used, limit) {
  if (!limit) return '';
  return ` (${((used / limit) * 100).toFixed(1)}% of ${fmtBytes(limit)})`;
}

async function main() {
  const usage = await cloudinary.api.usage();

  console.log('─── Cloudinary Usage ───────────────────────────────');
  console.log(`Plan:               ${usage.plan}`);
  console.log(`Last updated:       ${usage.last_updated || 'n/a'}`);
  console.log('');
  console.log(`Storage used:       ${fmtBytes(usage.storage?.usage)}${fmtPct(usage.storage?.usage, usage.storage?.limit)}`);
  console.log(`Bandwidth used:     ${fmtBytes(usage.bandwidth?.usage)}${fmtPct(usage.bandwidth?.usage, usage.bandwidth?.limit)}`);
  console.log(`Requests:           ${usage.requests ?? '—'}`);
  console.log(`Transformations:    ${usage.transformations?.usage ?? '—'}${usage.transformations?.limit ? ` / ${usage.transformations.limit}` : ''}`);
  console.log(`Resources (files):  ${usage.resources ?? '—'}`);
  console.log(`Derived resources:  ${usage.derived_resources ?? '—'}`);
  if (usage.credits) {
    console.log('');
    console.log(`Credits used:       ${usage.credits.usage?.toFixed?.(2) ?? usage.credits.usage} / ${usage.credits.limit} (${usage.credits.used_percent}%)`);
  }
  console.log('──────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('Failed to fetch Cloudinary usage:', err.message);
  process.exit(1);
});
