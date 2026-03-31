import express from "express";
import inventoryController from "../controllers/inventoryController.js";

const router = express.Router();

router.post("/search", inventoryController.searchInventory);
router.get("/shop/:shopId", inventoryController.getShopInventory);
router.post("/get-prices", inventoryController.getPrices);
router.post("/items/bulk", inventoryController.getBulkInventoryItems);
router.post("/items/single", inventoryController.getSingleInventoryItem);
router.get("/:id", inventoryController.getInventoryItem);
router.get("/shop/:shopId/reports", inventoryController.getInventoryReport);

export default router;
