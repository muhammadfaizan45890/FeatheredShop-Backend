import express from 'express';
import {
  getHeroSlides,
  getAllSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  reorderSlides,
} from '../controllers/heroController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// ─── Public ──────────────────────────────────────────
router.get('/', getHeroSlides);

// ─── Admin ──────────────────────────────────────────
router.get('/admin', isAuthenticated, isAdmin, getAllSlides);
router.post('/', isAuthenticated, isAdmin, createHeroSlide);
router.put('/:id', isAuthenticated, isAdmin, updateHeroSlide);
router.patch('/:id', isAuthenticated, isAdmin, updateHeroSlide);
router.delete('/:id', isAuthenticated, isAdmin, deleteHeroSlide);
router.post('/reorder', isAuthenticated, isAdmin, reorderSlides);

export default router;