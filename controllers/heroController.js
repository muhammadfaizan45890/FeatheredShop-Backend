import { HeroSlide } from '../models/HeroSlide.js';

// ─── Get active slides (public) ──────────────────────
export const getHeroSlides = async (req, res) => {
  try {
    const slides = await HeroSlide.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, data: slides });
  } catch (error) {
    console.error('Error fetching hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hero slides' });
  }
};

// ─── Get all slides (admin) ──────────────────────────
export const getAllSlides = async (req, res) => {
  try {
    const slides = await HeroSlide.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: slides });
  } catch (error) {
    console.error('Error fetching all hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch hero slides' });
  }
};

// ─── Create slide (admin) ─────────────────────────────
export const createHeroSlide = async (req, res) => {
  try {
    const { title, description, image, category, buttonText, alt, link, order, isActive } = req.body;

    if (!title || !image) {
      return res.status(400).json({ success: false, message: 'Title and image are required' });
    }

    let newOrder = order;
    if (newOrder === undefined || newOrder === null) {
      const count = await HeroSlide.countDocuments();
      newOrder = count;
    }

    const slide = new HeroSlide({
      title,
      description,
      image,
      category,
      buttonText,
      alt,
      link,
      order: newOrder,
      isActive: isActive !== undefined ? isActive : true,
    });

    await slide.save();
    res.status(201).json({ success: true, data: slide });
  } catch (error) {
    console.error('Error creating hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to create hero slide', error: error.message });
  }
};

// ─── Update slide (admin) ─────────────────────────────
export const updateHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const allowed = ['title', 'description', 'image', 'category', 'buttonText', 'alt', 'link', 'order', 'isActive'];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const slide = await HeroSlide.findByIdAndUpdate(id, filtered, { new: true, runValidators: true });
    if (!slide) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }
    res.json({ success: true, data: slide });
  } catch (error) {
    console.error('Error updating hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to update hero slide', error: error.message });
  }
};

// ─── Delete slide (admin) ─────────────────────────────
export const deleteHeroSlide = async (req, res) => {
  try {
    const { id } = req.params;
    const slide = await HeroSlide.findById(id);
    if (!slide) {
      return res.status(404).json({ success: false, message: 'Slide not found' });
    }
    await slide.deleteOne();
    res.json({ success: true, message: 'Slide deleted successfully' });
  } catch (error) {
    console.error('Error deleting hero slide:', error);
    res.status(500).json({ success: false, message: 'Failed to delete hero slide', error: error.message });
  }
};

// ─── Reorder slides (admin) ───────────────────────────
export const reorderSlides = async (req, res) => {
  try {
    const { orderMap } = req.body;
    if (!Array.isArray(orderMap)) {
      return res.status(400).json({ success: false, message: 'orderMap must be an array' });
    }
    const bulkOps = orderMap.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: item.order } },
      },
    }));
    await HeroSlide.bulkWrite(bulkOps);
    const slides = await HeroSlide.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: slides });
  } catch (error) {
    console.error('Error reordering hero slides:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder slides', error: error.message });
  }
};