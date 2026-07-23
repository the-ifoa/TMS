const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage — logos stored in 'IFOA_LOGO' folder
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'IFOA_LOGO',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    transformation:  [{ width: 400, height: 400, crop: 'limit' }],
  },
});

// Multer — max 2 MB, images only
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
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
  limits: { fileSize: 3 * 1024 * 1024 },
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

module.exports = { upload, cloudinary, examImageUpload, deleteCloudinaryImage };
