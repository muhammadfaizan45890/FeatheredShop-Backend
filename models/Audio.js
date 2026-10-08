import mongoose from 'mongoose';

const audioSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    embedCode: {
      type: String,
      required: [true, 'Embed code is required'],
    },
    coverImage: {
      type: String,
      default: '',
    },
    duration: {
      type: String,
      default: '',
    },
    author: {
      type: String,
      trim: true,
      default: 'Feathered Pen',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Audio', audioSchema);
