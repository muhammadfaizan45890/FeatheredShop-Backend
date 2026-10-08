import mongoose from 'mongoose';

const HeroSlideSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    image: {
      type: String,
      required: [true, 'Image URL is required'],
    },
    category: {
      type: String,
      trim: true,
      default: 'Featured',
    },
    buttonText: {
      type: String,
      trim: true,
      default: 'Read More',
    },
    alt: {
      type: String,
      trim: true,
    },
    link: {
      type: String,
      trim: true,
      default: '/news',
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for sorting
HeroSlideSchema.index({ order: 1 });

export const HeroSlide = mongoose.model('HeroSlide', HeroSlideSchema);