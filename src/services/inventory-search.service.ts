import esClient from "../infrastructure/elasticsearch.js";

const PRODUCT_INDEX = "shop_products";

export class InventorySearchService {
  static async initIndex() {
    try {
      const exists = await esClient.indices.exists({
        index: PRODUCT_INDEX,
      });

      if (!exists.body) {
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
                productImage: { type: "keyword" },
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
      // Swapping coordinates as requested by user to fix reversal problem
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
          status: (inventory.status || "ACTIVE").toUpperCase(),
          location,
          pricing: {
            mrp: inventory.pricing?.mrp,
            sellingPrice: inventory.pricing?.sellingPrice,
            discount: inventory.pricing?.discountPercentage,
          },
          stock: inventory.availablePacks,
          shopName: shop.name,
          shopRating: shop.ratings?.average || 0,
          primaryImage: product.primaryImage || product.images?.[0]?.url,
          productImage: product.primaryImage || product.images?.[0]?.url,
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

  static async updateByQuery(script: string, query: any, params: any = {}) {
    try {
      await esClient.updateByQuery({
        index: PRODUCT_INDEX,
        body: {
          script: {
            source: script,
            lang: "painless",
            params,
          },
          query,
        },
      });
      console.log(`✅ OpenSearch docs updated by query`);
    } catch (error) {
      console.error("❌ OpenSearch update_by_query failed:", error);
    }
  }

  static async syncProductUpdate(productId: string, data: any) {
    const script = `
      if (params.name != null) ctx._source.name = params.name;
      if (params.productImage != null) ctx._source.productImage = params.productImage;
      if (params.productImage != null) ctx._source.primaryImage = params.productImage;
    `;
    const query = { term: { productId } };
    await this.updateByQuery(script, query, data);
  }

  static async syncShopUpdate(shopId: string, data: any) {
    const script = `
      if (params.name != null) ctx._source.shopName = params.name;
      if (params.location != null) ctx._source.location = params.location;
    `;
    const query = { term: { shopId } };
    await this.updateByQuery(script, query, data);
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