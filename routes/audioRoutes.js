import express from 'express';
import {
  getAudioList,
  getAudioById,
  getAllAudioAdmin,
  createAudio,
  updateAudio,
  deleteAudio,
} from '../controllers/audioController.js';
import { isAuthenticated, isAdmin } from '../middleware/isAuthenticated.js';

const router = express.Router();

// ─── Public routes ──────────────────────────────────────
router.get('/', getAudioList);
router.get('/:id', getAudioById);

// ─── Admin routes ──────────────────────────────────────
router.get('/admin/all', isAuthenticated, isAdmin, getAllAudioAdmin);
router.post('/admin', isAuthenticated, isAdmin, createAudio);
router.put('/admin/:id', isAuthenticated, isAdmin, updateAudio);
router.delete('/admin/:id', isAuthenticated, isAdmin, deleteAudio);

export default router;
