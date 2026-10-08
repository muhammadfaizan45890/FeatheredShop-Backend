import mongoose from "mongoose";
import slugify from "slugify";
import Brand from "../models/Brand.js";
import { Post } from "../models/Post.js";

/* ════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════ */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* Normalize a string-ish field */
const str = (v, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/* Turn a value into a boolean safely */
const bool = (v) => v === true || v === "true" || v === 1 || v === "1";

/* Build a unique slug (skips the current doc when updating) */
const buildUniqueSlug = async (name, excludeId = null) => {
  const base = slugify(String(name || "").trim(), {
    lower: true,
    strict: true,
  }) || "brand";
  let slug = base;
  let counter = 1;

  const query = () => {
    const q = { slug };
    if (excludeId) q._id = { $ne: excludeId };
    return q;
  };

  while (await Brand.exists(query())) {
    slug = `${base}-${++counter}`;
  }
  return slug;
};

/* Centralized error responder */
const respondError = (res, err, fallback) => {
  console.error("[brandController]", err);

  if (err?.name === "ValidationError") {
    const errors = {};
    Object.keys(err.errors).forEach((k) => {
      errors[k] = err.errors[k].message;
    });
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      errors: { [field]: `${field} must be unique` },
    });
  }

  if (err?.name === "CastError") {
    return res
      .status(400)
      .json({ success: false, message: `Invalid value for ${err.path}` });
  }

  return res
    .status(500)
    .json({ success: false, message: err?.message || fallback });
};

/* Attach product counts to a list of brands via one aggregation */
const attachProductCounts = async (brands) => {
  if (!brands.length) return brands;
  const names = brands.map((b) => b.name);

  /* Count products per brand (case-insensitive) */
  const counts = await Post.aggregate([
    { $match: { brand: { $in: names }, isPublished: { $ne: false } } },
    { $group: { _id: "$brand", count: { $sum: 1 } } },
  ]);

  const byName = new Map(
    counts.map((c) => [String(c._id).toLowerCase(), Number(c.count) || 0])
  );

  return brands.map((b) => ({
    ...b,
    productCount: byName.get(String(b.name).toLowerCase()) || 0,
  }));
};

/* ════════════════════════════════════════════════════════════
   PUBLIC
   ════════════════════════════════════════════════════════════ */

/* GET /api/brands */
export const listBrands = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = "",
      featured = "",
      letter = "",
      sort = "order",
      dir = "asc",
    } = req.query;

    const filter = { isActive: true };

    if (featured === "true") filter.featured = true;

    if (letter && /^[a-z]$/i.test(letter)) {
      filter.name = new RegExp(`^${letter}`, "i");
    }

    if (typeof search === "string" && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(safe, "i");
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 100));
    const skip = (pageNum - 1) * limitNum;

    const SORTABLE = new Set([
      "order",
      "name",
      "createdAt",
      "updatedAt",
      "featured",
    ]);
    const sortField = SORTABLE.has(sort) ? sort : "order";
    const sortDir = dir === "desc" ? -1 : 1;

    const [items, total] = await Promise.all([
      Brand.find(filter)
        .sort({ [sortField]: sortDir, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean({ virtuals: true }),
      Brand.countDocuments(filter),
    ]);

    const withCounts = await attachProductCounts(items);

    return res.json({
      success: true,
      data: withCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + items.length < total,
      },
    });
  } catch (err) {
    return respondError(res, err, "Failed to load brands");
  }
};

/* GET /api/brands/:id — accepts _id or slug */
export const getBrand = async (req, res) => {
  try {
    const { id } = req.params;

    const query = isValidId(id)
      ? { $or: [{ _id: id }, { slug: id }] }
      : { slug: id };

    const brand = await Brand.findOne(query).lean({ virtuals: true });
    if (!brand || !brand.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    const [withCounts] = await attachProductCounts([brand]);

    return res.json({ success: true, data: withCounts });
  } catch (err) {
    return respondError(res, err, "Failed to load brand");
  }
};

/* GET /api/brands/meta/letters — for the alphabet rail */
export const getBrandLetters = async (_req, res) => {
  try {
    const rows = await Brand.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: { $toUpper: { $substrCP: ["$name", 0, 1] } } } },
      { $sort: { _id: 1 } },
    ]);
    const letters = rows
      .map((r) => String(r._id || "").toUpperCase())
      .filter((c) => /^[A-Z]$/.test(c));

    return res.json({ success: true, data: { letters } });
  } catch (err) {
    return respondError(res, err, "Failed to load letters");
  }
};

/* ════════════════════════════════════════════════════════════
   ADMIN
   ════════════════════════════════════════════════════════════ */

/* GET /api/brands/admin — includes inactive brands */
export const listBrandsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      status = "",
      featured = "",
      sort = "order",
      dir = "asc",
    } = req.query;

    const filter = {};
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (featured === "true") filter.featured = true;
    if (featured === "false") filter.featured = false;

    if (typeof search === "string" && search.trim()) {
      const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(safe, "i");
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const SORTABLE = new Set([
      "order",
      "name",
      "createdAt",
      "updatedAt",
      "featured",
    ]);
    const sortField = SORTABLE.has(sort) ? sort : "order";
    const sortDir = dir === "desc" ? -1 : 1;

    const [items, total] = await Promise.all([
      Brand.find(filter)
        .sort({ [sortField]: sortDir, name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean({ virtuals: true }),
      Brand.countDocuments(filter),
    ]);

    const withCounts = await attachProductCounts(items);

    return res.json({
      success: true,
      data: withCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + items.length < total,
      },
    });
  } catch (err) {
    return respondError(res, err, "Failed to load brands");
  }
};

/* POST /api/brands */
export const createBrand = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const {
      name,
      description = "",
      logo = "",
      coverImage = "",
      website = "",
      featured = false,
      isActive = true,
      order = 0,
      metaTitle = "",
      metaDescription = "",
    } = req.body;

    if (!name || !String(name).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Brand name is required" });
    }

    const slug = await buildUniqueSlug(name);

    const brand = await Brand.create({
      name: str(name, 80),
      slug,
      description: str(description, 300),
      logo: str(logo, 500),
      coverImage: str(coverImage, 500),
      website: str(website, 500),
      featured: bool(featured),
      isActive: bool(isActive),
      order: Number(order) || 0,
      metaTitle: str(metaTitle, 120),
      metaDescription: str(metaDescription, 300),
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    return res.status(201).json({ success: true, data: brand });
  } catch (err) {
    return respondError(res, err, "Failed to create brand");
  }
};

/* PATCH /api/brands/:id */
export const updateBrand = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid brand ID" });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    const allowed = [
      "name",
      "description",
      "logo",
      "coverImage",
      "website",
      "featured",
      "isActive",
      "order",
      "metaTitle",
      "metaDescription",
    ];

    /* Apply each whitelisted field, coercing types as needed */
    allowed.forEach((key) => {
      if (req.body[key] === undefined) return;

      if (key === "featured" || key === "isActive") {
        brand[key] = bool(req.body[key]);
      } else if (key === "order") {
        brand[key] = Number(req.body[key]) || 0;
      } else if (key === "name") {
        brand.name = str(req.body.name, 80);
      } else if (key === "description") {
        brand.description = str(req.body.description, 300);
      } else if (key === "metaTitle") {
        brand.metaTitle = str(req.body.metaTitle, 120);
      } else if (key === "metaDescription") {
        brand.metaDescription = str(req.body.metaDescription, 300);
      } else {
        brand[key] = str(req.body[key], 500);
      }
    });

    /* Regenerate slug when the name changes */
    if (req.body.name && brand.isModified("name")) {
      brand.slug = await buildUniqueSlug(brand.name, brand._id);
    }

    brand.updatedBy = req.user._id;

    await brand.save();

    return res.json({ success: true, data: brand });
  } catch (err) {
    return respondError(res, err, "Failed to update brand");
  }
};

/* PATCH /api/brands/:id/toggle-featured */
export const toggleFeatured = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    brand.featured = !brand.featured;
    brand.updatedBy = req.user._id;
    await brand.save();

    return res.json({ success: true, data: brand });
  } catch (err) {
    return respondError(res, err, "Failed to toggle featured");
  }
};

/* PATCH /api/brands/:id/toggle-active */
export const toggleActive = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    brand.isActive = !brand.isActive;
    brand.updatedBy = req.user._id;
    await brand.save();

    return res.json({ success: true, data: brand });
  } catch (err) {
    return respondError(res, err, "Failed to toggle active");
  }
};

/* PATCH /api/brands/reorder — { order: ["id1","id2", ...] } */
export const reorderBrands = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Order array required" });
    }

    const bulk = order
      .map((id, i) =>
        isValidId(id)
          ? {
              updateOne: {
                filter: { _id: id },
                update: { $set: { order: i, updatedBy: req.user._id } },
              },
            }
          : null
      )
      .filter(Boolean);

    if (bulk.length) await Brand.bulkWrite(bulk);

    return res.json({ success: true, message: "Order updated" });
  } catch (err) {
    return respondError(res, err, "Failed to reorder brands");
  }
};

/* DELETE /api/brands/:id */
export const deleteBrand = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid brand ID" });
    }

    const brand = await Brand.findById(id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    /* Refuse to delete if products still reference this brand */
    const inUse = await Post.countDocuments({ brand: brand.name });
    if (inUse > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete — ${inUse} product${inUse === 1 ? "" : "s"} still use this brand. Reassign or hide it instead.`,
        productCount: inUse,
      });
    }

    await Brand.findByIdAndDelete(id);
    return res.json({ success: true, message: "Brand deleted" });
  } catch (err) {
    return respondError(res, err, "Failed to delete brand");
  }
};

/* POST /api/brands/bulk — { brands: [{name, logo, ...}, ...] } */
export const bulkCreateBrands = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { brands } = req.body;
    if (!Array.isArray(brands) || brands.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "brands array required" });
    }

    const created = [];
    const skipped = [];

    for (const raw of brands) {
      const name = str(raw.name, 80);
      if (!name) {
        skipped.push({ name: raw?.name, reason: "missing name" });
        continue;
      }

      const exists = await Brand.exists({ name });
      if (exists) {
        skipped.push({ name, reason: "already exists" });
        continue;
      }

      const slug = await buildUniqueSlug(name);
      const doc = await Brand.create({
        name,
        slug,
        description: str(raw.description, 300),
        logo: str(raw.logo, 500),
        coverImage: str(raw.coverImage, 500),
        website: str(raw.website, 500),
        featured: bool(raw.featured),
        isActive: raw.isActive === undefined ? true : bool(raw.isActive),
        order: Number(raw.order) || 0,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      created.push(doc);
    }

    return res.status(201).json({
      success: true,
      data: { created: created.length, skipped },
    });
  } catch (err) {
    return respondError(res, err, "Failed to bulk-create brands");
  }
};

/* ════════════════════════════════════════════════════════════
   LOGO UPLOAD
   PATCH /api/brands/:id/logo  (multipart, field name: "logo")
   Also supports POST /api/brands/logo (returns URL only)
   ════════════════════════════════════════════════════════════ */
export const uploadBrandLogoHandler = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    /* Public URL for the uploaded file */
    const publicUrl = `/uploads/brands/${req.file.filename}`;

    /* If an id was passed, attach the logo to that brand */
    if (req.params.id) {
      if (!isValidId(req.params.id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid brand ID" });
      }
      const brand = await Brand.findById(req.params.id);
      if (!brand) {
        return res
          .status(404)
          .json({ success: false, message: "Brand not found" });
      }
      brand.logo = publicUrl;
      brand.updatedBy = req.user._id;
      await brand.save();
      return res.json({ success: true, data: brand });
    }

    /* No id → return the URL so the admin UI can attach it */
    return res.status(201).json({
      success: true,
      data: { url: publicUrl },
    });
  } catch (err) {
    return respondError(res, err, "Failed to upload logo");
  }
};