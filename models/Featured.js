import mongoose from 'mongoose';

const featuredSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      unique: true, // a post can only be featured once
    },
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient sorting
featuredSchema.index({ order: 1 });

export default mongoose.model('Featured', featuredSchema);
