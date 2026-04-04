import StockLedger, {
  StockLedgerModel,
} from "../models/stock-ledger.schema.js";
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

  async getByInventory(
    inventoryId: string,
    limit: number,
    cursor?: string,
    direction: "next" | "prev" = "next",
  ) {
    const query: any = { inventoryId };

    if (cursor) {
      query.createdAt =
        direction === "next"
          ? { $lt: new Date(cursor) }
          : { $gt: new Date(cursor) };
    }

    const sortOrder = direction === "next" ? -1 : 1;

    const ledger = await StockLedgerModel.find(query)
      .sort({ createdAt: sortOrder })
      .limit(limit);

    return direction === "prev" ? ledger.reverse() : ledger;
  }

  async getStockHistory(
    shopId: string,
    fromDate?: Date,
    toDate?: Date,
    limit = 10,
    cursor?: string,
    direction: "next" | "prev" = "next",
  ) {
    const match: any = { shopId };

    const andConditions: any[] = [];

    if (fromDate || toDate) {
      const dateFilter: any = {};

      if (fromDate) dateFilter.$gte = fromDate;
      if (toDate) dateFilter.$lte = toDate;

      if (Object.keys(dateFilter).length > 0) {
        andConditions.push({ createdAt: dateFilter });
      }
    }

    if (cursor) {
      const cursorObj = JSON.parse(
        Buffer.from(cursor, "base64").toString("utf8"),
      );

      const cursorDate = new Date(cursorObj.createdAt);

      const cursorCondition =
        direction === "next"
          ? {
              $or: [
                { createdAt: { $lt: cursorDate } },
                {
                  createdAt: cursorDate,
                  id: { $lt: cursorObj.id },
                },
              ],
            }
          : {
              $or: [
                { createdAt: { $gt: cursorDate } },
                {
                  createdAt: cursorDate,
                  id: { $gt: cursorObj.id },
                },
              ],
            };

      andConditions.push(cursorCondition);
    }

    if (andConditions.length > 0) {
      match.$and = andConditions;
    }

    const sortOrder = direction === "next" ? -1 : 1;

    const docs = await StockLedger.find(match)
      .sort({ createdAt: sortOrder, id: sortOrder })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;

    if (hasMore) docs.pop();

    const history = direction === "prev" ? docs.reverse() : docs;

    const encodeCursor = (doc: any) =>
      Buffer.from(
        JSON.stringify({
          createdAt: doc.createdAt,
          id: doc.id,
        }),
      ).toString("base64");

    return {
      items: history,
      hasNextPage: direction === "next" ? hasMore : Boolean(cursor),
      hasPrevPage: direction === "prev" ? hasMore : Boolean(cursor),
      nextCursor:
        history.length > 0 ? encodeCursor(history[history.length - 1]) : null,
      prevCursor: history.length > 0 ? encodeCursor(history[0]) : null,
    };
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
