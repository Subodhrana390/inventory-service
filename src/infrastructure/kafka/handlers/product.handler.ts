import { InventorySearchService } from "../../../services/inventory-search.service.js";

export const handleProductEvent = async (event: any) => {
  const { type, payload } = event;
  console.log(`📦 Handling product event: ${type}`);

  try {
    switch (type) {
      case "product.updated":
        // payload is the updated product object (medicine or shop product)
        await InventorySearchService.syncProductUpdate(payload.id, {
          name: payload.name,
          productImage: payload.image || payload.images?.[0], // handle both types
        });
        console.log(`✅ Synced product update for ${payload.id} to ES`);
        break;

      case "product.deleted":
        // deleting directly from ES in inventory-service might be tricky if we want to keep index
        // but if product is gone, we should probably mark inventory as inactive or delete from ES
        // for now, let's just log and see if we need specific logic
        console.log(`🗑️ Product ${payload.id} deleted. Manual cleanup might be needed for inventory entries.`);
        break;

      default:
        console.warn(`⚠️ Unhandled product event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling product event:`, error);
  }
};
