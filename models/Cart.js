import mongoose from "mongoose";

/* ─── Cart Item Sub-Schema ─────────────────────────── */
const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    slug: { type: String, trim: true },
    sku: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    image: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    size: { type: String, default: null, trim: true },
    variant: { type: String, trim: true },
    qty: { type: Number, required: true, min: 1, max: 99, default: 1 },
    addedAt: { type: Date, default: Date.now },
    priceAtAdd: { type: Number, min: 0 },
  },
  { _id: false }
);

/* ─── Cart Schema ──────────────────────────────────── */
const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 100,
        message: "Cart cannot exceed 100 unique items",
      },
    },
    coupon: {
      code: { type: String, trim: true, uppercase: true },
      discount: { type: Number, min: 0, default: 0 },
      type: { type: String, enum: ["percent", "flat"], default: "percent" },
    },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* ─── Virtuals ─────────────────────────────────────── */
cartSchema.virtual("subtotal").get(function () {
  return this.items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
    0
  );
});

cartSchema.virtual("itemCount").get(function () {
  return this.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
});

cartSchema.virtual("uniqueCount").get(function () {
  return this.items.length;
});

cartSchema.pre("save", function (next) {
  if (this.isModified("items")) this.lastActivityAt = new Date();
  next();
});

cartSchema.set("toJSON", { virtuals: true });
cartSchema.set("toObject", { virtuals: true });

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;