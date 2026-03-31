import express from "express";
import inventoryController from "../controllers/inventoryController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/search", inventoryController.searchInventory);
router.get("/shop/:shopId", inventoryController.getShopInventory);
router.get("/:id/item", inventoryController.getInventoryItem);

router.use(protect);
router.post("/", inventoryController.addInventoryItem);
router.patch("/:id/stock", inventoryController.updateStock);
router.patch("/:id/details", inventoryController.updateInventoryItem);
router.get("/shop/:shopId/reports", inventoryController.getInventoryReport);

export default router;
