import mongoose from 'mongoose';

const adSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: [true, 'Ad image URL is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Ad title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    ctaText: {
      type: String,
      required: [true, 'CTA button text is required'],
      trim: true,
      default: 'Learn More',
    },
    ctaLink: {
      type: String,
      required: [true, 'CTA link is required'],
      trim: true,
      default: '/advertise',
    },
    slot: {
      type: String,
      enum: ['top', 'middle', 'bottom'],
      required: [true, 'Slot is required'],
      default: 'top',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Ensures only one active ad per slot (optional but helpful)
adSchema.index({ slot: 1, isActive: 1 }, { unique: true });

export default mongoose.model('Ad', adSchema);
