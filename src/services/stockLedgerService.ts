import StockLedger from "../models/stock-ledger.schema.js";
import { LedgerEntryType } from "../types/inventory.js";

class StockLedgerService {
  private static instance: StockLedgerService;

  public static getInstance(): StockLedgerService {
    if (!StockLedgerService.instance) {
      StockLedgerService.instance = new StockLedgerService();
    }
    return StockLedgerService.instance;
  }

  async createEntry(params: {
    inventoryId: string;
    shopId: string;
    entryType: LedgerEntryType;
    changeInPacks: number;
    balanceAfterPacks: number;
    performedBy: string;
    orderId?: string;
    referenceId?: string;
    reason?: string;
  }) {
    return StockLedger.create({
      inventoryId: params.inventoryId,
      shopId: params.shopId,
      entryType: params.entryType,
      changeInPacks: params.changeInPacks,
      balanceAfterPacks: params.balanceAfterPacks,
      performedBy: params.performedBy,
      orderId: params.orderId,
      referenceId: params.referenceId,
      reason: params.reason,
    });
  }

  async getByInventory(inventoryId: string, limit = 50, offset = 0) {
    return StockLedger.find({ inventoryId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);
  }

  async getByShop(shopId: string, limit = 50, offset = 0) {
    return StockLedger.find({ shopId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);
  }

  async getByOrder(orderId: string) {
    return StockLedger.find({ orderId }).sort({ createdAt: -1 });
  }

  async getByReference(referenceId: string) {
    return StockLedger.find({ referenceId }).sort({ createdAt: -1 });
  }

  async getMovementSummary(
    inventoryId: string,
    fromDate?: Date,
    toDate?: Date,
  ) {
    const query: any = { inventoryId };

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = fromDate;
      if (toDate) query.createdAt.$lte = toDate;
    }

    const entries = await StockLedger.find(query);

    return entries.reduce(
      (acc, entry) => {
        acc.totalInward += entry.changeInPacks > 0 ? entry.changeInPacks : 0;
        acc.totalOutward +=
          entry.changeInPacks < 0 ? Math.abs(entry.changeInPacks) : 0;
        acc.netChange += entry.changeInPacks;
        return acc;
      },
      {
        totalInward: 0,
        totalOutward: 0,
        netChange: 0,
      },
    );
  }

  async getLastEntry(inventoryId: string) {
    return StockLedger.findOne({ inventoryId }).sort({ createdAt: -1 });
  }

  async hasAnyMovement(inventoryId: string): Promise<boolean> {
    const count = await StockLedger.countDocuments({ inventoryId });
    return count > 0;
  }
}

const stockLedgerService = StockLedgerService.getInstance();
export default stockLedgerService;
