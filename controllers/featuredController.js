import Featured from '../models/Featured.js';
import { Post } from '../models/Post.js';

// ─── Public: Get active featured stories ──────────────
export const getFeatured = async (req, res) => {
  try {
    const featured = await Featured.find({ isActive: true })
      .sort({ order: 1 })
      .populate({
        path: 'post',
        select: 'title excerpt category images author date readTime slug', // ✅ already includes slug
        populate: { path: 'author', select: 'name' },
      });

    const posts = featured.map((item) => {
      const p = item.post;
      return {
        id: p._id,
        slug: p.slug,                     // ✅ ADD THIS LINE
        title: p.title,
        excerpt: p.excerpt || p.content?.substring(0, 120) || '',
        category: p.category,
        image: p.images?.[0] || '',
        author: { name: p.author?.name || 'Unknown' },
        date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
        readTime: p.readTime || '3 min read',
      };
    });

    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('Get featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Get all featured (including inactive) ────
export const getAllFeatured = async (req, res) => {
  try {
    const featured = await Featured.find()
      .sort({ order: 1 })
      .populate({
        path: 'post',
        select: 'title category images slug',
      });
    res.json({ success: true, data: featured });
  } catch (error) {
    console.error('Get all featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Create new featured ──────────────────────
export const createFeatured = async (req, res) => {
  try {
    const { postId, order } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, message: 'Post ID is required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existing = await Featured.findOne({ post: postId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Post is already featured' });
    }

    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const last = await Featured.findOne().sort({ order: -1 });
      finalOrder = last ? last.order + 1 : 0;
    }

    const featured = new Featured({
      post: postId,
      order: finalOrder,
      isActive: true,
    });
    await featured.save();

    const populated = await featured.populate('post', 'title category images slug');
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error('Create featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Update featured (order / active status) ──
export const updateFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const { order, isActive } = req.body;

    const featured = await Featured.findById(id);
    if (!featured) {
      return res.status(404).json({ success: false, message: 'Featured entry not found' });
    }

    if (order !== undefined) featured.order = order;
    if (isActive !== undefined) featured.isActive = isActive;

    await featured.save();
    await featured.populate('post', 'title category images slug');

    res.json({ success: true, data: featured });
  } catch (error) {
    console.error('Update featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Delete featured ──────────────────────────
export const deleteFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const featured = await Featured.findByIdAndDelete(id);
    if (!featured) {
      return res.status(404).json({ success: false, message: 'Featured entry not found' });
    }
    res.json({ success: true, message: 'Featured entry deleted' });
  } catch (error) {
    console.error('Delete featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Admin: Reorder featured entries ──────────────────
export const reorderFeatured = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items must be an array' });
    }

    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { order: item.order } },
      },
    }));

    await Featured.bulkWrite(bulkOps);
    res.json({ success: true, message: 'Reorder successful' });
  } catch (error) {
    console.error('Reorder featured error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
