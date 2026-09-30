// ─────────────────────────────────────────────────────────────────────────────
//  Cloudflare R2 storage (S3-compatible) — airline internal certificate PDFs.
//
//  Env:
//    R2_ACCOUNT_ID         Cloudflare account id (endpoint host)
//    R2_ACCESS_KEY_ID      R2 API token access key
//    R2_SECRET_ACCESS_KEY  R2 API token secret
//    R2_BUCKET             bucket name
//
//  Files are private: the backend streams them to authorised users, so the
//  bucket needs no public access and no CORS rules.
// ─────────────────────────────────────────────────────────────────────────────
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
} = process.env;

const isConfigured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

const client = isConfigured
  ? new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
  : null;

function ensureConfigured() {
  if (!isConfigured) {
    const err = new Error('Certificate storage (Cloudflare R2) is not configured on the server.');
    err.status = 503;
    throw err;
  }
}

async function putObject(key, body, contentType) {
  ensureConfigured();
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType,
  }));
}

// Returns { Body (readable stream), ContentType, ContentLength }.
async function getObject(key) {
  ensureConfigured();
  return client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

async function deleteObject(key) {
  ensureConfigured();
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}

module.exports = { isConfigured, putObject, getObject, deleteObject };
