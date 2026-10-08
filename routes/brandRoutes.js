import express from "express";
import {
  listBrands,
  getBrand,
  getBrandLetters,
  listBrandsAdmin,
  createBrand,
  updateBrand,
  toggleFeatured,
  toggleActive,
  reorderBrands,
  deleteBrand,
  bulkCreateBrands,
  uploadBrandLogoHandler,
} from "../controllers/brandController.js";
import { isAuthenticated, isAdmin } from "../middleware/isAuthenticated.js";
import uploadBrandLogo from "../middleware/uploadBrandLogo.js";

const router = express.Router();

/* ════════════════════════════════════════════════════════════
   PUBLIC
   ════════════════════════════════════════════════════════════ */

/* Static paths before /:id */
router.get("/meta/letters", getBrandLetters);

/* Admin list (auth) — put this above /:id too */
router.get("/admin", isAuthenticated, isAdmin, listBrandsAdmin);

/* Catalog */
router.get("/", listBrands);
router.get("/:id", getBrand);

/* ════════════════════════════════════════════════════════════
   ADMIN — writes
   ════════════════════════════════════════════════════════════ */

/* Logo upload — accepts either an id or returns a URL */
router.post(
  "/logo",
  isAuthenticated,
  isAdmin,
  uploadBrandLogo.single("logo"),
  uploadBrandLogoHandler
);

/* Bulk import */
router.post("/bulk", isAuthenticated, isAdmin, bulkCreateBrands);

/* Reorder — must be above /:id */
router.patch("/reorder", isAuthenticated, isAdmin, reorderBrands);

/* Create */
router.post("/", isAuthenticated, isAdmin, createBrand);

/* Update */
router.patch("/:id", isAuthenticated, isAdmin, updateBrand);
router.put("/:id", isAuthenticated, isAdmin, updateBrand);

/* Toggles */
router.patch("/:id/toggle-featured", isAuthenticated, isAdmin, toggleFeatured);
router.patch("/:id/toggle-active", isAuthenticated, isAdmin, toggleActive);

/* Attach logo to a specific brand */
router.post(
  "/:id/logo",
  isAuthenticated,
  isAdmin,
  uploadBrandLogo.single("logo"),
  uploadBrandLogoHandler
);

/* Delete */
router.delete("/:id", isAuthenticated, isAdmin, deleteBrand);

export default router;