import express from 'express';
import { getCommentsByPost, addComment } from '../controllers/commentController.js';
import { isAuthenticated } from '../middleware/isAuthenticated.js';

const router = express.Router({ mergeParams: true });

// ─── Get comments for a post (public) ──────────────────
// Route: GET /api/posts/:postId/comments
router.get('/', getCommentsByPost);

// ─── Add a root comment (authenticated) ────────────────
// Route: POST /api/posts/:postId/comments
router.post('/', isAuthenticated, addComment);

export default router;