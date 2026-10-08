import express from 'express';
import {
  submitMessage,
  getAllMessages,
  getMessageById,
  markAsRead,
  deleteMessage,
} from '../controllers/contactController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// ─── Public ──────────────────────────────────────────
router.post('/', submitMessage);

// ─── Admin ──────────────────────────────────────────
router.get('/', isAuthenticated, isAdmin, getAllMessages);
router.get('/:id', isAuthenticated, isAdmin, getMessageById);
router.patch('/:id/read', isAuthenticated, isAdmin, markAsRead);
router.delete('/:id', isAuthenticated, isAdmin, deleteMessage);

export default router;