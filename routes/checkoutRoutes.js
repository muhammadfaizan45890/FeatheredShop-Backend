import express from "express";
import jwt from "jsonwebtoken";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { User } from "../models/userModel.js";
import {
  validateCart,
  applyCoupon,
  upsertSession,
  getSession,
  placeOrder,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  listCoupons,
} from "../controllers/checkoutController.js";

const router = express.Router();

/* ════════════════════════════════════════════════════
   Optional auth — never rejects, only attaches req.user
   ════════════════════════════════════════════════════ */
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId;
    if (!userId) return next();

    const user = await User.findById(userId).select("-password").lean();
    if (user) req.user = user;
    next();
  } catch {
    next();
  }
};

/* ════════════════════════════════════════════════════
   Public (guest-friendly) — optionalAuth
   ════════════════════════════════════════════════════ */
router.post("/validate-cart", optionalAuth, validateCart);
router.post("/apply-coupon", optionalAuth, applyCoupon);
router.get("/coupons", listCoupons);

/* Session save also works for guests (linked by email) */
router.post("/session", optionalAuth, upsertSession);
router.get("/session/:id", optionalAuth, getSession);

/* Order placement also works for guests */
router.post("/place-order", optionalAuth, placeOrder);

/* ════════════════════════════════════════════════════
   Address book — requires a real logged-in user
   ════════════════════════════════════════════════════ */
router.use(isAuthenticated);
router.get("/addresses", listAddresses);
router.post("/addresses", createAddress);
router.patch("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);

export default router;