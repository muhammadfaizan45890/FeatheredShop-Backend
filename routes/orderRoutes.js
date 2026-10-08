import express from "express";
import jwt from "jsonwebtoken";
import { isAuthenticated } from "../middleware/isAuthenticated.js";
import { User } from "../models/userModel.js";
import {
  createOrder,
  listOrders,
  getOrder,
  getOrderStats,
  updateOrderStatus,
  updateOrderNotes,
  deleteOrder,
  cancelOrder,
} from "../controllers/orderController.js";

const router = express.Router();

/* ════════════════════════════════════════════════════
   Optional auth middleware
   - Reads Bearer token if present
   - Attaches req.user if valid
   - Never rejects — guests continue normally
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
    /* Invalid/expired token → continue as guest */
    next();
  }
};

/* ════════════════════════════════════════════════════
   Public + optional-auth routes
   ════════════════════════════════════════════════════ */

/* POST /api/orders — create order (guest OR logged-in) */
router.post("/", optionalAuth, createOrder);

/* ════════════════════════════════════════════════════
   Everything below requires a valid token
   ════════════════════════════════════════════════════ */
router.use(isAuthenticated);

/* ── Order listing + stats ──
   NOTE: literal path `/stats` must come BEFORE `/:id`,
   so Express doesn't route "stats" into getOrder. */
router.get("/", listOrders);
router.get("/stats", getOrderStats);

/* ── Single order ── */
router.get("/:id", getOrder);

/* ── Status + notes updates (admin for status, admin for notes) ── */
router.patch("/:id/status", updateOrderStatus);
router.patch("/:id/notes", updateOrderNotes);

/* ── User cancels their own order ── */
router.patch("/:id/cancel", cancelOrder);

/* ── Admin deletes an order ── */
router.delete("/:id", deleteOrder);

export default router;