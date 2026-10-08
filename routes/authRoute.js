import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import { isAuthenticated } from "../middleware/isAuthenticated.js";

const router = express.Router();

// ------------------------------------------------------------
// Google Login
// GET /auth/google
// ------------------------------------------------------------

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// ------------------------------------------------------------
// Google Callback
// GET /auth/google/callback
// ------------------------------------------------------------

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${
      process.env.CLIENT_URL || "http://localhost:5173"
    }/login?error=google_failed`,
  }),
  (req, res) => {
    try {
      // Make sure Passport returned a user
      if (!req.user) {
        console.error("❌ Google authentication failed: No user found");

        return res.redirect(
          `${
            process.env.CLIENT_URL || "http://localhost:5173"
          }/login?error=google_failed`
        );
      }

      // Make sure JWT secret exists
      if (!process.env.SECRET_KEY) {
        console.error("❌ SECRET_KEY is missing from environment variables");

        return res.redirect(
          `${
            process.env.CLIENT_URL || "http://localhost:5173"
          }/login?error=server_error`
        );
      }

      // Create JWT
      const token = jwt.sign(
        {
          id: req.user._id.toString(),
          email: req.user.email,
        },
        process.env.SECRET_KEY,
        {
          expiresIn: "7d",
        }
      );

      const clientURL =
        process.env.CLIENT_URL || "http://localhost:5173";

      console.log("✅ Google login successful:", req.user.email);

      // Redirect to React
      return res.redirect(
        `${clientURL}/auth-success?token=${encodeURIComponent(token)}`
      );
    } catch (error) {
      console.error("❌ Google login error:", error);

      const clientURL =
        process.env.CLIENT_URL || "http://localhost:5173";

      return res.redirect(
        `${clientURL}/login?error=google_failed`
      );
    }
  }
);

// ------------------------------------------------------------
// Current User
// GET /auth/me
// ------------------------------------------------------------

router.get("/me", isAuthenticated, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    return res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.error("❌ /auth/me error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get current user",
    });
  }
});

export default router;
