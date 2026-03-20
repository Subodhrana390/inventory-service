import express from "express";
import inventoryController from "../controllers/inventoryController.js";
import {
  protect,
  requireShopOwner,
  requireShopOwnership,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

/* =======================
   OWNER ROUTES (PROTECTED)
======================= */

router.post("/", inventoryController.addInventoryItem);

router.patch(
  "/:id/stock",
  protect as any,
  requireShopOwner as any,
  inventoryController.updateStock,
);

router.get(
  "/shop/:shopId/alerts",
  protect as any,
  requireShopOwner as any,
  requireShopOwnership as any,
  inventoryController.getInventoryAlerts,
);

router.get("/shop/:shopId/stats", inventoryController.getInventoryStats);

router.post(
  "/:id/audit",
  protect as any,
  requireShopOwner as any,
  inventoryController.auditStock,
);

router.get(
  "/shop/:shopId/expiry-report",
  protect as any,
  requireShopOwner as any,
  requireShopOwnership as any,
  inventoryController.getExpiryReport,
);

router.get(
  "/shop/:shopId/low-stock-report",
  protect as any,
  requireShopOwner as any,
  requireShopOwnership as any,
  inventoryController.getLowStockReport,
);

router.get(
  "/shop/:shopId/valuation",
  protect as any,
  requireShopOwner as any,
  requireShopOwnership as any,
  inventoryController.getInventoryValuation,
);

/* =======================
   PUBLIC / CATALOG ROUTES
======================= */

router.get("/search", inventoryController.searchInventory);

router.get("/shop/:shopId", inventoryController.getShopInventory);

router.get("/:id", inventoryController.getInventoryItem);

export default router;
