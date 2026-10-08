import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import {Post} from "../models/Post.js"; // ← adjust if your product model has a different path/name

/* ─── Helpers ──────────────────────────────────────── */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const buildItemKey = (productId, size) =>
  `${String(productId)}__${size || "one"}`;

const mergeItems = (existing = [], incoming = []) => {
  const map = new Map();
  [...existing, ...incoming].forEach((item) => {
    const key = buildItemKey(item.productId, item.size);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...item, qty: Number(item.qty) || 1 });
    } else {
      map.set(key, {
        ...current,
        ...item,
        qty: Math.min(99, (current.qty || 1) + (Number(item.qty) || 0)),
      });
    }
  });
  return Array.from(map.values());
};

/* ════════════════════════════════════════════════════
   GET /api/cart
   ════════════════════════════════════════════════════ */
export const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
    return res.json({ success: true, data: cart });
  } catch (err) {
    console.error("getCart:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load cart" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/cart/items
   ════════════════════════════════════════════════════ */
export const addItem = async (req, res) => {
  try {
    const { productId, size = null, qty = 1 } = req.body;

    if (!isValidId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid productId" });
    }
    const qtyNum = Math.max(1, Math.min(99, Number(qty) || 1));

    const product = await Post.findById(productId).lean();
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    if (product.isPublished === false) {
      return res
        .status(400)
        .json({ success: false, message: "Product is not available" });
    }
    if (product.inStock === false || product.stockQuantity === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Product is out of stock" });
    }
    if (Array.isArray(product.sizes) && product.sizes.length > 0 && !size) {
      return res
        .status(400)
        .json({ success: false, message: "Please choose a size" });
    }
    if (
      Array.isArray(product.sizes) &&
      product.sizes.length > 0 &&
      size &&
      !product.sizes.includes(size)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid size for this product" });
    }

    const reg = Number(product.regularPrice) || 0;
    const sale = Number(product.salePrice) || 0;
    const price = sale > 0 && sale < reg ? sale : reg;

    const maxQty = Math.min(Number(product.stockQuantity) || 99, 99);

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    const existingIdx = cart.items.findIndex(
      (i) =>
        String(i.productId) === String(productId) &&
        (i.size || null) === (size || null)
    );

    if (existingIdx >= 0) {
      const current = cart.items[existingIdx];
      current.qty = Math.min(maxQty, (current.qty || 0) + qtyNum);
      current.price = price;
      current.priceAtAdd = price;
      current.image = product.images?.[0] || current.image;
    } else {
      cart.items.push({
        productId: product._id,
        slug: product.slug,
        sku: product.sku,
        name: product.title,
        brand: product.brand,
        image: product.images?.[0],
        price,
        priceAtAdd: price,
        size: size || null,
        variant: size ? `Size ${size}` : undefined,
        qty: Math.min(qtyNum, maxQty),
        addedAt: new Date(),
      });
    }

    await cart.save();
    return res.status(201).json({ success: true, data: cart });
  } catch (err) {
    console.error("addItem:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to add item" });
  }
};

/* ════════════════════════════════════════════════════
   PATCH /api/cart/items/:itemId
   ════════════════════════════════════════════════════ */
export const updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const qty = Number(req.body?.qty);

    if (!Number.isFinite(qty)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid quantity" });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    let idx = cart.items.findIndex((i) => String(i.productId) === itemId);
    if (idx === -1) {
      const [pid, sizeRaw] = String(itemId).split("__");
      const size = sizeRaw === "one" ? null : sizeRaw || null;
      idx = cart.items.findIndex(
        (i) => String(i.productId) === pid && (i.size || null) === size
      );
    }

    if (idx === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Item not in cart" });
    }

    if (qty <= 0) {
      cart.items.splice(idx, 1);
    } else {
      const product = await Post.findById(cart.items[idx].productId)
        .select("stockQuantity inStock")
        .lean();
      const maxQty = Math.min(Number(product?.stockQuantity) || 99, 99);
      cart.items[idx].qty = Math.min(Math.max(1, qty), maxQty);
    }

    await cart.save();
    return res.json({ success: true, data: cart });
  } catch (err) {
    console.error("updateItem:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update item" });
  }
};

/* ════════════════════════════════════════════════════
   DELETE /api/cart/items/:itemId
   ════════════════════════════════════════════════════ */
export const removeItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const before = cart.items.length;
    cart.items = cart.items.filter((i) => {
      if (String(i.productId) === itemId) return false;
      const [pid, sizeRaw] = String(itemId).split("__");
      const size = sizeRaw === "one" ? null : sizeRaw || null;
      return !(String(i.productId) === pid && (i.size || null) === size);
    });

    if (cart.items.length === before) {
      return res
        .status(404)
        .json({ success: false, message: "Item not in cart" });
    }

    await cart.save();
    return res.json({ success: true, data: cart });
  } catch (err) {
    console.error("removeItem:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to remove item" });
  }
};

/* ════════════════════════════════════════════════════
   DELETE /api/cart
   ════════════════════════════════════════════════════ */
export const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.json({
        success: true,
        data: { user: req.user._id, items: [] },
      });
    }
    cart.items = [];
    cart.coupon = undefined;
    await cart.save();
    return res.json({ success: true, data: cart });
  } catch (err) {
    console.error("clearCart:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to clear cart" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/cart/merge
   ════════════════════════════════════════════════════ */
export const mergeCart = async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    if (incoming.length === 0) {
      return getCart(req, res);
    }

    const enriched = [];
    for (const raw of incoming.slice(0, 100)) {
      if (!isValidId(raw.productId)) continue;
      const product = await Post.findById(raw.productId).lean();
      if (!product || product.isPublished === false) continue;
      if (product.inStock === false || product.stockQuantity === 0) continue;

      const reg = Number(product.regularPrice) || 0;
      const sale = Number(product.salePrice) || 0;
      const price = sale > 0 && sale < reg ? sale : reg;
      const maxQty = Math.min(Number(product.stockQuantity) || 99, 99);

      const size =
        Array.isArray(product.sizes) && product.sizes.length > 0
          ? raw.size && product.sizes.includes(raw.size)
            ? raw.size
            : null
          : null;

      if (Array.isArray(product.sizes) && product.sizes.length > 0 && !size) {
        continue;
      }

      enriched.push({
        productId: product._id,
        slug: product.slug,
        sku: product.sku,
        name: product.title,
        brand: product.brand,
        image: product.images?.[0],
        price,
        priceAtAdd: price,
        size,
        variant: size ? `Size ${size}` : undefined,
        qty: Math.min(Math.max(1, Number(raw.qty) || 1), maxQty),
        addedAt: new Date(),
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    cart.items = mergeItems(cart.items.toObject(), enriched);
    await cart.save();

    return res.json({ success: true, data: cart });
  } catch (err) {
    console.error("mergeCart:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to merge cart" });
  }
};

/* ════════════════════════════════════════════════════
   POST /api/cart/validate
   ════════════════════════════════════════════════════ */
export const validateCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.json({
        success: true,
        data: { cart: { items: [] }, changed: [] },
      });
    }

    const changed = [];
    const kept = [];

    for (const item of cart.items) {
      const product = await Post.findById(item.productId)
        .select(
          "title images regularPrice salePrice stockQuantity inStock isPublished sizes"
        )
        .lean();

      if (!product || product.isPublished === false) {
        changed.push({ itemId: String(item.productId), reason: "unavailable" });
        continue;
      }
      if (product.inStock === false || product.stockQuantity === 0) {
        changed.push({ itemId: String(item.productId), reason: "out_of_stock" });
        continue;
      }

      const reg = Number(product.regularPrice) || 0;
      const sale = Number(product.salePrice) || 0;
      const price = sale > 0 && sale < reg ? sale : reg;
      const maxQty = Math.min(Number(product.stockQuantity) || 99, 99);

      if (price !== item.price) {
        changed.push({
          itemId: String(item.productId),
          reason: "price_changed",
          from: item.price,
          to: price,
        });
        item.price = price;
      }
      if (item.qty > maxQty) {
        changed.push({
          itemId: String(item.productId),
          reason: "qty_reduced",
          from: item.qty,
          to: maxQty,
        });
        item.qty = maxQty;
      }
      item.image = product.images?.[0] || item.image;
      item.name = product.title || item.name;

      kept.push(item);
    }

    cart.items = kept;
    await cart.save();

    return res.json({
      success: true,
      data: { cart, changed },
    });
  } catch (err) {
    console.error("validateCart:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to validate cart" });
  }
};