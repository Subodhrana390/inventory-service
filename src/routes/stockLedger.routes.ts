import stockLedgerController from "../controllers/stockLedgerController.js";
import { Router } from "express";
import { protect } from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/inventory/:inventoryId",
  stockLedgerController.getLedgerByInventory,
);

router.get("/shop/:shopId", stockLedgerController.getLedgerByShop);

router.get("/order/:orderId", protect, stockLedgerController.getLedgerByOrder);

router.get(
  "/reference/:referenceId",
  protect,
  stockLedgerController.getLedgerByReference,
);

router.get(
  "/inventory/:inventoryId/summary",
  protect,
  stockLedgerController.getMovementSummary,
);

export default router;
