import { config } from "../../config/index.js";
import { kafkaClient } from "./client.js";
import { OrderEventHandler } from "./handlers/order.handler.js";

export async function initializeKafka(): Promise<void> {
    try {
        console.log("🚀 Initializing Kafka for Inventory Service...");

        await kafkaClient.connectProducer();

        await kafkaClient.createTopics([
            config.kafka.topics.orderEvents,
        ]);

        const consumer = await kafkaClient.connectConsumer(
            config.kafka.groupId,
        );

        await consumer.subscribe({
            topics: [config.kafka.topics.orderEvents],
            fromBeginning: false,
        });

        const orderHandler = new OrderEventHandler();

        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                if (!message.value) return;

                try {
                    const event = JSON.parse(message.value.toString());

                    if (topic === config.kafka.topics.orderEvents) {
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
