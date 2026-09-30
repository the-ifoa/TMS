// ─────────────────────────────────────────────────────────────────────────────
//  PDF compression via Ghostscript before storing in R2.
//
//  /printer = 300 dpi images: still print quality for certificates, typically
//  60–85% smaller for scanned / image-heavy PDFs. Never fails an upload: if
//  Ghostscript is missing, errors, times out, or the result isn't smaller, the
//  original bytes are returned unchanged.
//
//  Env: GS_PATH (optional, default "gs"), PDF_COMPRESS=false to disable.
// ─────────────────────────────────────────────────────────────────────────────
const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const GS = process.env.GS_PATH || 'gs';
const TIMEOUT_MS = 60_000;

function runGs(input, output) {
  return new Promise((resolve, reject) => {
    execFile(GS, [
      '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.5',
      '-dPDFSETTINGS=/printer',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      `-sOutputFile=${output}`,
      input,
    ], { timeout: TIMEOUT_MS }, (err) => (err ? reject(err) : resolve()));
  });
}

// Returns { buffer, compressed: boolean }.
async function compressPdf(buffer) {
  if (process.env.PDF_COMPRESS === 'false') return { buffer, compressed: false };
  const base = path.join(os.tmpdir(), `tms-pdf-${crypto.randomUUID()}`);
  const input = `${base}-in.pdf`;
  const output = `${base}-out.pdf`;
  try {
    await fs.writeFile(input, buffer);
    await runGs(input, output);
    const out = await fs.readFile(output);
    // Sanity: a real PDF, and actually smaller.
    if (out.subarray(0, 5).toString('latin1') !== '%PDF-' || out.length >= buffer.length) {
      return { buffer, compressed: false };
    }
    return { buffer: out, compressed: true };
  } catch (err) {
    console.warn('[pdfCompress] skipped, storing original:', err.code || err.message);
    return { buffer, compressed: false };
  } finally {
    fs.rm(input, { force: true }).catch(() => {});
    fs.rm(output, { force: true }).catch(() => {});
  }
}

module.exports = { compressPdf };
