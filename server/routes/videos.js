const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { v2: cloudinary } = require('cloudinary');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Temp dir for files in transit to Cloudinary
const TEMP_DIR = path.join(__dirname, '../uploads/tmp');
const MANIFEST_PATH = path.join(__dirname, '../uploads/manifest.json');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Load or initialize manifest
let videos = [];
if (fs.existsSync(MANIFEST_PATH)) {
  try { videos = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { videos = []; }
}

function saveManifest() {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(videos, null, 2));
}

// Disk storage for temp files — better than memory for large videos
const storage = multer.diskStorage({
  destination: TEMP_DIR,
  filename: (_req, file, cb) => cb(null, `tmp_${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    file.mimetype.startsWith('video/') ? cb(null, true) : cb(new Error('Only video files are allowed'));
  },
});

// GET /api/videos
router.get('/', verifyToken, (_req, res) => res.json(videos));

// POST /api/videos/upload
router.post('/upload', verifyToken, upload.array('videos', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const newVideos = [];

  for (const file of req.files) {
    try {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: 'video',
        public_id: `watch-party/${uuidv4()}`,
        overwrite: true,
      });

      newVideos.push({
        id: path.basename(result.public_id), // UUID portion only
        originalName: file.originalname,
        cloudinaryPublicId: result.public_id,
        url: result.secure_url,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`Cloudinary upload failed for ${file.originalname}:`, err.message);
    } finally {
      fs.unlink(file.path, () => {}); // always clean up temp file
    }
  }

  if (newVideos.length === 0) {
    return res.status(500).json({ error: 'All uploads to Cloudinary failed' });
  }

  videos.push(...newVideos);
  saveManifest();
  res.json({ uploaded: newVideos });
});

// DELETE /api/videos/:id
router.delete('/:id', verifyToken, async (req, res) => {
  const idx = videos.findIndex((v) => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Video not found' });

  const [video] = videos.splice(idx, 1);
  saveManifest();

  try {
    await cloudinary.uploader.destroy(video.cloudinaryPublicId, { resource_type: 'video' });
  } catch (err) {
    console.error(`Cloudinary delete failed for ${video.cloudinaryPublicId}:`, err.message);
  }

  res.json({ deleted: video.id });
});

module.exports = router;
module.exports.getVideos = () => videos;
