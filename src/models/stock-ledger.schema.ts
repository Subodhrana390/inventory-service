import mongoose, { Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { IStockLedger, LedgerEntryType } from "../types/inventory.js";

const stockLedgerSchema = new Schema<IStockLedger>(
  {
    id: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    inventoryId: {
      type: String,
      required: true,
      index: true,
    },

    shopId: {
      type: String,
      required: true,
      index: true,
    },

    orderId: {
      type: String,
    },

    referenceId: {
      type: String,
    },

    entryType: {
      type: String,
      enum: Object.values(LedgerEntryType),
      required: true,
    },

    changeInPacks: {
      type: Number,
      required: true,
    },

    changeInBaseUnits: {
      type: Number,
    },

    balanceAfterPacks: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      trim: true,
    },

    performedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        const { _id, ...rest } = ret;
        return rest;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret) => {
        const { _id, ...rest } = ret;
        return rest;
      },
    },
  },
);

stockLedgerSchema.index({ shopId: 1, createdAt: -1, id: -1 });
stockLedgerSchema.index({ inventoryId: 1, createdAt: -1 });
stockLedgerSchema.index({ orderId: 1 });
stockLedgerSchema.index({ entryType: 1 });

export const StockLedgerModel = mongoose.model<IStockLedger>(
  "StockLedger",
  stockLedgerSchema,
);

export default StockLedgerModel;
