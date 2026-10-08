import mongoose from 'mongoose';
import slugify from 'slugify';

/* ─────────────────────────────────────────────────────────────
 * Enums
 * ───────────────────────────────────────────────────────────── */
export const CATEGORIES = ['Men', 'Women', 'Unisex', 'Kids'];
export const CONDITIONS = ['Good', 'Very Good', 'Excellent', 'Premium', 'Premium Plus'];
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'];
export const SHOE_SIZES = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
export const BRANDS = [
  'Adidas', 'ASICS', 'Birkenstock', 'Brooks', 'Clarks',
  'Columbia Sportswear', 'Converse', 'Crocs', 'Dr. Martens', 'FILA',
  'Geox', 'Gucci', 'HOKA', 'Jimmy Choo', 'Louis Vuitton',
  'Merrell', 'Mizuno', 'New Balance', 'Nike', 'Prada',
  'PUMA', 'Reebok', 'Saucony', 'Skechers', 'The North Face',
  'Timberland', 'TOMS', 'Under Armour', 'Zara', 'Others',
];

/* ─────────────────────────────────────────────────────────────
 * Product Schema
 * ───────────────────────────────────────────────────────────── */
const PostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      // NOTE: no inline text index — the compound text index below is the only one
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      trim: true,
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [40, 'SKU cannot exceed 40 characters'],
      index: true,
    },
    shortDescription: {
      type: String,
      required: [true, 'Short description is required'],
      trim: true,
      maxlength: [300, 'Short description cannot exceed 300 characters'],
    },
    longDescription: {
      type: String,
      required: [true, 'Long description is required'],
      trim: true,
      maxlength: [50000, 'Long description cannot exceed 50000 characters'],
    },

    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: CATEGORIES,
        message: `Category must be one of: ${CATEGORIES.join(', ')}`,
      },
      index: true,
    },
    condition: {
      type: String,
      required: [true, 'Condition is required'],
      enum: {
        values: CONDITIONS,
        message: `Condition must be one of: ${CONDITIONS.join(', ')}`,
      },
      index: true,
    },
    brand: {
      type: String,
      required: [true, 'Brand is required'],
      enum: {
        values: BRANDS,
        message: 'Brand must be one of the supported brands',
      },
      trim: true,
      index: true,
    },

    sizes: {
      type: [String],
      set: (arr) => (Array.isArray(arr) ? arr.map((s) => String(s).trim()) : arr),
      required: [true, 'At least one size is required'],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length > 0 &&
          v.every((s) => SIZES.includes(s) || SHOE_SIZES.includes(s)),
        message: 'Sizes must be valid apparel or shoe sizes',
      },
    },

    images: {
      type: [String],
      required: [true, 'At least one image is required'],
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length > 0 &&
          v.length <= 12 &&
          v.every((u) => /^https?:\/\//i.test(u) || /^data:image\//i.test(u)),
        message: 'Provide 1–12 valid image URLs',
      },
    },

    regularPrice: {
      type: Number,
      required: [true, 'Regular price is required'],
      min: [0, 'Regular price cannot be negative'],
    },
    salePrice: {
      type: Number,
      default: 0,
      min: [0, 'Sale price cannot be negative'],
      validate: {
        validator: function (v) {
          if (!v) return true;
          return v <= this.regularPrice;
        },
        message: 'Sale price cannot be greater than regular price',
      },
    },

    isPublished: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    inStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 0, min: 0 },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    sold: { type: Number, default: 0, min: 0 },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author reference is required'],
    },
    authorName: { type: String, trim: true },
  },
  { timestamps: true }
);

/* ─────────────────────────────────────────────────────────────
 * Indexes
 * ───────────────────────────────────────────────────────────── */
PostSchema.index({ title: 'text', shortDescription: 'text', longDescription: 'text' });
PostSchema.index({ category: 1, isPublished: 1, createdAt: -1 });
PostSchema.index({ brand: 1, isPublished: 1 });
PostSchema.index({ regularPrice: 1 });
PostSchema.index({ isPublished: 1, sold: -1 });
PostSchema.index({ isPublished: 1, rating: -1, numReviews: -1 });

/* ─────────────────────────────────────────────────────────────
 * Virtuals
 * ───────────────────────────────────────────────────────────── */
PostSchema.virtual('effectivePrice').get(function () {
  return this.salePrice && this.salePrice > 0 ? this.salePrice : this.regularPrice;
});

PostSchema.virtual('discountPercent').get(function () {
  if (!this.salePrice || this.salePrice <= 0 || this.salePrice >= this.regularPrice) {
    return 0;
  }
  return Math.round(((this.regularPrice - this.salePrice) / this.regularPrice) * 100);
});

/* ─────────────────────────────────────────────────────────────
 * SKU + slug helpers
 * ───────────────────────────────────────────────────────────── */
const toSkuTag = (str, max = 6) =>
  String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max) || 'GEN';

const buildSkuBase = (brand, category) => {
  const brandTag = toSkuTag(brand, 3);
  const catTag = toSkuTag(category, 3);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${brandTag}-${catTag}-${rand}`;
};

async function generateUniqueSku(Model, brand, category, excludeId = null) {
  const base = buildSkuBase(brand, category);
  let sku = base;
  let counter = 1;
  const query = { sku };
  if (excludeId) query._id = { $ne: excludeId };
  while (await Model.findOne(query).select('_id').lean()) {
    sku = `${base}-${counter}`;
    counter++;
    query.sku = sku;
  }
  return sku;
}

async function generateUniqueSlug(Model, title, excludeId = null) {
  const baseSlug = slugify(title || '', { lower: true, strict: true }) || 'product';
  let slug = baseSlug;
  let counter = 1;
  const query = { slug };
  if (excludeId) query._id = { $ne: excludeId };
  while (await Model.findOne(query)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
    query.slug = slug;
  }
  return slug;
}

/* ─────────────────────────────────────────────────────────────
 * Pre-validate — auto-generate SKU
 * ───────────────────────────────────────────────────────────── */
PostSchema.pre('validate', async function (next) {
  if (this.sku) {
    this.sku = String(this.sku).trim().toUpperCase();
    return next();
  }
  try {
    this.sku = await generateUniqueSku(
      this.constructor,
      this.brand,
      this.category,
      this._id
    );
    next();
  } catch (error) {
    this.sku = `GEN-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;
    console.warn('SKU generation failed, using fallback:', this.sku);
    next();
  }
});

/* ─────────────────────────────────────────────────────────────
 * Pre-save — auto-generate slug
 * ───────────────────────────────────────────────────────────── */
PostSchema.pre('save', async function (next) {
  if (!this.isModified('title') && this.slug) return next();
  try {
    this.slug = await generateUniqueSlug(this.constructor, this.title, this._id);
    next();
  } catch (error) {
    this.slug = `product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.warn('Slug generation failed, using fallback:', this.slug);
    next();
  }
});

/* ─────────────────────────────────────────────────────────────
 * Pre-findOneAndUpdate — keep slug/SKU in sync
 * Skips when there's no _id (updateOne/updateMany) and on upsert
 * ───────────────────────────────────────────────────────────── */
PostSchema.pre('findOneAndUpdate', async function (next) {
  try {
    if (this.getOptions()?.upsert) return next();
    const currentId = this.getQuery()._id;
    if (!currentId) return next();

    const update = this.getUpdate() || {};
    const $set = update.$set || update;
    const Model = this.model;

    if ($set.title) {
      const newSlug = await generateUniqueSlug(Model, $set.title, currentId);
      if (update.$set) update.$set.slug = newSlug;
      else update.slug = newSlug;
    }

    const explicitSku = $set.sku;
    if (!explicitSku && ($set.brand || $set.category)) {
      const existing = await Model.findById(currentId).select('brand category').lean();
      if (existing) {
        const nextBrand = $set.brand || existing.brand;
        const nextCategory = $set.category || existing.category;
        const newSku = await generateUniqueSku(Model, nextBrand, nextCategory, currentId);
        if (update.$set) update.$set.sku = newSku;
        else update.sku = newSku;
      }
    } else if (explicitSku) {
      const normalized = String(explicitSku).trim().toUpperCase();
      if (update.$set) update.$set.sku = normalized;
      else update.sku = normalized;
    }

    this.setUpdate(update);
    next();
  } catch (error) {
    console.warn('Slug/SKU regeneration on update failed:', error);
    next();
  }
});

/* ─────────────────────────────────────────────────────────────
 * Serialization
 * ───────────────────────────────────────────────────────────── */
PostSchema.set('toJSON', { virtuals: true });
PostSchema.set('toObject', { virtuals: true });

export const Post = mongoose.model('Post', PostSchema);