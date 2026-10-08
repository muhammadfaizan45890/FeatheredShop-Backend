import mongoose from "mongoose";
import Order from "../models/Order.js";
import { User } from "../models/userModel.js";
import { Post } from "../models/Post.js";

/* ════════════════════════════════════════════════════
   Helper — resolve the authenticated/identified user
   Priority:
     1. req.user._id         (Authorization header worked)
     2. req.body.userEmail   (explicit email in body)
     3. customer.email       (from the order payload)
   Returns an ObjectId or null (guest order)
   ════════════════════════════════════════════════════ */
const resolveUserId = async (req, customer) => {
  if (req.user?._id) return req.user._id;

  const candidates = [req.body?.userEmail, customer?.email];

  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const email = raw.toLowerCase().trim();
    if (!email) continue;

    try {
      const found = await User.findOne({ email }).select("_id").lean();
      if (found?._id) return found._id;
    } catch (e) {
      console.warn("User lookup by email failed:", e?.message);
    }
  }

  return null;
};

/* Generate a unique order number */
const genOrderNumber = () =>
  `FS-${Date.now().toString(36).toUpperCase().slice(-6)}-${Math.floor(
    Math.random() * 900 + 100
  )}`;

/* ════════════════════════════════════════════════════
   Transaction support detection
   ----------------------------------------------------
   Why a real write is required:
   - `startSession()` is lazy; it connects on first use.
   - `startTransaction()` only sets a flag.
   - `ping` is a no-session command; MongoDB ignores the
     { session } option, so a ping-probe always succeeds
     even on standalone.
   - The ONLY reliable probe is a real write inside a
     real transaction. On standalone MongoDB that throws
     "Transaction numbers are only allowed on a replica
     set member or mongos" immediately.

   We cache the result per process so this runs once.
   ════════════════════════════════════════════════════ */
let _txSupported = null;
const supportsTransactions = async () => {
  if (_txSupported !== null) return _txSupported;

  let probeSession = null;
  try {
    probeSession = await mongoose.startSession();
    probeSession.startTransaction();

    const probeCollection =
      mongoose.connection.collection("_tx_probe");

    await probeCollection.insertOne(
      { probe: true, at: new Date() },
      { session: probeSession }
    );
    await probeCollection.deleteOne(
      { probe: true },
      { session: probeSession }
    );

    await probeSession.commitTransaction();
    _txSupported = true;
  } catch (err) {
    try {
      if (probeSession) await probeSession.abortTransaction();
    } catch {}
    _txSupported = false;
    console.warn(
      "[tx] Transactions unsupported — running without them:",
      err?.message
    );
  } finally {
    if (probeSession) {
      try {
        await probeSession.endSession();
      } catch {}
    }
  }

  return _txSupported;
};

/* ════════════════════════════════════════════════════
   POST /api/orders — create order
   Atomically decrements stock, blocks overselling.
   Uses transactions only when the MongoDB supports them.
   ════════════════════════════════════════════════════ */
export const createOrder = async (req, res) => {
  let session = null;

  try {
    const {
      customer,
      address,
      items,
      shippingMethod,
      paymentMethod,
      couponCode,
      totals,
    } = req.body;

    /* ─── Validate required fields ─── */
    if (!customer || typeof customer !== "object") {
      return res
        .status(400)
        .json({ success: false, message: "Missing customer info" });
    }
    if (!address || typeof address !== "object") {
      return res
        .status(400)
        .json({ success: false, message: "Missing shipping address" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }
    if (!totals || typeof totals !== "object" || totals.total == null) {
      return res
        .status(400)
        .json({ success: false, message: "Missing order totals" });
    }

    /* ─── 1. Only start a transaction if the DB supports it ─── */
    const txSupported = await supportsTransactions();
    if (txSupported) {
      session = await mongoose.startSession();
      session.startTransaction();
    } else {
      session = null;
    }
    const sessionOpts = session ? { session } : {};

    /* ─── 2. Atomically decrement stock for each item ───
       findOneAndUpdate with a `stockQuantity: { $gte: qty }`
       guard ensures two concurrent orders can never take the
       same last unit. If it returns null, the item is either
       out of stock, unpublished, or just got bought by someone
       else — we throw and roll back. */
    const decremented = []; // for manual rollback if session is unavailable

    for (const raw of items) {
      const productId = raw.productId || raw._id;
      const qty = Math.max(1, Number(raw.qty) || 1);

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw Object.assign(new Error("Invalid product id in cart"), {
          statusCode: 400,
        });
      }

      const updated = await Post.findOneAndUpdate(
        {
          _id: productId,
          isPublished: { $ne: false },
          inStock: { $ne: false },
          stockQuantity: { $gte: qty },
        },
        {
          $inc: { stockQuantity: -qty, sold: qty },
        },
        { new: true, ...sessionOpts }
      );

      if (!updated) {
        /* Undo previous decrements if we don't have a session */
        if (!session) {
          for (const d of decremented) {
            await Post.updateOne(
              { _id: d.productId },
              { $inc: { stockQuantity: d.qty, sold: -d.qty } }
            );
          }
        }

        const current = await Post.findById(productId)
          .select("title stockQuantity inStock isPublished")
          .lean();

        const message = current
          ? current.stockQuantity < qty
            ? `Only ${current.stockQuantity} left of "${current.title}". Please reduce the quantity.`
            : `"${current.title}" is no longer available`
          : "A product in your order is no longer available";

        throw Object.assign(new Error(message), { statusCode: 409 });
      }

      /* If stock just hit 0, flip inStock so the storefront hides it */
      if (updated.stockQuantity <= 0) {
        await Post.updateOne(
          { _id: updated._id },
          { $set: { inStock: false } },
          sessionOpts
        );
      }

      decremented.push({ productId, qty });
    }

    /* ─── 3. Resolve user + create the order ─── */
    const userId = await resolveUserId(req, customer);

    const order = await Order.create(
      [
        {
          orderNumber: genOrderNumber(),
          user: userId,
          customer,
          address,
          items: items.map((i) => ({
            productId: i.productId || i._id,
            name: i.name,
            brand: i.brand || "",
            image: i.image || "",
            size: i.size || null,
            qty: Math.max(1, Number(i.qty) || 1),
            price: Number(i.price) || 0,
          })),
          shippingMethod,
          paymentMethod,
          couponCode: couponCode || null,
          totals,
          status: "pending",
          paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
          statusHistory: [
            {
              status: "pending",
              at: new Date(),
              note: "Order created",
              tracking: "",
            },
          ],
        },
      ],
      sessionOpts
    );

    const createdOrder = Array.isArray(order) ? order[0] : order;

    /* ─── 4. Commit ─── */
    if (session) {
      await session.commitTransaction();
    }

    return res.status(201).json({ success: true, data: createdOrder });
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {}
    }

    console.error("createOrder:", err);

    /* Surface transaction-specific errors cleanly (should never fire now
       that the probe is accurate, but kept as a safety net). */
    if (
      err?.codeName === "IllegalOperation" &&
      /transaction/i.test(err.message || "")
    ) {
      return res.status(500).json({
        success: false,
        message:
          "Order failed: MongoDB transactions are not enabled. Restart your MongoDB as a replica set.",
        detail: err.message,
      });
    }

    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res
      .status(500)
      .json({ success: false, message: "Failed to create order" });
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {}
    }
  }
};

/* ════════════════════════════════════════════════════
   GET /api/orders — list (admin sees all, user sees own)
   ════════════════════════════════════════════════════ */
export const listOrders = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const {
      page = 1,
      limit = 20,
      search = "",
      status = "",
      paymentStatus = "",
      from = "",
      to = "",
      sort = "createdAt",
      dir = "desc",
    } = req.query;

    const filter = {};

    /* Admin sees all; regular user only their own */
    const isAdmin = req.user.role === "admin";
    if (!isAdmin) filter.user = req.user._id;

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (typeof search === "string" && search.trim()) {
      const safe = search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [
        { orderNumber: re },
        { "customer.fullName": re },
        { "customer.email": re },
        { "customer.phone": re },
      ];
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = t;
      }
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const sortDir = dir === "asc" ? 1 : -1;

    const SORTABLE = new Set([
      "createdAt",
      "updatedAt",
      "orderNumber",
      "status",
      "paymentStatus",
      "totals.total",
    ]);
    const sortField = SORTABLE.has(sort) ? sort : "createdAt";

    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + items.length < total,
      },
    });
  } catch (err) {
    console.error("listOrders:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load orders" });
  }
};

/* ════════════════════════════════════════════════════
   GET /api/orders/stats — admin dashboard stats
   ════════════════════════════════════════════════════ */
export const getOrderStats = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      todayOrders,
      weekOrders,
      monthOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      revenueAgg,
      todayRevenueAgg,
      monthRevenueAgg,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: "processing" }),
      Order.countDocuments({ status: "shipped" }),
      Order.countDocuments({ status: "delivered" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, sum: { $sum: "$totals.total" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            createdAt: { $gte: startOfToday },
          },
        },
        { $group: { _id: null, sum: { $sum: "$totals.total" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            status: { $ne: "cancelled" },
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, sum: { $sum: "$totals.total" } } },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        counts: {
          total: totalOrders,
          today: todayOrders,
          week: weekOrders,
          month: monthOrders,
          pending: pendingOrders,
          processing: processingOrders,
          shipped: shippedOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
        },
        revenue: {
          allTime: revenueAgg[0]?.sum || 0,
          today: todayRevenueAgg[0]?.sum || 0,
          month: monthRevenueAgg[0]?.sum || 0,
        },
      },
    });
  } catch (err) {
    console.error("getOrderStats:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load stats" });
  }
};

/* ════════════════════════════════════════════════════
   GET /api/orders/:id — single order
   ════════════════════════════════════════════════════ */
export const getOrder = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { orderNumber: id }] }
      : { orderNumber: id };

    const order = await Order.findOne(query).lean();
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const isAdmin = req.user.role === "admin";
    const ownerId = order.user ? String(order.user) : null;
    const isOwner = ownerId && ownerId === String(req.user._id);

    const customerEmail = (order.customer?.email || "").toLowerCase().trim();
    const userEmail = (req.user.email || "").toLowerCase().trim();
    const emailMatch =
      customerEmail && userEmail && customerEmail === userEmail;

    if (!isAdmin && !isOwner && !emailMatch) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("getOrder:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load order" });
  }
};

/* ════════════════════════════════════════════════════
   PATCH /api/orders/:id/status — admin updates status
   Restores stock if the order is moved to cancelled/returned
   ════════════════════════════════════════════════════ */
export const updateOrderStatus = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { status, paymentStatus, trackingNumber, note } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    /* If admin manually cancels or returns the order, restore stock */
    const wasRestorable = !["cancelled", "returned"].includes(order.status);
    const willBeRestorable = ["cancelled", "returned"].includes(status);

    if (status && status !== order.status) {
      order.status = status;
      order.statusHistory.push({
        status,
        at: new Date(),
        by: req.user._id,
        note: note || "",
        tracking: trackingNumber || "",
      });

      if (wasRestorable && willBeRestorable) {
        /* Put stock back */
        for (const item of order.items) {
          const qty = Math.max(1, Number(item.qty) || 1);
          await Post.updateOne(
            { _id: item.productId },
            {
              $inc: { stockQuantity: qty, sold: -qty },
              $set: { inStock: true },
            }
          );
        }
      }
    }
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (typeof trackingNumber === "string") {
      order.trackingNumber = trackingNumber;
    }

    try {
      await order.save();
    } catch (saveErr) {
      if (saveErr?.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: saveErr.message,
        });
      }
      throw saveErr;
    }

    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("updateOrderStatus:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update order" });
  }
};

/* ════════════════════════════════════════════════════
   PATCH /api/orders/:id/notes — admin notes
   ════════════════════════════════════════════════════ */
export const updateOrderNotes = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { adminNotes: String(req.body.adminNotes || "") },
      { new: true }
    );
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error("updateOrderNotes:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save notes" });
  }
};

/* ════════════════════════════════════════════════════
   PATCH /api/orders/:id/cancel — user cancels own order
   Restores stock for each item
   ════════════════════════════════════════════════════ */
export const cancelOrder = async (req, res) => {
  let session = null;
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    /* ─── Only start a transaction if the DB supports it ─── */
    const txSupported = await supportsTransactions();
    if (txSupported) {
      session = await mongoose.startSession();
      session.startTransaction();
    } else {
      session = null;
    }
    const sessionOpts = session ? { session } : {};

    const order = await Order.findById(req.params.id);
    if (!order) {
      if (session) await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const isAdmin = req.user.role === "admin";
    const ownerId = order.user ? String(order.user) : null;
    const isOwner = ownerId && ownerId === String(req.user._id);

    const customerEmail = (order.customer?.email || "").toLowerCase().trim();
    const userEmail = (req.user.email || "").toLowerCase().trim();
    const emailMatch =
      customerEmail && userEmail && customerEmail === userEmail;

    if (!isAdmin && !isOwner && !emailMatch) {
      if (session) await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const CANCELLABLE = ["pending", "confirmed", "processing"];
    if (!CANCELLABLE.includes(order.status)) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled once it is "${order.status}"`,
      });
    }

    /* ─── Restore stock for each item ─── */
    for (const item of order.items) {
      const qty = Math.max(1, Number(item.qty) || 1);
      await Post.updateOne(
        { _id: item.productId },
        {
          $inc: { stockQuantity: qty, sold: -qty },
          $set: { inStock: true },
        },
        sessionOpts
      );
    }

    order.status = "cancelled";
    order.cancelledReason = String(
      req.body?.reason || "Cancelled by customer"
    );
    order.statusHistory.push({
      status: "cancelled",
      at: new Date(),
      by: req.user._id,
      note: order.cancelledReason,
      tracking: "",
    });

    if (order.paymentStatus === "paid") {
      order.paymentStatus = "refunded";
    }

    await order.save(sessionOpts);

    if (session) await session.commitTransaction();
    return res.json({ success: true, data: order });
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {}
    }
    console.error("cancelOrder:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {}
    }
  }
};

/* ════════════════════════════════════════════════════
   DELETE /api/orders/:id — admin only
   Restores stock if the order wasn't already cancelled/returned
   ════════════════════════════════════════════════════ */
export const deleteOrder = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    /* Only restore if the order was still "live" (stock had been taken) */
    if (!["cancelled", "returned"].includes(order.status)) {
      for (const item of order.items) {
        const qty = Math.max(1, Number(item.qty) || 1);
        await Post.updateOne(
          { _id: item.productId },
          {
            $inc: { stockQuantity: qty, sold: -qty },
            $set: { inStock: true },
          }
        );
      }
    }

    await Order.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Order deleted" });
  } catch (err) {
    console.error("deleteOrder:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete order" });
  }
};