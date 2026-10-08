import express from 'express';
import {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus,
  deleteInquiry,
} from '../controllers/advertiseController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// Public route
router.post('/', createInquiry);

// Admin routes (protected)
router.get('/', isAuthenticated, isAdmin, getAllInquiries);
router.get('/:id', isAuthenticated, isAdmin, getInquiryById);
router.put('/:id/status', isAuthenticated, isAdmin, updateInquiryStatus);
router.delete('/:id', isAuthenticated, isAdmin, deleteInquiry);

export default router;