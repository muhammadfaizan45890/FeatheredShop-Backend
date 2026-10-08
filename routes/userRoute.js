import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  changePassword,
  forgotPassword,
  loginUser,
  logoutUser,
  registerUser,
  verification,
  verifyOTP,
  getProfile,
  updateProfile,
} from "../controllers/userController.js";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { userSchema, validateUser } from "../validators/userValidate.js";

const router = express.Router();

// ------------------ Multer setup for avatar upload ------------------
const uploadDir = "uploads/";
// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

// File filter (optional – only allow images)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// ------------------ Authentication routes ------------------
router.post("/register", validateUser(userSchema), registerUser);
router.post("/verify", verification);
router.post("/login", loginUser);
router.post("/logout", isAuthenticated, logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp/:email", verifyOTP);
router.post("/change-password/:email", changePassword);

// ------------------ Profile routes (protected) ------------------
router.get("/profile", isAuthenticated, getProfile);
router.put(
  "/profile",
  isAuthenticated,
  (req, res, next) => {
    // Multer error handling middleware
    upload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred (e.g., file too large, wrong field name)
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      } else if (err) {
        // An unknown error occurred
        return res.status(500).json({
          success: false,
          message: err.message,
        });
      }
      // Everything went fine, proceed to controller
      next();
    });
  },
  updateProfile
);

export default router;