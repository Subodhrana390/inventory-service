import esClient from "../infrastructure/elasticsearch.js";

const PRODUCT_INDEX = "shop_products";

export class InventorySearchService {
  static async initIndex() {
    try {
      const { body: exists } = await esClient.indices.exists({
        index: PRODUCT_INDEX,
      });

      if (!exists) {
        await esClient.indices.create({
          index: PRODUCT_INDEX,
          body: {
            mappings: {
              properties: {
                id: { type: "keyword" },
                productId: { type: "keyword" },
                shopId: { type: "keyword" },
                name: { type: "text", analyzer: "standard" },
                brand: { type: "text" },
                category: { type: "keyword" },
                description: { type: "text" },
                status: { type: "keyword" },
                location: { type: "geo_point" },
                pricing: {
                  properties: {
                    mrp: { type: "float" },
                    sellingPrice: { type: "float" },
                    discount: { type: "float" },
                  },
                },
                stock: { type: "integer" },
                shopName: { type: "text" },
                shopRating: { type: "float" },
                primaryImage: { type: "keyword" },
                createdAt: { type: "date" },
                updatedAt: { type: "date" },
              },
            },
          },
        });

        console.log(`✅ OpenSearch index '${PRODUCT_INDEX}' created`);
      }
    } catch (error) {
      console.error(
        "❌ OpenSearch inventory index initialization failed:",
        error
      );
    }
  }

  static async indexInventory(inventory: any, product: any, shop: any) {
    try {
      const coords = shop.address?.location?.coordinates;
      const location = coords ? { lat: coords[0], lon: coords[1] } : undefined;

      await esClient.index({
        index: PRODUCT_INDEX,
        id: inventory.id,
        body: {
          id: inventory.id,
          productId: inventory.productId,
          shopId: inventory.shopId,
          name: product.name,
          brand: product.brand,
          category: inventory.productCategory,
          description: product.description,
          status: inventory.status || "active",
          location,
          pricing: {
            mrp: inventory.pricing?.mrpPerPack,
            sellingPrice: inventory.pricing?.salePricePerPack,
            discount: inventory.pricing?.discountPercentage,
          },
          stock: inventory.availablePacks,
          shopName: shop.name,
          shopRating: shop.ratings?.average || 0,
          primaryImage: product.primaryImage || product.images?.[0]?.url,
          createdAt: inventory.createdAt,
          updatedAt: inventory.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        `❌ OpenSearch indexing failed for inventory ${inventory.id}:`,
        error
      );
    }
  }

  static async deleteInventory(inventoryId: string) {
    try {
      await esClient.delete({
        index: PRODUCT_INDEX,
        id: inventoryId,
      });
    } catch (error) {
      console.error(
        `❌ OpenSearch deletion failed for inventory ${inventoryId}:`,
        error
      );
    }
  }
}