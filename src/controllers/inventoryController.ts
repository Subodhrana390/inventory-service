import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import inventoryService from "../services/inventoryService.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createInternalClient } from "../utils/http.js";
import { config } from "../config/index.js";
import { LedgerEntryType } from "../types/inventory.js";
import InventoryModel from "../models/inventory.schema.js";

class InventoryController {
  private shopClient = createInternalClient(
    config.services.shop || "http://localhost:3004",
  );

  addInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const inventory = await inventoryService.createInventory({
      ...req.body,
      createdBy: req.user?.id || uuidv4(),
      updatedBy: req.user?.id || uuidv4(),
    });

    res
      .status(201)
      .json(
        new ApiResponse(201, inventory, "Inventory item created successfully"),
      );
  });

  getShopInventory = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.params.shopId as string;
    const { limit = "20", cursor } = req.query;

    const pageSize = parseInt(limit as string);

    const { items, pagination } = await inventoryService.listInventories(
      { shopId },
      pageSize,
      cursor as string,
    );

    const populated =
      await inventoryService.populateInventoryWithProducts(items);

    res.json(
      new ApiResponse(
        200,
        populated,
        "Shop inventory fetched successfully",
      ),
    );
  });

  getInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const inventory = await inventoryService.getInventoryById(id);

    if (!inventory) {
      throw new ApiError(404, "Inventory not found");
    }

    const populated =
      await inventoryService.populateInventoryWithProduct(inventory);

    res.json(
      new ApiResponse(200, populated, "Inventory item fetched successfully"),
    );
  });

  updateInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      pricing,
      alerts,
    } = req.body as {
      pricing?: {
        costPricePerPack?: number;
        mrpPerPack?: number;
        salePricePerPack?: number;
        gstPercent?: number;
        discountPercentage?: number;
      };
      alerts?: {
        lowStockThreshold?: number;
        expiryAlertDays?: number;
      };
    };

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const updatePayload: any = {
      updatedBy: req.user.id,
      lastStockUpdate: new Date(),
    };

    if (pricing) {
      if (pricing.costPricePerPack !== undefined)
        updatePayload["pricing.costPricePerPack"] = pricing.costPricePerPack;
      if (pricing.mrpPerPack !== undefined)
        updatePayload["pricing.mrpPerPack"] = pricing.mrpPerPack;
      if (pricing.salePricePerPack !== undefined)
        updatePayload["pricing.salePricePerPack"] = pricing.salePricePerPack;
      if (pricing.gstPercent !== undefined)
        updatePayload["pricing.gstPercent"] = pricing.gstPercent;
      if (pricing.discountPercentage !== undefined)
        updatePayload["pricing.discountPercentage"] = pricing.discountPercentage;
    }

    if (alerts) {
      if (alerts.lowStockThreshold !== undefined)
        updatePayload["alerts.lowStockThreshold"] = alerts.lowStockThreshold;
      if (alerts.expiryAlertDays !== undefined)
        updatePayload["alerts.expiryAlertDays"] = alerts.expiryAlertDays;
    }

    const updatedItem = await InventoryModel.findOneAndUpdate(
      { id },
      { $set: updatePayload },
      { new: true, runValidators: true },
    );

    if (!updatedItem) {
      res
        .status(404)
        .json(new ApiResponse(404, null, "Inventory item not found"));
      return;
    }

    res.json(
      new ApiResponse(
        200,
        updatedItem,
        "Inventory details updated successfully",
      ),
    );
  });

  updateStock = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { stockAdjustmentType, packs } = req.body;

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    if (!stockAdjustmentType || !packs) {
      throw new ApiError(400, "StockAdjustmentType and packs are required");
    }

    if (!Object.values(LedgerEntryType).includes(stockAdjustmentType)) {
      throw new ApiError(400, "Invalid stock adjustment type");
    }

    const inventory = await inventoryService.getInventoryById(id);

    if (!inventory) {
      throw new ApiError(404, "Inventory not found");
    }

    const { data } = await this.shopClient.get(
      `/api/v1/internal/shops/verify-owner/${req.user.id}/${inventory.shopId}`,
    );

    if (!data?.isOwner) {
      throw new ApiError(403, "Unauthorized: You do not own this shop");
    }

    let reason = "";

    switch (stockAdjustmentType) {
      case LedgerEntryType.DAMAGE:
        reason = `${packs} packs of ${inventory.productId} were damaged`;
        break;

      case LedgerEntryType.AUDIT_ADJUSTMENT:
        reason = `${packs} packs of ${inventory.productId} were adjusted`;
        break;

      case LedgerEntryType.MANUAL_ADDITION:
        reason = `${packs} packs of ${inventory.productId} were added`;
        break;

      default:
        throw new ApiError(400, "Unsupported adjustment type");
    }

    const updatedInventory = await inventoryService.adjustStock(
      inventory.id,
      packs,
      req.user.id,
      stockAdjustmentType,
      reason,
    );

    return res.json(
      new ApiResponse(200, updatedInventory, "Stock updated successfully"),
    );
  });

  searchInventory = asyncHandler(async (req: Request, res: Response) => {
    const result = await inventoryService.searchInventories(req.body);
    res.json(new ApiResponse(200, result, "Inventory search successful"));
  });

  getSingleInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const { shopId, productId } = req.body;

    if (!shopId || !productId) {
      throw new ApiError(
        400,
        "cartItemId with shopId and productId is required",
      );
    }

    const inventoryItem = await inventoryService.getInventoryItem({
      shopId,
      productId,
    });

    if (!inventoryItem) {
      throw new ApiError(404, "Inventory item not found");
    }

    const populated =
      await inventoryService.populateInventoryWithProduct(inventoryItem);

    res.json(
      new ApiResponse(200, populated, "Inventory item fetched successfully"),
    );
  });

  getBulkInventoryItems = asyncHandler(async (req: Request, res: Response) => {
    const { cartItemsIds } = req.body;

    if (!cartItemsIds?.length) {
      throw new ApiError(400, "cartItemIds is required");
    }

    const inventoryItems =
      await inventoryService.getInventoryItemsByCart(cartItemsIds);

    if (!inventoryItems.length) {
      throw new ApiError(404, "Inventory items not found");
    }

    const populated =
      await inventoryService.populateInventoryWithProducts(inventoryItems);

    res.json(
      new ApiResponse(200, populated, "Inventory items fetched successfully"),
    );
  });

  getPrices = asyncHandler(async (req: Request, res: Response) => {
    const { items } = req.body;

    if (!items?.length) {
      throw new ApiError(
        400,
        "Items array with {shopId, productId} is required",
      );
    }

    const inventoryItems =
      await inventoryService.getInventoryItemsByCart(items);

    const prices = inventoryItems.map((item) => ({
      productId: item.productId,
      shopId: item.shopId,
      price: item.pricing.salePricePerPack,
    }));

    res.json(
      new ApiResponse(200, prices, "Product prices fetched successfully"),
    );
  });

  auditStock = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { physicalPacks } = req.body;

    if (!req.user) throw new ApiError(401, "Unauthorized");

    const inventory = await inventoryService.getInventoryById(id);
    if (!inventory) throw new ApiError(404, "Inventory not found");

    const { data } = await this.shopClient.get(
      `/api/v1/internal/shops/verify-owner/${req.user.id}/${inventory.shopId}`,
    );
    if (!data.isOwner) {
      throw new ApiError(403, "Unauthorized: You do not own this shop");
    }

    const updated = await inventoryService.auditStock(
      id,
      physicalPacks,
      req.user.id,
    );

    res.json(
      new ApiResponse(200, updated, "Stock audit completed successfully"),
    );
  });

  getInventoryReport = asyncHandler(async (req: Request, res: Response) => {
    const { shopId } = req.params as { shopId: string };
    const { days = "30" } = req.query;
    const daysNum = Number(days);

    const [statsResult, lowStock, expiring] = await Promise.all([
      InventoryModel.aggregate([
        { $match: { shopId } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            totalValue: {
              $sum: {
                $multiply: [
                  {
                    $divide: [
                      { $ifNull: ["$stock.totalBaseUnits", 0] },
                      { $ifNull: ["$packaging.unitsPerPack", 1] },
                    ],
                  },
                  { $ifNull: ["$pricing.costPricePerPack", 0] },
                ],
              },
            },
            outOfStockCount: {
              $sum: { $cond: [{ $lte: ["$stock.totalBaseUnits", 0] }, 1, 0] },
            },
          },
        },
        { $project: { _id: 0 } },
      ]),
      inventoryService.getLowStockReport(shopId),
      inventoryService.getExpiryReport(shopId, daysNum),
    ]);

    const baseStats = statsResult[0] || {
      totalItems: 0,
      totalValue: 0,
      outOfStockCount: 0,
    };

    res.json(
      new ApiResponse(
        200,
        {
          stats: {
            ...baseStats,
            lowStockCount: lowStock.length,
            expiringCount: expiring.length,
          },
          lowStock,
          expiring,
        },
        "Full inventory report generated successfully",
      ),
    );
  });
}

const inventoryController = new InventoryController();
export default inventoryController;
