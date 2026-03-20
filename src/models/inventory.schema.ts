import mongoose, { Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import {
  ConsumptionUnit,
  IInventory,
  IInventoryModel,
  PackType,
} from "../types/inventory.js";

const inventorySchema = new Schema<IInventory, IInventoryModel>(
  {
    id: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    shopId: {
      type: String,
      required: true,
      index: true,
    },

    productId: {
      type: String,
      required: true,
      index: true,
    },

    productCategory: {
      type: String,
      enum: ["MEDICINE", "WELLNESS", "DEVICE", "PERSONAL_CARE"],
      required: true,
    },

    packaging: {
      container: {
        type: String,
        enum: Object.values(PackType),
        required: true,
      },
      unitType: {
        type: String,
        enum: Object.values(ConsumptionUnit),
        required: true,
      },
      unitsPerPack: {
        type: Number,
        required: true,
        min: 1,
      },
      isSplittable: {
        type: Boolean,
        default: false,
      },
    },

    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },

    expiryDate: {
      type: Date,
      index: true,
    },

    stock: {
      totalBaseUnits: {
        type: Number,
        required: true,
        min: 0,
      },
      reservedUnits: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    pricing: {
      costPricePerPack: {
        type: Number,
        required: true,
        min: 0,
      },
      mrpPerPack: {
        type: Number,
        required: true,
        min: 0,
      },
      salePricePerPack: {
        type: Number,
        required: true,
        min: 0,
      },
      discountPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      gstPercent: {
        type: Number,
        default: 12,
        min: 0,
      },
    },

    alerts: {
      lowStockThreshold: {
        type: Number,
        min: 0,
        default: 10,
      },
      expiryAlertDays: {
        type: Number,
        min: 0,
        default: 30,
      },
      lastLowStockAlert: Date,
      lastExpiryAlert: Date,
    },

    lastStockUpdate: {
      type: Date,
      default: Date.now,
    },

    createdBy: {
      type: String,
      required: true,
    },

    updatedBy: {
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

/* =======================
   VIRTUALS
======================= */

// Number of sellable full packs
inventorySchema.virtual("availablePacks").get(function (this: IInventory) {
  const sellableUnits = this.stock.totalBaseUnits - this.stock.reservedUnits;

  return Math.floor(Math.max(0, sellableUnits / this.packaging.unitsPerPack));
});

// UI helper
inventorySchema.virtual("availableDisplay").get(function (this: IInventory) {
  const packs = this.availablePacks;
  return `${packs} ${this.packaging.container}${packs !== 1 ? "s" : ""}`;
});

/* =======================
   STATICS
======================= */

// Low stock (pack-based)
inventorySchema.statics.findLowStockItems = function (shopId: string) {
  return this.find({
    shopId,
    $expr: {
      $lte: [
        {
          $floor: {
            $divide: [
              { $subtract: ["$stock.totalBaseUnits", "$stock.reservedUnits"] },
              "$packaging.unitsPerPack",
            ],
          },
        },
        "$alerts.lowStockThreshold",
      ],
    },
  });
};

// Near-expiry items
inventorySchema.statics.findExpiringItems = function (
  shopId: string,
  daysAhead = 30,
) {
  const alertDate = new Date();
  alertDate.setDate(alertDate.getDate() + daysAhead);

  return this.find({
    shopId,
    expiryDate: {
      $lte: alertDate,
      $gt: new Date(),
    },
  });
};

// Find specific batch (critical)
inventorySchema.statics.findByProductAndBatch = function (
  shopId: string,
  productId: string,
  batchNumber: string,
) {
  return this.findOne({ shopId, productId, batchNumber });
};

inventorySchema.statics.hasSufficientStock = async function (
  inventoryId: string,
  requiredPacks: number,
) {
  const inventory = await this.findOne({ id: inventoryId });
  if (!inventory) return false;

  return (inventory.availablePacks ?? 0) >= requiredPacks;
};

export const InventoryModel = mongoose.model<IInventory, IInventoryModel>(
  "Inventory",
  inventorySchema,
);

export default InventoryModel;
