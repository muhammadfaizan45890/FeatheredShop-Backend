import express from 'express';
import { toggleLike, deleteComment } from '../controllers/commentController.js';
import { isAuthenticated } from '../middleware/isAuthenticated.js';
import { Comment } from '../models/Comment.js';

const router = express.Router();

// ─── Like/Unlike a comment ──────────────────────────
router.post('/:commentId/like', isAuthenticated, toggleLike);

// ─── Delete a comment ───────────────────────────────
router.delete('/:commentId', isAuthenticated, deleteComment);

// ─── Reply to a comment ─────────────────────────────
router.post('/:commentId/replies', isAuthenticated, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Reply content is required',
      });
    }

    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Parent comment not found',
      });
    }

    const newReply = new Comment({
      content: content.trim(),
      post: parentComment.post,
      author: req.user._id,
      parent: commentId,
    });

    await newReply.save();
    await newReply.populate('author', 'fullname username email avatar');

    res.status(201).json({
      success: true,
      data: newReply,
    });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add reply',
    });
  }
});

export default router;