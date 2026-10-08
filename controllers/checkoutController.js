import mongoose from "mongoose";
import CheckoutSession from "../models/CheckoutSession.js";
import Address from "../models/Address.js";
import Coupon from "../models/Coupon.js";
import { User } from "../models/userModel.js";
import Order from "../models/Order.js";
import { Post } from "../models/Post.js";

/* ════════════════════════════════════════════════════
   Constants — keep aligned with the frontend
   ════════════════════════════════════════════════════ */
const FREE_SHIP_THRESHOLD = 8000;
const SHIPPING_FLAT = 350;
const EXPRESS_SURCHARGE = 800;
const GST_RATE = 0.05;

/* ════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════ */
const genOrderNumber = () =>
  `FS-${Date.now().toString(36).toUpperCase().slice(-6)}-${Math.floor(
    Math.random() * 900 + 100
  )}`;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* Resolve the requesting user (auth header OR customer email fallback) */
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
    } catch {}
  }
  return null;
};

/* Recompute totals server-side — never trust client */
const recomputeTotals = async ({
  items,
  shippingMethod,
  coupon,
  paymentMethod,
}) => {
  let subtotal = 0;
  for (const item of items) {
    subtotal += Number(item.price) * Number(item.qty);
  }

  let discount = 0;
  let freeship = false;

  if (coupon) {
    if (coupon.type === "percent") {
      discount = Math.round((subtotal * coupon.value) / 100);
      if (coupon.maxDiscount > 0) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else if (coupon.type === "flat") {
      discount = Math.min(coupon.value, subtotal);
    } else if (coupon.type === "freeship") {
      freeship = true;
    }
  }

  const discountedSubtotal = Math.max(0, subtotal - discount);

  let shipping = 0;
  if (items.length > 0) {
    if (freeship || discountedSubtotal >= FREE_SHIP_THRESHOLD) {
      shipping = 0;
    } else {
      shipping = SHIPPING_FLAT;
    }
  }
  if (shippingMethod === "express") shipping += EXPRESS_SURCHARGE;

  const gst = Math.round(discountedSubtotal * GST_RATE);
  const total = Math.max(0, discountedSubtotal + shipping + gst);

  return { subtotal, discount, shipping, gst, total };
};

/* Validate coupon eligibility */
const checkCoupon = async (code, { subtotal, paymentMethod, user }) => {
  if (!code) return { coupon: null, error: null };

  const coupon = await Coupon.findOne({
    code: String(code).toUpperCase().trim(),
  }).lean();

  if (!coupon) return { coupon: null, error: "Coupon not found" };
  if (!coupon.active) return { coupon: null, error: "Coupon is inactive" };

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    return { coupon: null, error: "Coupon not started yet" };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return { coupon: null, error: "Coupon has expired" };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return { coupon: null, error: "Coupon usage limit reached" };
  }
  if (coupon.minSubtotal > 0 && subtotal < coupon.minSubtotal) {
    return {
      coupon: null,
      error: `Minimum order ${coupon.minSubtotal} required`,
    };
  }
  if (
    coupon.applicableMethods?.length > 0 &&
    paymentMethod &&
    !coupon.applicableMethods.includes(paymentMethod)
  ) {
    return {
      coupon: null,
      error: "Coupon not valid for this payment method",
    };
  }

  return { coupon, error: null };
};

/* ════════════════════════════════════════════════════
   POST /api/checkout/validate-cart
   Server-validates each item against stock + price
   ════════════════════════════════════════════════════ */
export const validateCart = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    if (incoming.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items to validate",
      });
    }

    const enriched = [];
    const changes = [];

    for (const raw of incoming.slice(0, 100)) {
      if (!isValidId(raw.productId)) {
        changes.push({
          itemId: raw.productId,
          reason: "invalid_id",
          message: "Invalid product id",
        });
        continue;
      }

      const product = await Post.findById(raw.productId).lean();
      if (!product || product.isPublished === false) {
        changes.push({
          itemId: raw.productId,
          name: raw.name,
          reason: "unavailable",
          message: "Product is no longer available",
        });
        continue;
      }
      if (product.inStock === false || product.stockQuantity === 0) {
        changes.push({
          itemId: raw.productId,
          name: product.title,
          reason: "out_of_stock",
          message: "Product is out of stock",
        });
        continue;
      }

      const reg = Number(product.regularPrice) || 0;
      const sale = Number(product.salePrice) || 0;
      const price = sale > 0 && sale < reg ? sale : reg;
      const maxQty = Math.min(Number(product.stockQuantity) || 99, 99);

      let qty = Number(raw.qty) || 1;

      if (price !== Number(raw.price)) {
        changes.push({
          itemId: raw.productId,
          name: product.title,
          reason: "price_changed",
          from: Number(raw.price),
          to: price,
          message: "Price updated",
        });
      }

      if (qty > maxQty) {
        changes.push({
          itemId: raw.productId,
          name: product.title,
          reason: "qty_reduced",
          from: qty,
          to: maxQty,
          message: `Only ${maxQty} left in stock`,
        });
        qty = maxQty;
      }

      enriched.push({
        productId: product._id,
        name: product.title,
        brand: product.brand || "",
        image: product.images?.[0] || raw.image || "",
        size: raw.size || null,
        qty,
        price,
      });
    }

    if (enriched.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid items in cart",
        changes,
      });
    }

    const totals = await recomputeTotals({
      items: enriched,
      shippingMethod: req.body?.shippingMethod || "standard",
      coupon: null,
      paymentMethod: req.body?.paymentMethod || "cod",
    });

    return res.json({
      success: true,
      data: { items: enriched, totals, changes },
    });
  } catch (err) {
    console.error("validateCart:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to validate cart" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/checkout/apply-coupon
   ════════════════════════════════════════════════════ */
export const applyCoupon = async (req, res) => {
  try {
    const { code, items = [], shippingMethod = "standard", paymentMethod = "cod" } = req.body;

    if (!code) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon code required" });
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += Number(item.price) * Number(item.qty);
    }

    const { coupon, error } = await checkCoupon(code, {
      subtotal,
      paymentMethod,
      user: req.user,
    });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const totals = await recomputeTotals({
      items,
      shippingMethod,
      coupon,
      paymentMethod,
    });

    return res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          label: coupon.label,
          description: coupon.description,
        },
        totals,
      },
    });
  } catch (err) {
    console.error("applyCoupon:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to apply coupon" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/checkout/session
   Create or update a checkout session
   ════════════════════════════════════════════════════ */
export const upsertSession = async (req, res) => {
  try {
    const {
      sessionId,
      customer,
      address,
      items,
      shippingMethod = "standard",
      paymentMethod = "cod",
      couponCode = null,
    } = req.body;

    if (!customer || !address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required checkout fields",
      });
    }

    /* Recompute everything server-side */
    const subtotal = items.reduce(
      (s, i) => s + Number(i.price) * Number(i.qty),
      0
    );

    const { coupon } = await checkCoupon(couponCode, {
      subtotal,
      paymentMethod,
      user: req.user,
    });

    const totals = await recomputeTotals({
      items,
      shippingMethod,
      coupon,
      paymentMethod,
    });

    const userId = await resolveUserId(req, customer);

    let session;
    if (sessionId && isValidId(sessionId)) {
      session = await CheckoutSession.findById(sessionId);
    }
    if (!session) {
      session = new CheckoutSession();
    }

    session.user = userId;
    session.customer = customer;
    session.address = address;
    session.items = items;
    session.shippingMethod = shippingMethod;
    session.paymentMethod = paymentMethod;
    session.couponCode = coupon?.code || null;
    session.totals = totals;
    session.status = "open";
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);

    await session.save();

    return res.json({ success: true, data: session });
  } catch (err) {
    console.error("upsertSession:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save checkout session" });
  }
};

/* ════════════════════════════════════════════════════
   GET /api/checkout/session/:id
   ════════════════════════════════════════════════════ */
export const getSession = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid session id" });
    }

    const session = await CheckoutSession.findById(id).lean();
    if (!session) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    /* Ownership — allow owner or admin only */
    const isAdmin = req.user?.role === "admin";
    const ownerId = session.user ? String(session.user) : null;
    const isOwner = ownerId && ownerId === String(req.user?._id);
    const emailMatch =
      (session.customer?.email || "").toLowerCase() ===
      (req.user?.email || "").toLowerCase();

    if (!isAdmin && !isOwner && !emailMatch) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return res.json({ success: true, data: session });
  } catch (err) {
    console.error("getSession:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load session" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/checkout/place-order
   Final step — validates, creates Order, clears cart,
   marks session as completed
   ════════════════════════════════════════════════════ */
export const placeOrder = async (req, res) => {
  try {
    const {
      sessionId,
      customer,
      address,
      items,
      shippingMethod = "standard",
      paymentMethod = "cod",
      couponCode = null,
    } = req.body;

    if (!customer || !address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required order fields",
      });
    }

    /* ─── 1. Re-validate every item against DB ─── */
    const validatedItems = [];
    for (const raw of items.slice(0, 100)) {
      if (!isValidId(raw.productId)) continue;
      const product = await Post.findById(raw.productId).lean();
      if (!product || product.isPublished === false) continue;
      if (product.inStock === false || product.stockQuantity === 0) continue;

      const reg = Number(product.regularPrice) || 0;
      const sale = Number(product.salePrice) || 0;
      const price = sale > 0 && sale < reg ? sale : reg;
      const maxQty = Math.min(Number(product.stockQuantity) || 99, 99);
      const qty = Math.min(Number(raw.qty) || 1, maxQty);

      validatedItems.push({
        productId: product._id,
        name: product.title,
        brand: product.brand || "",
        image: product.images?.[0] || "",
        size: raw.size || null,
        qty,
        price,
      });
    }

    if (validatedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "None of the items are available",
      });
    }

    /* ─── 2. Recompute totals server-side ─── */
    const subtotal = validatedItems.reduce(
      (s, i) => s + i.price * i.qty,
      0
    );

    const { coupon } = await checkCoupon(couponCode, {
      subtotal,
      paymentMethod,
      user: req.user,
    });

    const totals = await recomputeTotals({
      items: validatedItems,
      shippingMethod,
      coupon,
      paymentMethod,
    });

    /* ─── 3. Resolve user ─── */
    const userId = await resolveUserId(req, customer);

    /* ─── 4. Create the order ─── */
    const order = await Order.create({
      orderNumber: genOrderNumber(),
      user: userId,
      customer,
      address,
      items: validatedItems,
      shippingMethod,
      paymentMethod,
      couponCode: coupon?.code || null,
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
    });

    /* ─── 5. Increment coupon usage ─── */
    if (coupon) {
      await Coupon.updateOne(
        { code: coupon.code },
        { $inc: { usedCount: 1 } }
      );
    }

    /* ─── 6. Mark session completed ─── */
    if (sessionId && isValidId(sessionId)) {
      await CheckoutSession.findByIdAndUpdate(sessionId, {
        status: "completed",
        order: order._id,
      });
    }

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("placeOrder:", err);
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res
      .status(500)
      .json({ success: false, message: "Failed to place order" });
  }
};

/* ════════════════════════════════════════════════════
   Address book
   ════════════════════════════════════════════════════ */

/* GET /api/checkout/addresses */
export const listAddresses = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const addresses = await Address.find({ user: req.user._id })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, data: addresses });
  } catch (err) {
    console.error("listAddresses:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load addresses" });
  }
};

/* POST /api/checkout/addresses */
export const createAddress = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { address, isDefault = false, label = "" } = req.body;
    if (!address) {
      return res
        .status(400)
        .json({ success: false, message: "Address is required" });
    }

    const existingCount = await Address.countDocuments({
      user: req.user._id,
    });

    const doc = await Address.create({
      user: req.user._id,
      address: { ...address, label },
      isDefault: isDefault || existingCount === 0,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("createAddress:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save address" });
  }
};

/* PATCH /api/checkout/addresses/:id */
export const updateAddress = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { address, isDefault, label } = req.body;

    const doc = await Address.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    if (address) doc.address = { ...address, label: label ?? doc.address.label };
    if (typeof isDefault === "boolean") doc.isDefault = isDefault;

    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("updateAddress:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update address" });
  }
};

/* DELETE /api/checkout/addresses/:id */
export const deleteAddress = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const deleted = await Address.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    /* If we deleted the default, promote the newest one */
    if (deleted.isDefault) {
      const next = await Address.findOne({ user: req.user._id }).sort({
        createdAt: -1,
      });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    return res.json({ success: true, message: "Address deleted" });
  } catch (err) {
    console.error("deleteAddress:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete address" });
  }
};

/* ════════════════════════════════════════════════════
   GET /api/checkout/coupons
   Public list of active coupons (for dev/demo only)
   ════════════════════════════════════════════════════ */
export const listCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    })
      .select("code type value label description minSubtotal")
      .lean();

    return res.json({ success: true, data: coupons });
  } catch (err) {
    console.error("listCoupons:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load coupons" });
  }
};