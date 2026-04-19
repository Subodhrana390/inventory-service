import { config } from "../../config/index.js";
import { kafkaClient } from "./client.js";
import { OrderEventHandler } from "./handlers/order.handler.js";
import { handleProductEvent } from "./handlers/product.handler.js";
import { handleShopEvent } from "./handlers/shop.handler.js";

export async function initializeKafka(): Promise<void> {
    try {
        console.log("🚀 Initializing Kafka for Inventory Service...");

        await kafkaClient.connectProducer();

        await kafkaClient.createTopics([
            config.kafka.topics.orderEvents,
            config.kafka.topics.shopEvents,
        ]);

        const consumer = await kafkaClient.connectConsumer(
            config.kafka.groupId,
        );

        await consumer.subscribe({
            topics: [
                config.kafka.topics.orderEvents,
                config.kafka.topics.shopEvents,
            ],
            fromBeginning: false,
        });

        const orderHandler = new OrderEventHandler();

        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                if (!message.value) return;

                try {
                    const event = JSON.parse(message.value.toString());
                    const { type } = event;

                    if (topic === config.kafka.topics.shopEvents || (type && type.startsWith("shop."))) {
                        await handleShopEvent(event);
                    } else if (type && type.startsWith("product.")) {
                        await handleProductEvent(event);
                    } else {
                        await orderHandler.handle(event);
                    }
                } catch (err) {
                    console.error("Kafka message processing failed:", err);
                }
            },
        });

        console.log("✅ Kafka initialized and consuming events");
    } catch (error) {
        console.error("❌ Failed to initialize Kafka:", error);
    }
}
