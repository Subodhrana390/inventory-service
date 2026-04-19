import { InventorySearchService } from "../../../services/inventory-search.service.js";

export const handleShopEvent = async (event: any) => {
  const { type, payload } = event;
  console.log(`🏪 Handling shop event: ${type}`);

  try {
    switch (type) {
      case "shop.updated":
        // payload is the updated shop object
        await InventorySearchService.syncShopUpdate(payload.id, {
          name: payload.name,
          location: payload.location, 
        });
        console.log(`✅ Synced shop update for ${payload.id} to ES`);
        break;

      default:
        console.warn(`⚠️ Unhandled shop event type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Error handling shop event:`, error);
  }
};
