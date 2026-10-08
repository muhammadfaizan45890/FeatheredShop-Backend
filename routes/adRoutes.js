import express from 'express';
import {
  getCurrentAd,
  getAllAds,
  getAdById,
  createAd,
  updateAd,
  deleteAd,
} from '../controllers/adController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// Public – now accepts ?slot=top|middle|bottom
router.get('/current', getCurrentAd);

// Admin only
router.use(isAuthenticated);
router.use(isAdmin);

router.route('/')
  .get(getAllAds)
  .post(createAd);

router.route('/:id')
  .get(getAdById)
  .put(updateAd)
  .delete(deleteAd);

export default router;
