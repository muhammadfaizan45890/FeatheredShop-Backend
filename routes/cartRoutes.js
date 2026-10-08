import express from "express";
import * as authModule from "../middleware/isAuthenticated.js";
import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  mergeCart,
  validateCart,
} from "../controllers/cartController.js";

const router = express.Router();

/* Accept either export style:
   - export default isAuthenticated
   - export const isAuthenticated
   - export { isAuthenticated }
   - module.exports = isAuthenticated (converted) */
const auth =
  authModule.default ||
  authModule.isAuthenticated ||
  authModule.auth ||
  authModule.protect ||
  null;

if (typeof auth !== "function") {
  throw new Error(
    "[cartRoutes] Could not find an auth middleware export in " +
      "../middleware/isAuthenticated.js — expected one of: default, isAuthenticated, auth, protect"
  );
}

/* Every cart route requires a logged-in user */
router.use(auth);

router.get("/", getCart);
router.delete("/", clearCart);

router.post("/items", addItem);
router.patch("/items/:itemId", updateItem);
router.delete("/items/:itemId", removeItem);

router.post("/merge", mergeCart);
router.post("/validate", validateCart);

export default router;