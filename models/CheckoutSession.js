import mongoose from "mongoose";

const checkoutItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    name: { type: String, required: true },
    brand: { type: String, default: "" },
    image: { type: String, default: "" },
    size: { type: String, default: null },
    qty: { type: Number, required: true, min: 1, max: 99 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const checkoutTotalsSchema = new mongoose.Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const checkoutAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String, default: "" },
    city: { type: String, required: true },
    province: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: "Pakistan" },
  },
  { _id: false }
);

const checkoutCustomerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const checkoutSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    customer: { type: checkoutCustomerSchema, required: true },
    address: { type: checkoutAddressSchema, required: true },
    items: {
      type: [checkoutItemSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    shippingMethod: {
      type: String,
      enum: ["standard", "express"],
      default: "standard",
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "card", "wallet"],
      default: "cod",
    },
    couponCode: { type: String, default: null },
    totals: { type: checkoutTotalsSchema, required: true },
    status: {
      type: String,
      enum: ["open", "completed", "expired", "abandoned"],
      default: "open",
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 2), // 2h
    },
  },
  { timestamps: true }
);

checkoutSessionSchema.index({ createdAt: -1 });
checkoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CheckoutSession = mongoose.model(
  "CheckoutSession",
  checkoutSessionSchema
);
export default CheckoutSession;