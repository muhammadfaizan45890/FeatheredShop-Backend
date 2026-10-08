import express from "express";
import {
  getAllUsers,
  deleteUser,
  getDashboardStats,
} from "../controllers/AdminController.js";

const router = express.Router();

// ================= USERS =================
router.get("/users", getAllUsers);
router.delete("/user/:id", deleteUser);

// ================= DASHBOARD =================
router.get("/dashboard", getDashboardStats);

export default router;
