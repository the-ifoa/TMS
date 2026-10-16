const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage engine that streams each upload straight to Cloudinary.
// Sets file.path = secure URL, file.filename = public_id, file.size = bytes
// (same fields multer-storage-cloudinary set, which this replaces — that
// package pins cloudinary v1, which has a known vulnerability).
class CloudinaryStorage {
  constructor({ cloudinary: client, params = {} }) {
    this.cloudinary = client;
    this.params = params;
  }

  _handleFile(_req, file, cb) {
    const stream = this.cloudinary.uploader.upload_stream({ ...this.params }, (err, resp) => {
      if (err) return cb(err);
      cb(null, { path: resp.secure_url, size: resp.bytes, filename: resp.public_id });
    });
    file.stream.pipe(stream);
  }

  _removeFile(_req, file, cb) {
    this.cloudinary.uploader.destroy(file.filename, { invalidate: true }, () => cb(null));
  }
}

// Cloudinary storage — logos stored in 'IFOA_LOGO' folder. quality/fetch_format
// 'auto' shrink delivered bytes (bandwidth) the same way exam images do below;
// Cloudinary leaves vector SVGs alone under f_auto rather than rasterizing them.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'IFOA_LOGO',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    transformation:  [{ width: 400, height: 400, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }],
  },
});

// Multer — frontend compresses client-side first (see compressImageFile),
// this is a safety ceiling, not the normal case.
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'), false);
    }
    cb(null, true);
  },
});

// ─── Exam question images ────────────────────────────────────────────────────
// Cloudinary free plan = 25 credits/month (1 credit = 1,000 transformations,
// OR 1 GB storage, OR 1 GB bandwidth). Budget: ~10 storage / ~10 bandwidth /
// ~5 transformations. To stay inside that:
//   - resize+compress happens ONCE, baked into this upload's eager
//     `transformation`, never requested again on-the-fly per view
//   - f_auto/q_auto shrinks delivered bytes (bandwidth) without extra credits
//   - image_public_id is stored alongside every image so deleteCloudinaryImage
//     can reclaim storage when a question/exam is deleted or an image replaced
const examImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'IFOA_EXAM',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }],
  },
});

const examImageUpload = multer({
  storage: examImageStorage,
  // Frontend downscales/re-encodes before upload (see compressImageFile in
  // QuestionEditor.jsx), so this is a safety ceiling, not the normal case —
  // covers formats the browser couldn't compress client-side (e.g. HEIC).
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'), false);
    }
    cb(null, true);
  },
});

async function deleteCloudinaryImage(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId).catch(() => {});
}

// Question images can be shared — a question copied into another exam, imported
// from the bank, or frozen in a candidate's attempt for result review all keep
// the same Cloudinary image. Deletes only the ids nothing in the database still
// uses. Call it AFTER removing the owning document.
async function deleteImagesIfUnused(publicIds) {
  const ids = [...new Set((publicIds || []).filter(Boolean))];
  if (!ids.length) return;
  const Exam = require('../models/Exam');
  const ExamAttempt = require('../models/ExamAttempt');
  const QuestionBankItem = require('../models/QuestionBankItem');
  const paths = (prefix) => [`${prefix}image_public_id`, `${prefix}images.public_id`, `${prefix}options.image_public_id`];
  const used = new Set();
  const collect = async (Model, prefix) => {
    const fields = paths(prefix);
    for (const field of fields) {
      (await Model.distinct(field, { [field]: { $in: ids } })).forEach((v) => used.add(v));
    }
  };
  await Promise.all([collect(Exam, 'questions.'), collect(ExamAttempt, 'questions_snapshot.'), collect(QuestionBankItem, '')]);
  await Promise.all(ids.filter((id) => !used.has(id)).map((id) => deleteCloudinaryImage(id)));
}

// Every image id a question (exam / bank item / snapshot shape) points at.
function questionImageIds(q) {
  const ids = [];
  if (q.image_public_id) ids.push(q.image_public_id);
  (q.images || []).forEach((img) => img.public_id && ids.push(img.public_id));
  (q.options || []).forEach((o) => o.image_public_id && ids.push(o.image_public_id));
  return ids;
}

module.exports = { upload, cloudinary, examImageUpload, deleteCloudinaryImage, deleteImagesIfUnused, questionImageIds };
