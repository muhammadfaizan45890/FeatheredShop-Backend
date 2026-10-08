import express from 'express';
import {
  getFeatured,
  getAllFeatured,
  createFeatured,
  updateFeatured,
  deleteFeatured,
  reorderFeatured,
} from '../controllers/featuredController.js';
// Ensure these are correctly exported from your middleware file
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// ─── Public route ──────────────────────────────────────
router.get('/', getFeatured);

// ─── Admin routes (all protected) ─────────────────────
// If you get "isAuthenticated is not a function", check your middleware exports.
// If your middleware uses default export, change to:
//   import isAuthenticated from '../middleware/isAuthenticated.js';
//   import isAdmin from '../middleware/isAuthenticated.js';
// and then use them directly.

router.get('/admin', isAuthenticated, isAdmin, getAllFeatured);
router.post('/admin', isAuthenticated, isAdmin, createFeatured);
router.put('/admin/:id', isAuthenticated, isAdmin, updateFeatured);
router.delete('/admin/:id', isAuthenticated, isAdmin, deleteFeatured);
router.post('/admin/reorder', isAuthenticated, isAdmin, reorderFeatured);

export default router;
