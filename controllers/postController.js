import mongoose from 'mongoose';
import slugify from 'slugify';
import {
  Post,
  CATEGORIES,
  CONDITIONS,
  SIZES,
  SHOE_SIZES,
  BRANDS,
} from '../models/Post.js';

/* ─────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */
const generateUniqueSlug = async (title, excludeId = null) => {
  const base = slugify(title || '', { lower: true, strict: true }) || 'product';
  let slug = base;
  let counter = 1;

  const query = { slug };
  if (excludeId) query._id = { $ne: excludeId };

  while (await Post.findOne(query)) {
    slug = `${base}-${counter}`;
    counter++;
    query.slug = slug;
  }
  return slug;
};

const sanitizeNumber = (n, fallback = 0) => {
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
};

const isValidPrice = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;

const SKU_REGEX = /^[A-Z0-9-]{3,40}$/;

/* ✅ Escape user input before building a RegExp */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ✅ Case-insensitive exact match — used for brand/category/condition */
const ciExact = (value) => ({
  $regex: `^${escapeRegex(value)}$`,
  $options: 'i',
});

/* ✅ Convert Mongoose ValidationError into a readable {field: message} map */
const extractValidationErrors = (error) => {
  if (error.name !== 'ValidationError') return null;
  const errors = {};
  Object.keys(error.errors).forEach((key) => {
    errors[key] = error.errors[key].message;
  });
  return errors;
};

/* ✅ Centralized error responder — used by every handler */
const respondError = (res, error, fallbackMessage) => {
  console.error('[postController]', error);

  const validationErrors = extractValidationErrors(error);
  if (validationErrors) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors,
    });
  }

  /* ✅ Smarter duplicate-key message (reads which field collided) */
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    const label =
      field === 'sku' ? 'SKU' : field === 'slug' ? 'URL slug' : field;
    return res.status(409).json({
      success: false,
      message: `${label} already exists`,
      errors: { [field]: `${label} must be unique` },
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid value for ${error.path}`,
    });
  }

  return res.status(500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

/* ─────────────────────────────────────────────────────────────
 * Stock helpers
 * ───────────────────────────────────────────────────────────── */

/* Low-stock threshold — used for the "low stock" admin report */
const LOW_STOCK_THRESHOLD = 5;

/* Keep `inStock` in sync with `stockQuantity`.
   Rule: inStock === (stockQuantity > 0). */
const syncStockFlags = (data) => {
  const next = { ...data };
  if (next.stockQuantity !== undefined) {
    const qty = Math.max(0, Number(next.stockQuantity) || 0);
    next.stockQuantity = qty;
    next.inStock = qty > 0;
  } else if (next.inStock === false && next.stockQuantity === undefined) {
    /* Explicitly marked out of stock but no quantity given — force 0 */
    next.stockQuantity = 0;
  }
  return next;
};

/* Normalize stock adjustment payload → { mode, amount } */
const parseStockAction = (body = {}) => {
  /* Priority: set > restock > delta */
  if (body.set !== undefined) {
    const n = Number(body.set);
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'set must be a non-negative number' };
    }
    return { mode: 'set', amount: Math.floor(n) };
  }
  if (body.restock !== undefined) {
    const n = Number(body.restock);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: 'restock must be a positive number' };
    }
    return { mode: 'restock', amount: Math.floor(n) };
  }
  if (body.delta !== undefined) {
    const n = Number(body.delta);
    if (!Number.isFinite(n) || n === 0) {
      return { error: 'delta must be a non-zero number' };
    }
    return { mode: 'delta', amount: Math.floor(n) };
  }
  return { error: 'Provide one of: set, restock, or delta' };
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts   (public catalog)
 * ───────────────────────────────────────────────────────────── */
export const getPosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      sort = 'desc',
      sortBy = 'createdAt',
      category,
      brand,
      condition,
      size,
      minPrice,
      maxPrice,
      search,
      featured,
      inStock,
      published = 'true',
    } = req.query;

    const filter = {};

    /* ✅ Case-insensitive exact matches — fixes brand=nike vs "Nike" */
    if (category && category !== 'All') filter.category = ciExact(category);
    if (brand && brand !== 'All') filter.brand = ciExact(brand);
    if (condition && condition !== 'All') filter.condition = ciExact(condition);
    if (size && size !== 'All') filter.sizes = size;

    if (published === 'true') filter.isPublished = true;
    else if (published === 'false') filter.isPublished = false;

    if (featured === 'true') filter.isFeatured = true;
    if (inStock === 'true') filter.inStock = true;
    if (inStock === 'false') filter.inStock = false;

    /* Price range — match either regular or sale price */
    const min = minPrice !== undefined ? sanitizeNumber(minPrice, null) : null;
    const max = maxPrice !== undefined ? sanitizeNumber(maxPrice, null) : null;
    if (min !== null || max !== null) {
      const range = {};
      if (min !== null) range.$gte = min;
      if (max !== null) range.$lte = max;
      filter.$or = [{ regularPrice: range }, { salePrice: range }];
    }

    /* ✅ Text search — includes SKU, brand, category, descriptions */
    if (search && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), 'i');
      const searchOr = [
        { title: regex },
        { sku: regex },
        { shortDescription: regex },
        { longDescription: regex },
        { category: regex },
        { brand: regex },
        { authorName: regex },
      ];
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: searchOr });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = sort === 'asc' ? 1 : -1;

    const allowedSort = [
      'createdAt',
      'regularPrice',
      'salePrice',
      'rating',
      'sold',
      'views',
      'title',
    ];
    const sortField = allowedSort.includes(sortBy) ? sortBy : 'createdAt';

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('author', 'fullname email avatar')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean({ virtuals: true }),
      Post.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: posts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        hasMore: pageNum * limitNum < total,
      },
      filters: {
        categories: CATEGORIES,
        conditions: CONDITIONS,
        brands: BRANDS,
        sizes: [...SIZES, ...SHOE_SIZES],
      },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch products');
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts/meta/filters   (public — for storefront filters)
 * ───────────────────────────────────────────────────────────── */
export const getFilterMeta = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        categories: CATEGORIES,
        conditions: CONDITIONS,
        brands: BRANDS,
        sizes: [...SIZES, ...SHOE_SIZES],
      },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch metadata');
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts/meta/brand-counts   (public)
 *
 * Returns the number of PUBLISHED products per brand.
 * ✅ Case-insensitive so `nike` in a URL still matches "Nike".
 * ───────────────────────────────────────────────────────────── */
export const getBrandCounts = async (req, res) => {
  try {
    const agg = await Post.aggregate([
      { $match: { isPublished: true } },
      /* Normalize brand casing so counters merge regardless of source */
      {
        $group: {
          _id: { $toLower: { $ifNull: ['$brand', ''] } },
          count: { $sum: 1 },
          originalBrand: { $first: '$brand' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    /* Build a case-insensitive lookup: "nike" → 12 */
    const counts = {};
    agg.forEach((b) => {
      if (!b._id) return;
      counts[b._id] = Number(b.count) || 0;
    });

    const brands = BRANDS.map((brand) => ({
      value: brand,
      count: counts[brand.toLowerCase()] || 0,
    }));

    res.json({
      success: true,
      data: { brands },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch brand counts');
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts/meta/low-stock   (admin — low/out-of-stock report)
 *
 * Query: ?threshold=5
 * ───────────────────────────────────────────────────────────── */
export const getLowStock = async (req, res) => {
  try {
    const threshold = Math.max(
      0,
      Number(req.query.threshold) || LOW_STOCK_THRESHOLD
    );

    const products = await Post.find({
      $or: [{ stockQuantity: { $lte: threshold } }, { inStock: false }],
      isPublished: true,
    })
      .select('title sku brand category stockQuantity inStock sold images')
      .sort({ stockQuantity: 1, sold: -1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      data: {
        threshold,
        count: products.length,
        products: products.map((p) => ({
          ...p,
          image: p.images?.[0] || null,
          outOfStock: p.stockQuantity <= 0,
          lowStock: p.stockQuantity > 0 && p.stockQuantity <= threshold,
        })),
      },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch low-stock report');
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts/:id   (by ObjectId or slug)
 * ───────────────────────────────────────────────────────────── */
export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);

    let post;
    if (isObjectId) {
      post = await Post.findById(id).populate('author', 'fullname email avatar');
    } else {
      post = await Post.findOne({ slug: id }).populate(
        'author',
        'fullname email avatar'
      );
    }

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    /* Increment views without blocking the response */
    Post.updateOne({ _id: post._id }, { $inc: { views: 1 } }).catch(() => {});

    res.json({ success: true, data: post });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch product');
  }
};

/* ─────────────────────────────────────────────────────────────
 * GET /api/posts/:id/stock   (admin — read stock state)
 * ───────────────────────────────────────────────────────────── */
export const getStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid product ID' });
    }

    const post = await Post.findById(id)
      .select('title sku stockQuantity inStock sold')
      .lean();

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    return res.json({
      success: true,
      data: {
        ...post,
        lowStock:
          post.stockQuantity > 0 && post.stockQuantity <= LOW_STOCK_THRESHOLD,
        outOfStock: post.stockQuantity <= 0,
      },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to fetch stock');
  }
};

/* ─────────────────────────────────────────────────────────────
 * POST /api/posts   (admin only)
 * ───────────────────────────────────────────────────────────── */
export const createPost = async (req, res) => {
  try {
    const {
      title,
      sku,
      shortDescription,
      longDescription,
      category,
      condition,
      brand,
      sizes,
      images,
      regularPrice,
      salePrice = 0,
      isPublished = true,
      isFeatured = false,
      inStock = true,
      stockQuantity = 0,
    } = req.body;

    /* ── Required field checks ── */
    const missing = [];
    if (!title) missing.push('title');
    if (!shortDescription) missing.push('shortDescription');
    if (!longDescription) missing.push('longDescription');
    if (!category) missing.push('category');
    if (!condition) missing.push('condition');
    if (!brand) missing.push('brand');
    if (!sizes || !Array.isArray(sizes) || sizes.length === 0)
      missing.push('sizes');
    if (!images || !Array.isArray(images) || images.length === 0)
      missing.push('images');
    if (regularPrice === undefined || regularPrice === null)
      missing.push('regularPrice');

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing or invalid required fields: ${missing.join(', ')}`,
      });
    }

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category must be one of: ${CATEGORIES.join(', ')}`,
      });
    }
    if (!CONDITIONS.includes(condition)) {
      return res.status(400).json({
        success: false,
        message: `Condition must be one of: ${CONDITIONS.join(', ')}`,
      });
    }
    if (!BRANDS.includes(brand)) {
      return res.status(400).json({
        success: false,
        message: 'Brand is not supported',
      });
    }

    const validSizes = sizes.every(
      (s) => SIZES.includes(s) || SHOE_SIZES.includes(s)
    );
    if (!validSizes) {
      return res.status(400).json({
        success: false,
        message: 'One or more sizes are invalid',
      });
    }

    if (!isValidPrice(regularPrice)) {
      return res.status(400).json({
        success: false,
        message: 'Regular price must be a non-negative number',
      });
    }
    if (
      salePrice &&
      (!isValidPrice(salePrice) || Number(salePrice) > Number(regularPrice))
    ) {
      return res.status(400).json({
        success: false,
        message: 'Sale price must be a non-negative number and ≤ regular price',
      });
    }

    /* ✅ Validate optional SKU if provided */
    let normalizedSku;
    if (sku !== undefined && sku !== null && String(sku).trim() !== '') {
      normalizedSku = String(sku).trim().toUpperCase();
      if (!SKU_REGEX.test(normalizedSku)) {
        return res.status(400).json({
          success: false,
          message: 'SKU must be 3–40 chars: A–Z, 0–9, and hyphens only',
        });
      }
    }
    /* If not provided, the model's `pre('validate')` hook auto-generates it. */

    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ success: false, message: 'User not authenticated' });
    }

    const slug = await generateUniqueSlug(title);
    const authorName = req.user.fullname || req.user.email || 'Admin';

    /* ✅ Sync inStock with stockQuantity */
    const stockFields = syncStockFlags({
      inStock: Boolean(inStock),
      stockQuantity: sanitizeNumber(stockQuantity, 0),
    });

    const post = new Post({
      title,
      slug,
      ...(normalizedSku ? { sku: normalizedSku } : {}),
      shortDescription,
      longDescription,
      category,
      condition,
      brand,
      sizes,
      images,
      regularPrice: Number(regularPrice),
      salePrice: Number(salePrice) || 0,
      isPublished: Boolean(isPublished),
      isFeatured: Boolean(isFeatured),
      ...stockFields,
      author: req.user._id,
      authorName,
    });

    await post.save();
    await post.populate('author', 'fullname email avatar');

    res.status(201).json({ success: true, data: post });
  } catch (error) {
    return respondError(res, error, 'Failed to create product');
  }
};

/* ─────────────────────────────────────────────────────────────
 * PUT / PATCH /api/posts/:id   (admin only)
 * ───────────────────────────────────────────────────────────── */
export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid product ID' });
    }

    const allowed = [
      'title',
      'sku',
      'shortDescription',
      'longDescription',
      'category',
      'condition',
      'brand',
      'sizes',
      'images',
      'regularPrice',
      'salePrice',
      'isPublished',
      'isFeatured',
      'inStock',
      'stockQuantity',
    ];

    const filtered = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) filtered[key] = req.body[key];
    }

    if (Object.keys(filtered).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'No fields to update' });
    }

    /* ── Validate + coerce each field ── */

    if (filtered.title !== undefined) {
      const t = String(filtered.title).trim();
      if (t.length < 5 || t.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Title must be between 5 and 200 characters',
        });
      }
      filtered.title = t;
    }

    /* ✅ Validate + normalize SKU if provided; empty → let hook regenerate */
    if (filtered.sku !== undefined) {
      const raw = String(filtered.sku).trim().toUpperCase();
      if (!raw) {
        delete filtered.sku;
      } else if (!SKU_REGEX.test(raw)) {
        return res.status(400).json({
          success: false,
          message: 'SKU must be 3–40 chars: A–Z, 0–9, and hyphens only',
        });
      } else {
        filtered.sku = raw;
      }
    }

    if (filtered.shortDescription !== undefined) {
      const s = String(filtered.shortDescription).trim();
      if (s.length === 0 || s.length > 300) {
        return res.status(400).json({
          success: false,
          message: 'Short description must be 1–300 characters',
        });
      }
      filtered.shortDescription = s;
    }

    if (filtered.longDescription !== undefined) {
      if (
        typeof filtered.longDescription !== 'string' ||
        filtered.longDescription.trim() === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'Long description is required',
        });
      }
      if (filtered.longDescription.length > 50000) {
        return res.status(400).json({
          success: false,
          message: `Long description cannot exceed 50000 characters (got ${filtered.longDescription.length})`,
        });
      }
    }

    if (filtered.category && !CATEGORIES.includes(filtered.category)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid category' });
    }
    if (filtered.condition && !CONDITIONS.includes(filtered.condition)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid condition' });
    }
    if (filtered.brand && !BRANDS.includes(filtered.brand)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid brand' });
    }

    if (filtered.sizes !== undefined) {
      if (!Array.isArray(filtered.sizes) || filtered.sizes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Sizes must be a non-empty array',
        });
      }
      const valid = filtered.sizes.every(
        (s) => SIZES.includes(s) || SHOE_SIZES.includes(s)
      );
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'One or more sizes are invalid',
        });
      }
    }

    if (filtered.images !== undefined) {
      if (!Array.isArray(filtered.images) || filtered.images.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Images must be a non-empty array',
        });
      }
    }

    if (filtered.regularPrice !== undefined) {
      if (!isValidPrice(filtered.regularPrice)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid regular price' });
      }
      filtered.regularPrice = Number(filtered.regularPrice);
    }
    if (filtered.salePrice !== undefined) {
      if (!isValidPrice(filtered.salePrice)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid sale price' });
      }
      filtered.salePrice = Number(filtered.salePrice);
    }

    /* ✅ Sync inStock ↔ stockQuantity */
    if (filtered.stockQuantity !== undefined || filtered.inStock !== undefined) {
      let currentQty, currentInStock;

      if (
        filtered.stockQuantity === undefined ||
        filtered.inStock === undefined
      ) {
        const existing = await Post.findById(id)
          .select('stockQuantity inStock')
          .lean();
        if (!existing) {
          return res
            .status(404)
            .json({ success: false, message: 'Product not found' });
        }
        currentQty = existing.stockQuantity ?? 0;
        currentInStock = existing.inStock !== false;
      }

      const merged = syncStockFlags({
        stockQuantity:
          filtered.stockQuantity !== undefined
            ? sanitizeNumber(filtered.stockQuantity, 0)
            : currentQty,
        inStock:
          filtered.inStock !== undefined
            ? Boolean(filtered.inStock)
            : currentInStock,
      });

      filtered.stockQuantity = merged.stockQuantity;
      filtered.inStock = merged.inStock;
    }

    /* ── Cross-field: salePrice ≤ regularPrice ── */
    if (
      filtered.regularPrice !== undefined ||
      filtered.salePrice !== undefined
    ) {
      const existing = await Post.findById(id)
        .select('regularPrice salePrice')
        .lean();
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: 'Product not found' });
      }
      const nextRegular =
        filtered.regularPrice !== undefined
          ? filtered.regularPrice
          : existing.regularPrice;
      const nextSale =
        filtered.salePrice !== undefined
          ? filtered.salePrice
          : existing.salePrice || 0;
      if (nextSale > nextRegular) {
        return res.status(400).json({
          success: false,
          message: 'Sale price cannot exceed regular price',
        });
      }
    }

    /* ── Regenerate slug if title changed ── */
    if (filtered.title) {
      filtered.slug = await generateUniqueSlug(filtered.title, id);
    }

    /* ── Perform update ── */
    const post = await Post.findByIdAndUpdate(
      id,
      { $set: filtered },
      { new: true, runValidators: true, context: 'query' }
    ).populate('author', 'fullname email avatar');

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: post });
  } catch (error) {
    return respondError(res, error, 'Failed to update product');
  }
};

/* ─────────────────────────────────────────────────────────────
 * PATCH /api/posts/:id/stock   (admin — adjust stock)
 *
 * Body (one of):
 *   { set: 50 }         → absolute new stock
 *   { restock: 20 }     → add 20 units
 *   { delta: -3 }       → subtract 3 units (correction)
 *   { reason: "..." }   → optional note for audit
 * ───────────────────────────────────────────────────────────── */
export const adjustStock = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid product ID' });
    }

    const parsed = parseStockAction(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    const previousStock = Number(post.stockQuantity) || 0;
    let nextStock;

    switch (parsed.mode) {
      case 'set':
        nextStock = parsed.amount;
        break;
      case 'restock':
        nextStock = previousStock + parsed.amount;
        break;
      case 'delta':
        nextStock = previousStock + parsed.amount; /* amount may be negative */
        break;
      default:
        return res
          .status(400)
          .json({ success: false, message: 'Invalid action' });
    }

    if (nextStock < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce stock below 0 (currently ${previousStock}, requested ${parsed.amount})`,
      });
    }

    post.stockQuantity = nextStock;
    post.inStock = nextStock > 0;

    /* Optional audit trail — only recorded if the schema has the field */
    if (Array.isArray(post.stockHistory)) {
      post.stockHistory.push({
        at: new Date(),
        by: req.user?._id || null,
        byName: req.user?.fullname || req.user?.email || 'Admin',
        mode: parsed.mode,
        amount: parsed.amount,
        previousStock,
        nextStock,
        reason: String(req.body?.reason || '').trim() || '',
      });
    }

    await post.save();

    return res.json({
      success: true,
      data: {
        _id: post._id,
        title: post.title,
        sku: post.sku,
        previousStock,
        stockQuantity: post.stockQuantity,
        inStock: post.inStock,
        lowStock:
          post.stockQuantity > 0 && post.stockQuantity <= LOW_STOCK_THRESHOLD,
        outOfStock: post.stockQuantity <= 0,
      },
    });
  } catch (error) {
    return respondError(res, error, 'Failed to adjust stock');
  }
};

/* ─────────────────────────────────────────────────────────────
 * DELETE /api/posts/:id   (admin only)
 * ───────────────────────────────────────────────────────────── */
export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid product ID' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    await post.deleteOne();
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return respondError(res, error, 'Failed to delete product');
  }
};