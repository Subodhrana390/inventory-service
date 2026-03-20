import { Client } from "@opensearch-project/opensearch";
import { config } from "../config/index.js";

const esClient = new Client({
  node: config.elasticSearch.node,
});

export const checkConnection = async () => {
  try {
    const health = await esClient.cluster.health();

    console.log(
      "✅ OpenSearch connected (inventory-service):",
      health.body.status
    );

    return true;
  } catch (error) {
    console.error(
      "❌ OpenSearch connection failed (inventory-service):",
      error
    );
    return false;
  }
};

export default esClient;