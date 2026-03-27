import { Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import stockLedgerService from "../services/stockLedgerService.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

class StockLedgerController {
  getLedgerByInventory = asyncHandler(
    async (req: AuthRequest, res: Response) => {
      const inventoryId = req.params.inventoryId as string;
      const { limit = 50, offset = 0 } = req.query;

      if (!req.user) {
        throw new ApiError(401, "Unauthorized");
      }

      const ledger = await stockLedgerService.getByInventory(
        inventoryId,
        Number(limit),
        Number(offset),
      );

      res.json(new ApiResponse(200, ledger, "Ledger fetched successfully"));
    },
  );

  getLedgerByShop = asyncHandler(async (req: AuthRequest, res: Response) => {
    // const shopId = req.params.shopId as string;
    const shopId = "c9b1c2a4-4f6e-4a6c-9b1e-2e3b9b8f7c10" as string;
    const { limit = 50, offset = 0 } = req.query;

    // if (!req.user) {
    //   throw new ApiError(401, "Unauthorized");
    // }

    // const isOwner = await shopService.verifyShopOwner(req.user.id, shopId);

    // if (!isOwner) {
    //   throw new ApiError(403, "Unauthorized: You do not own this shop");
    // }

    const ledger = await stockLedgerService.getByShop(
      shopId,
      Number(limit),
      Number(offset),
    );

    res.json(new ApiResponse(200, ledger, "Shop ledger fetched successfully"));
  });

  getLedgerByOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const orderId = req.params.orderId as string;

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const ledger = await stockLedgerService.getByOrder(orderId);

    res.json(new ApiResponse(200, ledger, "Order ledger fetched successfully"));
  });

  getLedgerByReference = asyncHandler(
    async (req: AuthRequest, res: Response) => {
      const referenceId = req.params.referenceId as string;

      if (!req.user) {
        throw new ApiError(401, "Unauthorized");
      }

      const ledger = await stockLedgerService.getByReference(referenceId);

      res.json(new ApiResponse(200, ledger, "Reference ledger fetched successfully"));
    },
  );

  getMovementSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
    const inventoryId = req.params.inventoryId as string;
    const { fromDate, toDate } = req.query;

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const summary = await stockLedgerService.getMovementSummary(
      inventoryId,
      fromDate ? new Date(fromDate as string) : undefined,
      toDate ? new Date(toDate as string) : undefined,
    );

    res.json(new ApiResponse(200, summary, "Movement summary fetched successfully"));
  });
}

const stockLedgerController = new StockLedgerController();
export default stockLedgerController;
