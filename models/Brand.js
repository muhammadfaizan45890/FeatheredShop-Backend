import mongoose from "mongoose";
import slugify from "slugify";

/* ════════════════════════════════════════════════════════════
   Brand Schema
   ════════════════════════════════════════════════════════════ */
const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      trim: true,
      maxlength: [80, "Name cannot exceed 80 characters"],
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    /* Short blurb shown on the storefront card */
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
      default: "",
    },

    /* Logo — full URL or relative path from upload middleware */
    logo: {
      type: String,
      default: "",
      trim: true,
    },

    /* Optional cover image for brand detail pages */
    coverImage: {
      type: String,
      default: "",
      trim: true,
    },

    /* Link to external brand site */
    website: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator(v) {
          if (!v) return true;
          return /^https?:\/\/[^\s]+$/i.test(v);
        },
        message: "Website must be a valid URL",
      },
    },

    /* Storefront flags */
    featured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    /* Manual sort priority — lower number = earlier */
    order: { type: Number, default: 0, index: true },

    /* Optional SEO fields */
    metaTitle: { type: String, default: "", trim: true, maxlength: 120 },
    metaDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },

    /* Author (admin who created it) */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ════════════════════════════════════════════════════════════
   Indexes
   ════════════════════════════════════════════════════════════ */
brandSchema.index({ name: "text", description: "text" });
brandSchema.index({ featured: 1, order: 1, name: 1 });
brandSchema.index({ isActive: 1, order: 1 });

/* ════════════════════════════════════════════════════════════
   Virtual — product count (set by controller via lookup)
   ════════════════════════════════════════════════════════════ */
brandSchema.virtual("initials").get(function () {
  const parts = String(this.name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
});

/* ════════════════════════════════════════════════════════════
   Pre-validate — auto-generate slug if missing
   ════════════════════════════════════════════════════════════ */
brandSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

/* ════════════════════════════════════════════════════════════
   Pre-save — ensure slug uniqueness (append -2, -3, ...)
   ════════════════════════════════════════════════════════════ */
brandSchema.pre("save", async function (next) {
  if (!this.isModified("slug") && !this.isModified("name")) return next();

  const base = this.slug || slugify(this.name || "", { lower: true, strict: true });
  let slug = base;
  let counter = 1;

  const Model = this.constructor;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await Model.findOne({
      slug,
      _id: { $ne: this._id },
    })
      .select("_id")
      .lean();
    if (!existing) break;
    slug = `${base}-${++counter}`;
  }

  this.slug = slug;
  next();
});

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;
export { Brand };