import multer from "multer";
import path from "path";
import fs from "fs";

/* Ensure uploads dir exists */
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "brands");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `brand-${stamp}-${rand}${ext}`);
  },
});

const allowed = /^image\/(png|jpe?g|webp|svg\+xml|gif)$/i;

const uploadBrandLogo = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!allowed.test(file.mimetype)) {
      return cb(new Error("Only PNG, JPG, WEBP, SVG, or GIF images are allowed"));
    }
    cb(null, true);
  },
});

export default uploadBrandLogo;