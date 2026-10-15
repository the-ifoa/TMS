// In-memory cache for static files read on every request (PDF templates,
// signature and logo images). Each call does a cheap stat and re-reads only
// when the file's size or modified time changed, so a replaced template is
// still picked up without a restart.
const fs = require('fs');

const cache = new Map(); // path -> { mtimeMs, size, bytes }

function readFileCached(filePath) {
  const st = fs.statSync(filePath);
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.bytes;
  const bytes = fs.readFileSync(filePath);
  cache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, bytes });
  return bytes;
}

module.exports = { readFileCached };
