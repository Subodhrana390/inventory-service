import { Document, Model } from "mongoose";

export enum PackType {
  STRIP = "STRIP",
  BOTTLE = "BOTTLE",
  TUBE = "TUBE",
  VIAL = "VIAL",
  AMPOULE = "AMPOULE",
  SACHET = "SACHET",
  BOX = "BOX",
  CARTRIDGE = "CARTRIDGE",
}

export enum ConsumptionUnit {
  TABLET = "TABLET",
  CAPSULE = "CAPSULE",
  ML = "ML",
  GM = "GM",
  IU = "IU",
  PUFF = "PUFF",
  PATCH = "PATCH",
  UNIT = "UNIT",
}

export enum LedgerEntryType {
  INWARD = "INWARD",
  ORDER_ACCEPTED = "ACCEPTED",
  ORDER_DELIVERED = "DELIVERED",
  ORDER_CANCELLED = "CANCELLED",
  ADJUSTMENT = "ADJUSTMENT",
  DAMAGE = "DAMAGE",
  EXPIRY_REMOVAL = "EXPIRY_REMOVAL",
  AUDIT_ADJUSTMENT = "AUDIT_ADJUSTMENT",
  RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER",
  MANUAL_ADDITION = "MANUAL_ADDITION",
}

export enum ShopProductCategory {
  MEDICINE = "MEDICINE",
  WELLNESS = "WELLNESS",
  DEVICE = "DEVICE",
  FIRST_AID = "FIRST_AID",
  PERSONAL_CARE = "PERSONAL_CARE",
  ELDERLY_CARE = "ELDERLY_CARE",
  DIAGNOSTICS = "DIAGNOSTICS",
}

export interface IInventory {
  id?: string;

  shopId: string;
  productId: string;
  productCategory: ShopProductCategory;

  packaging: {
    container: PackType;
    unitType: ConsumptionUnit;
    unitsPerPack: number;
    isSplittable?: boolean;
  };

  batchNumber: string;
  expiryDate?: String;

  stock: {
    totalBaseUnits: number;
    reservedUnits: number;
  };

  pricing: {
    costPricePerPack: number;
    mrpPerPack: number;
    salePricePerPack: number;
    discountPercentage?: number;
    gstPercent?: number;
  };

  alerts: {
    lowStockThreshold?: number;
    expiryAlertDays?: number;
    lastLowStockAlert?: Date;
    lastExpiryAlert?: Date;
  };

  lastStockUpdate?: Date;

  createdBy?: string;
  updatedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;

  availablePacks?: number;
  availableDisplay?: string;

  toObject(): any;
  save(): Promise<this>;
}

export interface IInventoryModel extends Model<IInventory> {
  // Alerts
  findLowStockItems(shopId: string): Promise<(IInventory & Document)[]>;
  findExpiringItems(
    shopId: string,
    days: number,
  ): Promise<(IInventory & Document)[]>;

  // Core ops
  findByProductAndBatch(
    shopId: string,
    productId: string,
    batchNumber: string,
  ): Promise<(IInventory & Document) | null>;

  hasSufficientStock(
    inventoryId: string,
    requiredPacks: number,
  ): Promise<boolean>;

  reserveStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
  ): Promise<void>;

  releaseReservedStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
  ): Promise<void>;

  deductStock(
    inventoryId: string,
    packs: number,
    performedBy: string,
  ): Promise<void>;
}

export interface IStockLedger {
  id: string;

  inventoryId: string;
  shopId: string;
  orderId?: string;
  referenceId?: string;

  entryType: LedgerEntryType;

  changeInPacks: number;
  changeInBaseUnits?: number;

  balanceAfterPacks: number;

  reason?: string;
  performedBy: string;

  createdAt: Date;
  updatedAt: Date;

  toObject(): any;
}
