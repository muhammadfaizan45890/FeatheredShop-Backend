import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: "", trim: true },
    city: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, default: "Pakistan", trim: true },
    label: { type: String, default: "" }, // e.g. "Home", "Office"
  },
  { _id: false }
);

const userAddressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: { type: addressSchema, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* Ensure only one default per user */
userAddressSchema.index({ user: 1, isDefault: 1 });
userAddressSchema.pre("save", async function (next) {
  if (this.isDefault && this.isModified("isDefault")) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

const Address = mongoose.model("Address", userAddressSchema);
export default Address;