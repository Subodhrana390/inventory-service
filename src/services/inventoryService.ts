import { config } from "../config/index.js";
import Inventory from "../models/inventory.schema.js";
import { IInventory, LedgerEntryType } from "../types/inventory.js";
import { ApiError } from "../utils/ApiError.js";
import { createInternalClient } from "../utils/http.js";
import { InventorySearchService } from "./inventory-search.service.js";
import stockLedgerService from "./stockLedgerService.js";

interface SearchParams {
  shopId?: string[];
  productName?: string;
  productCategory?: string;
  limit?: number;
  offset?: number;
}

class InventoryService {
  private static instance: InventoryService;
  private productClient = createInternalClient(config.services.product);
  private shopClient = createInternalClient(config.services.shop);

  public static getInstance(): InventoryService {
    if (!InventoryService.instance) {
      InventoryService.instance = new InventoryService();
    }
    return InventoryService.instance;
  }

  async createInventory(payload: Partial<IInventory>) {
    const existing = await Inventory.findOne({
      shopId: payload.shopId,
      productId: payload.productId,
      batchNumber: payload.batchNumber,
    });

    if (existing) {
      throw new ApiError(400, "Inventory already exists for this batch");
    }

    const inventory = await Inventory.create(payload);

    (async () => {
      try {
        const [productRes, shopRes] = await Promise.all([
          inventory.productCategory === "MEDICINE"
            ? this.productClient.get(
                `/api/v1/internal/products/medical-catalog/${inventory.productId}`,
              )
            : this.productClient.get(
                `/api/v1/internal/products/shop-products/${inventory.productId}`,
              ),
          this.shopClient.get(
            `/api/v1/internal/shops/details/${inventory.shopId}`,
          ),
        ]);
        const product = productRes.data.data;
        const shop = shopRes.data.data;
        if (product && shop) {
          await InventorySearchService.indexInventory(inventory, product, shop);
        }
      } catch (err) {
        console.error("❌ Failed to sync inventory to ES:", err);
      }
    })();

    if ((inventory.availablePacks ?? 0) > 0) {
      await stockLedgerService.createEntry({
        inventoryId: inventory.id!,
        shopId: inventory.shopId,
        entryType: LedgerEntryType.INWARD,
        changeInPacks: inventory.availablePacks ?? 0,
        balanceAfterPacks: inventory.availablePacks ?? 0,
        performedBy: inventory.createdBy!,
        reason: "Initial stock",
      });
    }

    return inventory;
  }

  async getInventoryById(id: string) {
    return Inventory.findOne({ id });
  }

  async getInventoryItem(query: any) {
    return Inventory.findOne(query);
  }

  async listInventories(query: any = {}, limit = 20, cursor?: string) {
    const finalQuery = { ...query };
    if (cursor) {
      finalQuery._id = { $lt: cursor };
    }

    const items = await Inventory.find(finalQuery)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = items.length > limit;
    if (hasNextPage) items.pop();

    const nextCursor = hasNextPage
      ? items[items.length - 1]._id.toString()
      : null;

    return {
      items,
      pagination: {
        nextCursor,
        limit,
        hasNextPage,
      },
    };
  }

  async updateInventory(
    inventoryId: string,
    updates: Partial<IInventory>,
    performedBy: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    delete (updates as any).stock;

    Object.assign(inventory, updates);
    inventory.updatedBy = performedBy;
    inventory.lastStockUpdate = new Date();

    return inventory.save();
  }

  async deleteInventory(inventoryId: string) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    if (inventory.stock.totalBaseUnits > 0) {
      throw new ApiError(400, "Cannot delete inventory with existing stock");
    }

    const result = await Inventory.findOneAndDelete({ id: inventoryId });

    // Remove linked product except medicine
    if (inventory.productCategory !== "MEDICINE") {
      try {
        await this.productClient.delete(
          `/api/v1/products/shop-products/${inventory.productId}`,
        );
        console.log(`🗑️ Linked shop product ${inventory.productId} deleted`);
      } catch (error: any) {
        console.error(
          `❌ Failed to delete linked product ${inventory.productId}:`,
          error.message,
        );
      }
    }

    return result;
  }

  async adjustStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
    type: LedgerEntryType,
    reason?: string,
    referenceId?: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    const units = packs * inventory.packaging.unitsPerPack;

    // Determine direction of change based on type
    const multiplier = [
      LedgerEntryType.INWARD,
      LedgerEntryType.MANUAL_ADDITION,
    ].includes(type)
      ? 1
      : -1;

    inventory.stock.totalBaseUnits += units * multiplier;

    if (inventory.stock.totalBaseUnits < 0) {
      throw new ApiError(400, "Insufficient stock for adjustment");
    }

    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      entryType: type,
      changeInPacks: packs * multiplier,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: reason || `Manual stock adjustment: ${type}`,
      referenceId,
    });

    return inventory;
  }

  async populateInventoryWithProduct(inventoryItem: any) {
    let product = null;
    if (inventoryItem.productCategory === "MEDICINE") {
      const { data } = await this.productClient.get(
        `/api/v1/internal/products/medical-catalog/${inventoryItem.productId}`,
      );
      product = data.data ?? null;
    } else {
      const { data } = await this.productClient.get(
        `/api/v1/internal/products/shop-products/${inventoryItem.productId}`,
      );
      product = data.data ?? null;
    }
    return {
      ...inventoryItem.toObject(),
      product,
    };
  }

  async populateInventoryWithProducts(inventoryItems: any) {
    const isArray = Array.isArray(inventoryItems);
    const items = isArray ? inventoryItems : [inventoryItems];

    const medicineIds = new Set<string>();
    const shopProductIds = new Set<string>();

    for (const item of items) {
      if (!item?.productId) continue;

      if (item.productCategory === "MEDICINE") {
        medicineIds.add(item.productId);
      } else {
        shopProductIds.add(item.productId);
      }
    }

    const [medicinesRes, productsRes] = await Promise.all([
      medicineIds.size
        ? this.productClient.post(
            `/api/v1/internal/products/medical-catalog/bulk`,
            { ids: [...medicineIds] },
          )
        : Promise.resolve({ data: { data: [] } }),

      shopProductIds.size
        ? this.productClient.post(
            `/api/v1/internal/products/shop-products/bulk`,
            { ids: [...shopProductIds] },
          )
        : Promise.resolve({ data: { data: [] } }),
    ]);

    const medicines = medicinesRes.data.data ?? [];
    const products = productsRes.data.data ?? [];

    const medicineMap = new Map(medicines.map((m: any) => [m.id, m]));
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    const populated = items.map((item: any) => {
      const obj = typeof item.toObject === "function" ? item.toObject() : item;
      obj.product =
        obj.productCategory === "MEDICINE"
          ? medicineMap.get(obj.productId) || null
          : productMap.get(obj.productId) || null;

      return obj;
    });

    return isArray ? populated : populated[0];
  }

  async searchInventories({
    shopId,
    productName,
    productCategory,
    limit = 50,
    offset = 0,
  }: SearchParams) {
    const query: any = {};

    const normalizedShopIds =
      typeof shopId === "string"
        ? [shopId]
        : Array.isArray(shopId)
          ? shopId
          : [];

    if (normalizedShopIds.length) {
      query.shopId = { $in: normalizedShopIds };
    }

    if (productCategory) {
      query.productCategory = productCategory;
    }

    if (productName) {
      const productIds: string[] = [];

      const { data: medRes } = await this.productClient.get(
        `/api/v1/internal/products/medical-catalog/search`,
        { params: { query: productName } },
      );
      productIds.push(...(medRes.data?.map((m: any) => m.id) ?? []));
      const { data: prodRes } = await this.productClient.get(
        `/api/v1/internal/products/shop-products/search`,
        { params: { query: productName } },
      );
      productIds.push(...(prodRes.data?.map((p: any) => p.id) ?? []));
      const uniqueProductIds = [...new Set(productIds)];

      if (!uniqueProductIds.length) {
        return { data: [], hasMore: false };
      }

      query.productId = { $in: uniqueProductIds };
    }

    query.$expr = {
      $gt: [
        {
          $floor: {
            $divide: [
              { $subtract: ["$stock.totalBaseUnits", "$stock.reservedUnits"] },
              "$packaging.unitsPerPack",
            ],
          },
        },
        0,
      ],
    };

    const items = await Inventory.find(query)
      .sort({ id: 1 })
      .skip(offset)
      .limit(limit + 1)
      .lean();

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return {
      data: await this.populateInventoryWithProducts(items),
      hasMore,
    };
  }

  async getInventoryStats(shopId: string) {
    const inventory = await Inventory.find({ shopId });

    const lowStock = await (Inventory as any).findLowStockItems(shopId);
    const expiring = await (Inventory as any).findExpiringItems(shopId, 30);

    return {
      totalItems: inventory.length,
      totalValue: inventory.reduce(
        (acc, i) =>
          acc + (i.availablePacks ?? 0) * (i.pricing?.costPricePerPack ?? 0),
        0,
      ),
      lowStockItems: lowStock.length,
      outOfStockItems: inventory.filter((i) => (i.availablePacks ?? 0) === 0)
        .length,
      expiringItems: expiring.length,
    };
  }

  async hasSufficientStock(inventoryId: string, packs: number) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    return inventory ? (inventory.availablePacks ?? 0) >= packs : false;
  }

  async reserveStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
    orderId?: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    if ((inventory.availablePacks ?? 0) < packs) {
      throw new ApiError(400, "Insufficient stock");
    }

    inventory.stock.reservedUnits += packs * inventory.packaging.unitsPerPack;

    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      orderId,
      entryType: LedgerEntryType.ORDER_ACCEPTED,
      changeInPacks: 0,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: "Stock reserved for order",
    });
  }

  async releaseReservedStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
    orderId?: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    inventory.stock.reservedUnits = Math.max(
      0,
      inventory.stock.reservedUnits - packs * inventory.packaging.unitsPerPack,
    );

    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      orderId,
      entryType: LedgerEntryType.ORDER_CANCELLED,
      changeInPacks: 0,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: "Reserved stock released",
    });
  }

  async deductStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
    orderId?: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    const units = packs * inventory.packaging.unitsPerPack;

    inventory.stock.totalBaseUnits -= units;
    inventory.stock.reservedUnits = Math.max(
      0,
      inventory.stock.reservedUnits - units,
    );

    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      orderId,
      entryType: LedgerEntryType.ORDER_DELIVERED,
      changeInPacks: -packs,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: "Order delivered",
    });
  }

  async addInwardStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
    referenceId?: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    inventory.stock.totalBaseUnits += packs * inventory.packaging.unitsPerPack;

    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      referenceId,
      entryType: LedgerEntryType.INWARD,
      changeInPacks: packs,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: "Stock inward",
    });
  }

  async getInventoryItemsByCart(
    cartItemIds: { shopId: string; productId: string }[],
  ) {
    return Inventory.find({
      $or: cartItemIds.map((item) => ({
        shopId: item.shopId,
        productId: item.productId,
      })),
    }).lean();
  }

  async reserveStockForOrder(
    orderId: string,
    items: { productId: string; quantity: number; shopId: string }[],
    performedBy: string,
  ) {
    for (const item of items) {
      const inventory = await Inventory.findOne({
        shopId: item.shopId,
        productId: item.productId,
      });

      if (!inventory) {
        throw new ApiError(
          404,
          `Inventory not found for product ${item.productId} in shop ${item.shopId}`,
        );
      }

      // Available packs check
      if ((inventory.availablePacks ?? 0) < item.quantity) {
        throw new ApiError(
          400,
          `Insufficient stock for product ${item.productId}. Required: ${item.quantity}, Available: ${inventory.availablePacks}`,
        );
      }

      // Reserve units
      const unitsToReserve = item.quantity * inventory.packaging.unitsPerPack;
      inventory.stock.reservedUnits += unitsToReserve;
      inventory.lastStockUpdate = new Date();
      await inventory.save();

      // Log to ledger
      await stockLedgerService.createEntry({
        inventoryId: inventory.id!,
        shopId: inventory.shopId,
        orderId,
        entryType: LedgerEntryType.ORDER_ACCEPTED,
        changeInPacks: 0,
        balanceAfterPacks: inventory.availablePacks ?? 0,
        performedBy,
        reason: "Stock reserved via Saga (order.created)",
      });
    }
  }

  async completeStockDeductionForOrder(
    orderId: string,
    items: { productId: string; quantity: number; shopId: string }[],
    performedBy: string,
  ) {
    for (const item of items) {
      const inventory = await Inventory.findOne({
        shopId: item.shopId,
        productId: item.productId,
      });

      if (!inventory) {
        console.warn(
          `⚠️ Inventory not found for deduction: product ${item.productId} in shop ${item.shopId}`,
        );
        continue;
      }

      const units = item.quantity * inventory.packaging.unitsPerPack;

      // Deduct from total and clear reservation
      inventory.stock.totalBaseUnits -= units;
      inventory.stock.reservedUnits = Math.max(
        0,
        inventory.stock.reservedUnits - units,
      );

      inventory.lastStockUpdate = new Date();
      await inventory.save();

      await stockLedgerService.createEntry({
        inventoryId: inventory.id!,
        shopId: inventory.shopId,
        orderId,
        entryType: LedgerEntryType.ORDER_DELIVERED,
        changeInPacks: -item.quantity,
        balanceAfterPacks: inventory.availablePacks ?? 0,
        performedBy,
        reason: "Stock deducted upon delivery confirmation",
      });
    }
  }

  async releaseStockForOrder(
    orderId: string,
    items: { productId: string; quantity: number; shopId: string }[],
    performedBy: string,
  ) {
    for (const item of items) {
      const inventory = await Inventory.findOne({
        shopId: item.shopId,
        productId: item.productId,
      });

      if (!inventory) {
        console.warn(
          `⚠️ Inventory not found for reversal: product ${item.productId} in shop ${item.shopId}`,
        );
        continue;
      }

      const unitsToRelease = item.quantity * inventory.packaging.unitsPerPack;
      inventory.stock.reservedUnits = Math.max(
        0,
        inventory.stock.reservedUnits - unitsToRelease,
      );
      inventory.lastStockUpdate = new Date();
      await inventory.save();

      await stockLedgerService.createEntry({
        inventoryId: inventory.id!,
        shopId: inventory.shopId,
        orderId,
        entryType: LedgerEntryType.ORDER_CANCELLED,
        changeInPacks: 0,
        balanceAfterPacks: inventory.availablePacks ?? 0,
        performedBy,
        reason: "Stock released via Saga (order.cancelled)",
      });
    }
  }

  async auditStock(
    inventoryId: string,
    physicalPacks: number,
    performedBy: string,
  ) {
    const inventory = await Inventory.findOne({ id: inventoryId });
    if (!inventory) throw new ApiError(404, "Inventory not found");

    const currentPacks = inventory.availablePacks ?? 0;
    const diffPacks = physicalPacks - currentPacks;

    if (diffPacks === 0) return inventory;

    const diffUnits = diffPacks * inventory.packaging.unitsPerPack;
    inventory.stock.totalBaseUnits += diffUnits;
    inventory.lastStockUpdate = new Date();
    await inventory.save();

    await stockLedgerService.createEntry({
      inventoryId,
      shopId: inventory.shopId,
      entryType: LedgerEntryType.AUDIT_ADJUSTMENT,
      changeInPacks: diffPacks,
      balanceAfterPacks: inventory.availablePacks ?? 0,
      performedBy,
      reason: `Physical audit adjustment. Expected: ${currentPacks}, Found: ${physicalPacks}`,
    });

    return inventory;
  }

  async getExpiryReport(shopId: string, days = 30) {
    return (Inventory as any).findExpiringItems(shopId, days);
  }

  async getLowStockReport(shopId: string) {
    return (Inventory as any).findLowStockItems(shopId);
  }

  async getInventoryValuation(shopId: string) {
    const inventory = await Inventory.find({ shopId });

    return inventory.reduce(
      (acc, i) => {
        const packs = i.availablePacks ?? 0;
        acc.totalCostValue += packs * i.pricing.costPricePerPack;
        acc.totalSaleValue += packs * i.pricing.salePricePerPack;
        acc.totalMrpValue += packs * i.pricing.mrpPerPack;
        return acc;
      },
      {
        totalCostValue: 0,
        totalSaleValue: 0,
        totalMrpValue: 0,
        currency: "INR",
      },
    );
  }
}

const inventoryService = InventoryService.getInstance();
export default inventoryService;
