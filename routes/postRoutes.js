import express from 'express';
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getFilterMeta,
  getBrandCounts,
  getLowStock,     // ✅ added
  getStock,        // ✅ added
  adjustStock,     // ✅ added
} from '../controllers/postController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────
 * Meta routes — MUST come before /:id
 * ───────────────────────────────────────────────────────────── */
router.get('/meta/filters', getFilterMeta);
router.get('/meta/brand-counts', getBrandCounts);
router.get('/meta/low-stock', isAuthenticated, isAdmin, getLowStock);

/* ─────────────────────────────────────────────────────────────
 * Public catalog
 * ───────────────────────────────────────────────────────────── */
router.get('/', getPosts);

/* Stock inspector — admin only. Declared before /:id so
   "stock" isn't treated as an _id by getPostById. */
router.get('/:id/stock', isAuthenticated, isAdmin, getStock);

/* Single product by ObjectId or slug — LAST among GETs */
router.get('/:id', getPostById);

/* ─────────────────────────────────────────────────────────────
 * Admin routes
 * ───────────────────────────────────────────────────────────── */

/* Stock adjustment */
router.patch('/:id/stock', isAuthenticated, isAdmin, adjustStock);

/* CRUD */
router.post('/', isAuthenticated, isAdmin, createPost);
router.put('/:id', isAuthenticated, isAdmin, updatePost);
router.patch('/:id', isAuthenticated, isAdmin, updatePost); // partial updates
router.delete('/:id', isAuthenticated, isAdmin, deletePost);

export default router;