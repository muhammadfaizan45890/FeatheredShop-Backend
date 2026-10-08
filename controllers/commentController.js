import mongoose from 'mongoose';
import { Comment } from '../models/Comment.js';
import { Post } from '../models/Post.js';

// ─── Helper: find post by _id or slug ──────────────────
const findPostByIdentifier = async (identifier) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  return isObjectId
    ? await Post.findById(identifier)
    : await Post.findOne({ slug: identifier });
};

// ─── Get comments for a post (with nested replies) ────
export const getCommentsByPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // ✅ Resolve post by _id or slug
    const post = await findPostByIdentifier(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // ✅ Use the actual post._id for comment queries
    const allComments = await Comment.find({ post: post._id })
      .populate('author', 'fullname username email avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Build comment tree (same as before)
    const commentMap = {};
    allComments.forEach((c) => {
      commentMap[c._id] = { ...c, replies: [] };
    });

    const rootComments = [];
    allComments.forEach((c) => {
      if (c.parent && commentMap[c.parent]) {
        commentMap[c.parent].replies.push(commentMap[c._id]);
      } else {
        rootComments.push(commentMap[c._id]);
      }
    });

    const sortReplies = (comments) => {
      comments.forEach((c) => {
        if (c.replies && c.replies.length) {
          c.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          sortReplies(c.replies);
        }
      });
    };
    sortReplies(rootComments);

    const userId = req.user?._id ? req.user._id.toString() : null;
    const addLikeStatus = (comments) => {
      return comments.map((c) => {
        const liked = userId ? (c.likes || []).some((id) => id.toString() === userId) : false;
        return {
          ...c,
          liked,
          replies: c.replies && c.replies.length ? addLikeStatus(c.replies) : [],
        };
      });
    };

    const result = addLikeStatus(rootComments);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Like / Unlike a comment ──────────────────────────
export const toggleLike = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const index = comment.likes.indexOf(userId);
    let liked = false;

    if (index > -1) {
      comment.likes.splice(index, 1);
      liked = false;
    } else {
      comment.likes.push(userId);
      liked = true;
    }

    await comment.save();

    const updatedComment = await Comment.findById(commentId)
      .populate('author', 'fullname username email avatar')
      .lean();

    res.json({
      success: true,
      data: {
        _id: updatedComment._id,
        likes: updatedComment.likes ? updatedComment.likes.length : 0,
        liked,
        author: updatedComment.author,
        content: updatedComment.content,
        createdAt: updatedComment.createdAt,
      },
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Add a comment (root or reply) ────────────────────
export const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;

    // ✅ Resolve post by _id or slug
    const post = await findPostByIdentifier(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (parentId) {
      const parentComment = await Comment.findById(parentId);
      if (!parentComment) {
        return res.status(404).json({ success: false, message: 'Parent comment not found' });
      }
      if (parentComment.post.toString() !== post._id.toString()) {
        return res.status(400).json({ success: false, message: 'Parent comment does not belong to this post' });
      }
    }

    const newComment = new Comment({
      content,
      post: post._id,   // ✅ use actual post._id
      author: req.user._id,
      parent: parentId || null,
    });

    await newComment.save();
    await newComment.populate('author', 'fullname username email avatar');

    const newCommentObj = newComment.toObject();
    newCommentObj.liked = false;

    res.status(201).json({
      success: true,
      data: newCommentObj,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Delete a comment (author or admin only) ──────────
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (comment.author.toString() !== userId.toString() && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this comment' });
    }

    await comment.deleteOne();
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};