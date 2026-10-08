import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["percent", "flat", "freeship"],
      required: true,
    },
    value: { type: Number, default: 0, min: 0 },
    label: { type: String, default: "" },
    description: { type: String, default: "" },

    /* Limits */
    minSubtotal: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = unlimited
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: 1, min: 0 },

    /* Scheduling */
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    /* Eligibility */
    active: { type: Boolean, default: true, index: true },
    applicableMethods: {
      type: [String],
      enum: ["cod", "card", "wallet"],
      default: [],
    },
    applicableCategories: { type: [String], default: [] },
    excludesSaleItems: { type: Boolean, default: false },
  },
  { timestamps: true }
);

couponSchema.index({ active: 1, expiresAt: 1 });

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;