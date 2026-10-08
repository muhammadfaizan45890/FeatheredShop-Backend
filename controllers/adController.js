import Ad from '../models/Ad.js';

// ─── Public: get current active ad for a given slot ──────
export const getCurrentAd = async (req, res) => {
  try {
    const { slot } = req.query;
    const filter = { isActive: true };
    if (slot) filter.slot = slot;

    const ad = await Ad.findOne(filter).sort({ updatedAt: -1 }).lean();

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: slot
          ? `No active ad found for slot: ${slot}`
          : 'No active ad found',
      });
    }

    res.status(200).json({
      success: true,
      data: ad,
    });
  } catch (error) {
    console.error('Error fetching current ad:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ad',
    });
  }
};

// ─── Admin: get all ads ────────────────────────────────────
export const getAllAds = async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({
      success: true,
      count: ads.length,
      data: ads,
    });
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ads',
    });
  }
};

// ─── Admin: get single ad ──────────────────────────────────
export const getAdById = async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id).lean();
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found',
      });
    }
    res.status(200).json({
      success: true,
      data: ad,
    });
  } catch (error) {
    console.error('Error fetching ad:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ad',
    });
  }
};

// ─── Admin: create new ad ──────────────────────────────────
export const createAd = async (req, res) => {
  try {
    const { image, title, ctaText, ctaLink, slot, isActive } = req.body;

    if (!image || !title) {
      return res.status(400).json({
        success: false,
        message: 'Image and title are required',
      });
    }

    if (!slot || !['top', 'middle', 'bottom'].includes(slot)) {
      return res.status(400).json({
        success: false,
        message: 'Valid slot (top, middle, bottom) is required',
      });
    }

    // If new ad is active, deactivate any existing active ad for the same slot
    if (isActive !== false) {
      const existing = await Ad.findOne({ slot, isActive: true });
      if (existing) {
        await Ad.updateOne({ _id: existing._id }, { isActive: false });
      }
    }

    const newAd = await Ad.create({
      image,
      title,
      ctaText: ctaText || 'Learn More',
      ctaLink: ctaLink || '/advertise',
      slot,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      data: newAd,
    });
  } catch (error) {
    console.error('Error creating ad:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating ad',
    });
  }
};

// ─── Admin: update ad ──────────────────────────────────────
export const updateAd = async (req, res) => {
  try {
    const { image, title, ctaText, ctaLink, slot, isActive } = req.body;
    const ad = await Ad.findById(req.params.id);

    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found',
      });
    }

    // If slot is being changed and the new ad will be active, deactivate any conflicting active ad
    if (slot && slot !== ad.slot && isActive !== false) {
      const existing = await Ad.findOne({ slot, isActive: true, _id: { $ne: ad._id } });
      if (existing) {
        await Ad.updateOne({ _id: existing._id }, { isActive: false });
      }
    }

    if (image !== undefined) ad.image = image;
    if (title !== undefined) ad.title = title;
    if (ctaText !== undefined) ad.ctaText = ctaText;
    if (ctaLink !== undefined) ad.ctaLink = ctaLink;
    if (slot !== undefined) {
      if (!['top', 'middle', 'bottom'].includes(slot)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid slot value',
        });
      }
      ad.slot = slot;
    }
    if (isActive !== undefined) ad.isActive = isActive;

    await ad.save();

    res.status(200).json({
      success: true,
      data: ad,
    });
  } catch (error) {
    console.error('Error updating ad:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating ad',
    });
  }
};

// ─── Admin: delete ad ──────────────────────────────────────
export const deleteAd = async (req, res) => {
  try {
    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({
        success: false,
        message: 'Ad not found',
      });
    }
    await ad.deleteOne();
    res.status(200).json({
      success: true,
      message: 'Ad deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting ad:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting ad',
    });
  }
};
