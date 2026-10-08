import Advertise from '../models/Advertise.js';

// ─── Public: Submit a new inquiry ──────────────────────────
export const createInquiry = async (req, res) => {
  try {
    const { name, email, phone, company, budget, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and message are required.',
      });
    }

    const inquiry = new Advertise({
      name,
      email,
      phone: phone || '',
      company: company || '',
      budget: budget || '',
      message,
    });

    await inquiry.save();

    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully.',
    });
  } catch (error) {
    console.error('Create inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
};

// ─── Admin: Get all inquiries (with pagination & filtering) ─
export const getAllInquiries = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const inquiries = await Advertise.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Advertise.countDocuments(filter);

    res.json({
      success: true,
      data: inquiries,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get all inquiries error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Admin: Get a single inquiry by ID ──────────────────────
export const getInquiryById = async (req, res) => {
  try {
    const inquiry = await Advertise.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }
    res.json({ success: true, data: inquiry });
  } catch (error) {
    console.error('Get inquiry error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Admin: Update inquiry status ──────────────────────────
export const updateInquiryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !['new', 'read', 'contacted', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const inquiry = await Advertise.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }
    res.json({ success: true, data: inquiry });
  } catch (error) {
    console.error('Update inquiry status error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── Admin: Delete an inquiry ──────────────────────────────
export const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Advertise.findByIdAndDelete(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }
    res.json({ success: true, message: 'Inquiry deleted successfully.' });
  } catch (error) {
    console.error('Delete inquiry error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};