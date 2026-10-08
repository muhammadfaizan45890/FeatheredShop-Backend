import Audio from '../models/Audio.js';

// ─── Public: Get all active audio (paginated) ───────────
export const getAudioList = async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    const [data, total] = await Promise.all([
      Audio.find(query).sort({ publishedAt: -1 }).skip(skip).limit(Number(limit)),
      Audio.countDocuments(query),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get audio list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Public: Get single audio by ID ────────────────────
export const getAudioById = async (req, res) => {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({ success: false, message: 'Audio not found' });
    }
    res.json({ success: true, data: audio });
  } catch (error) {
    console.error('Get audio error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Get all audio (with filters) ──────────────
export const getAllAudioAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Audio.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Audio.countDocuments(),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get all audio admin error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Create audio ──────────────────────────────
export const createAudio = async (req, res) => {
  try {
    const { title, description, embedCode, coverImage, duration, author, isActive, publishedAt } = req.body;

    if (!title || !embedCode) {
      return res.status(400).json({ success: false, message: 'Title and embed code are required' });
    }

    const audio = new Audio({
      title,
      description,
      embedCode,
      coverImage: coverImage || '',
      duration: duration || '',
      author: author || 'Feathered Pen',
      isActive: isActive !== undefined ? isActive : true,
      publishedAt: publishedAt || Date.now(),
    });

    await audio.save();
    res.status(201).json({ success: true, data: audio });
  } catch (error) {
    console.error('Create audio error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Update audio ──────────────────────────────
export const updateAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const audio = await Audio.findById(id);
    if (!audio) {
      return res.status(404).json({ success: false, message: 'Audio not found' });
    }

    Object.assign(audio, updates);
    await audio.save();

    res.json({ success: true, data: audio });
  } catch (error) {
    console.error('Update audio error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Delete audio ──────────────────────────────
export const deleteAudio = async (req, res) => {
  try {
    const { id } = req.params;
    const audio = await Audio.findByIdAndDelete(id);
    if (!audio) {
      return res.status(404).json({ success: false, message: 'Audio not found' });
    }
    res.json({ success: true, message: 'Audio deleted successfully' });
  } catch (error) {
    console.error('Delete audio error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
