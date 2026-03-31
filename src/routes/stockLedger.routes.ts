import stockLedgerController from "../controllers/stockLedgerController.js";
import { Router } from "express";
import { protect } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(protect);

router.get(
  "/inventory/:inventoryId",
  stockLedgerController.getLedgerByInventoryId,
);

router.get("/stock-history/:shopId", stockLedgerController.getStockHistory);

export default router;
