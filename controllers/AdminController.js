import { User } from "../models/userModel.js";
// import Enrollment from "../models/Enrollment.js"
// ================= USERS =================

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin cannot be deleted" });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const users = await User.find();

    res.json({
      totalUsers: users.length,
      admins: users.filter(u => u.role === "admin").length,
      normalUsers: users.filter(u => u.role === "user").length,
    });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ================= COURSES =================
