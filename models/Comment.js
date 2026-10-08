import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: 5000,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: [true, 'Post reference is required'],
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
      index: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

// ─── Virtual: like count ──────────────────────────────
CommentSchema.virtual('likeCount').get(function () {
  return this.likes?.length || 0;
});

// ─── Method: check if a user has liked ──────────────────
CommentSchema.methods.isLikedBy = function (userId) {
  if (!userId) return false;
  return this.likes?.some((id) => id.toString() === userId.toString()) || false;
};

// ─── Ensure virtuals are included when converting to JSON/Object ──
CommentSchema.set('toJSON', { virtuals: true });
CommentSchema.set('toObject', { virtuals: true });

export const Comment = mongoose.model('Comment', CommentSchema);