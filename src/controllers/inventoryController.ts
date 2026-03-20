import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import inventoryService from "../services/inventoryService.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createInternalClient } from "../utils/http.js";
import { config } from "../config/index.js";

class InventoryController {
  private shopClient = createInternalClient(
    config.services.shop || "http://localhost:3004",
  );

  /* =======================
     CREATE INVENTORY
  ======================= */

  addInventoryItem = asyncHandler(async (req: AuthRequest, res: Response) => {
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

  /* =======================
     GET SHOP INVENTORY
  ======================= */

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
        { items: populated, pagination },
        "Shop inventory fetched successfully",
      ),
    );
  });

  /* =======================
     GET SINGLE INVENTORY
  ======================= */

  getInventoryItem = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const inventory = await inventoryService.getInventoryById(id);

    if (!inventory) {
      throw new ApiError(404, "Inventory not found");
    }

    const populated = await inventoryService.populateInventoryWithProduct(id);

    res.json(
      new ApiResponse(200, populated, "Inventory item fetched successfully"),
    );
  });

  updateStock = asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { type, packs, orderId, referenceId } = req.body;

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const inventory = await inventoryService.getInventoryById(id);
    if (!inventory) {
      throw new ApiError(404, "Inventory not found");
    }

    const { data } = await this.shopClient.get(
      `/api/v1/internal/shops/verify-owner/${req.user.id}/${inventory.shopId}`,
    );
    const isOwner = data.isOwner;

    if (!isOwner) {
      throw new ApiError(403, "Unauthorized: You do not own this shop");
    }

    switch (type) {
      case "inward":
        await inventoryService.addInwardStock(
          inventory.id,
          packs,
          req.user.id,
          referenceId,
        );
        break;

      case "reserve":
        await inventoryService.reserveStock(
          inventory.id,
          packs,
          req.user.id,
          orderId,
        );
        break;

      case "release":
        await inventoryService.releaseReservedStock(
          inventory.id,
          packs,
          req.user.id,
          orderId,
        );
        break;

      case "deduct":
        await inventoryService.deductStock(
          inventory.id,
          packs,
          req.user.id,
          orderId,
        );
        break;

      case "damage":
      case "expiry_removal":
      case "audit_adjustment":
      case "return_to_supplier":
      case "manual_addition":
        await inventoryService.adjustStock(
          inventory.id,
          packs,
          req.user.id,
          type.toUpperCase() as any,
          req.body.reason,
          referenceId,
        );
        break;

      default:
        throw new ApiError(400, "Invalid stock operation type");
    }

    const updatedInventory = await inventoryService.getInventoryById(id);

    res.json(
      new ApiResponse(200, updatedInventory, "Stock updated successfully"),
    );
  });

  /* =======================
     INVENTORY ALERTS
  ======================= */

  getInventoryAlerts = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.params.shopId as string;
    const lowStock = await (inventoryService as any).findLowStockItems(shopId);
    const expiring = await (inventoryService as any).findExpiringItems(
      shopId,
      30,
    );

    res.json(
      new ApiResponse(
        200,
        { lowStock, expiring },
        "Inventory alerts fetched successfully",
      ),
    );
  });

  /* =======================
     SEARCH INVENTORY
  ======================= */

  searchInventory = asyncHandler(async (req: Request, res: Response) => {
    const result = await inventoryService.searchInventories(req.body);
    res.json(new ApiResponse(200, result, "Inventory search successful"));
  });

  /* =======================
     INVENTORY STATS
  ======================= */

  getInventoryStats = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.params.shopId as string;
    const stats = await inventoryService.getInventoryStats(shopId);
    res.json(
      new ApiResponse(200, stats, "Inventory stats fetched successfully"),
    );
  });

  /* =======================
     GET INVENTORY BY PRODUCT
  ======================= */

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

  /* =======================
     MANAGEMENT OPERATIONS
  ======================= */

  auditStock = asyncHandler(async (req: AuthRequest, res: Response) => {
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

  getExpiryReport = asyncHandler(async (req: Request, res: Response) => {
    const { shopId } = req.params;
    const { days = "30" } = req.query;

    const items = await inventoryService.getExpiryReport(
      shopId as string,
      parseInt(days as string),
    );
    res.json(new ApiResponse(200, items, "Expiry report fetched successfully"));
  });

  getLowStockReport = asyncHandler(async (req: Request, res: Response) => {
    const { shopId } = req.params;
    const items = await inventoryService.getLowStockReport(shopId as string);
    res.json(
      new ApiResponse(200, items, "Low stock report fetched successfully"),
    );
  });

  getInventoryValuation = asyncHandler(async (req: Request, res: Response) => {
    const { shopId } = req.params;
    const valuation = await inventoryService.getInventoryValuation(
      shopId as string,
    );
    res.json(
      new ApiResponse(
        200,
        valuation,
        "Inventory valuation fetched successfully",
      ),
    );
  });
}

const inventoryController = new InventoryController();
export default inventoryController;
