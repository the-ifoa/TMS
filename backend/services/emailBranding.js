const Airline = require('../models/Airline');

// ─── Per-airline email branding ────────────────────────────────────────────────
// When an admin switches on `email_use_airline_logo` for a top-level airline,
// emails sent on behalf of that airline (or any of its departments) show the
// airline's logo in the header instead of the IFOA logo. The flag lives on the
// top-level airline and covers the whole tree; a department uses its own logo,
// falling back to the parent's.

const FETCH_TIMEOUT_MS = 5000;

// Cloudinary can serve any upload as a height-capped PNG — safer for email
// clients than SVG/WebP originals.
function emailSafeUrl(url) {
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//.test(url)) return url;
  return url.replace('/image/upload/', '/image/upload/f_png,h_200,c_limit/');
}

async function fetchLogo(url) {
  try {
    const res = await fetch(emailSafeUrl(url), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType})`);
    return { content: Buffer.from(await res.arrayBuffer()), contentType };
  } catch (err) {
    console.warn('[email] Could not fetch airline logo, falling back to IFOA:', err.message);
    return null;
  }
}

// → { name, logo: { content, contentType } } or null (use IFOA branding).
async function resolveEmailBranding(airlineId) {
  if (!airlineId) return null;
  const airline = await Airline.findById(airlineId).select('airlineName logo_url parent_airline email_use_airline_logo').lean();
  if (!airline) return null;
  const top = airline.parent_airline
    ? await Airline.findById(airline.parent_airline).select('airlineName logo_url email_use_airline_logo').lean()
    : airline;
  if (!top?.email_use_airline_logo) return null;

  const logoUrl = airline.logo_url || top.logo_url;
  if (!logoUrl) return null;
  const logo = await fetchLogo(logoUrl);
  if (!logo) return null;
  return { name: top.airlineName || airline.airlineName, logo };
}

// Memoised resolver for bulk sends (many emails, few distinct airlines).
function brandingResolver() {
  const cache = new Map();
  return (airlineId) => {
    const key = String(airlineId || '');
    if (!cache.has(key)) cache.set(key, resolveEmailBranding(airlineId).catch(() => null));
    return cache.get(key);
  };
}

module.exports = { resolveEmailBranding, brandingResolver };
