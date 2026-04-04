import mongoose from "mongoose";
import axios from "axios";
import { config } from "./src/config/index.js";
import Inventory from "./src/models/inventory.schema.js";
import { InventorySearchService } from "./src/services/inventory-search.service.js";

const MONGO_URI = config.mongodb.uri;

const PRODUCT_SERVICE_URL = config.services.product || "http://localhost:3003";
const SHOP_SERVICE_URL = config.services.shop || "http://localhost:3004";

const productClient = axios.create({ baseURL: PRODUCT_SERVICE_URL });
const shopClient = axios.create({ baseURL: SHOP_SERVICE_URL });

async function syncInventory() {
    try {
        console.log(`📡 Connecting to MongoDB at ${MONGO_URI}...`);
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB.");

        console.log("🛠️ Initializing Elasticsearch inventory index...");
        await InventorySearchService.initIndex();

        console.log("🔍 Fetching all inventory items from database...");
        const inventories = await Inventory.find({});
        console.log(`📦 Found ${inventories.length} inventory records. Starting sync process...`);

        let successCount = 0
        let failCount = 0;

        for (const inventory of inventories) {
            try {
                let productReq;
                if (inventory.productCategory === "MEDICINE") {
                    productReq = productClient.get(`/api/v1/internal/products/medical-catalog/${inventory.productId}`);
                } else {
                    productReq = productClient.get(`/api/v1/internal/products/shop-products/${inventory.productId}`);
                }

                const shopReq = shopClient.get(`/api/v1/internal/shops/details/${inventory.shopId}`);

                const [productRes, shopRes] = await Promise.all([productReq, shopReq]);



                const product = productRes.data?.data;
                const shop = shopRes.data?.data;


                if (product && shop) {
                    await InventorySearchService.indexInventory(inventory, product, shop);
                    successCount++;
                    console.log(`✅ Synced inventory: ${inventory.id} (Product: ${inventory.productId})`);
                } else {
                    failCount++;
                    console.warn(`⚠️ Skipped inventory: ${inventory.id} (Missing Product or Shop)`);
                }
            } catch (err: any) {
                failCount++;
                console.error(`❌ Failed to sync inventory: ${inventory.id}`, err.message);
            }
        }

        console.log("\n🎉 Sync Process Completed!");
        console.log(`Total: ${inventories.length}, Success: ${successCount}, Failed: ${failCount}`);

    } catch (error) {
        console.error("❌ Critical error during sync:", error);
    } finally {
        await mongoose.disconnect();
        console.log("👋 Disconnected from MongoDB. Exiting.");
        process.exit(0);
    }
}

syncInventory();
