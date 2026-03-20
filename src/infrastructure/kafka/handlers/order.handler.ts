import inventoryService from "../../../services/inventoryService.js";
import { kafkaClient } from "../client.js";
import { config } from "../../../config/index.js";

export class OrderEventHandler {
    async handle(event: any) {
        const { type, payload } = event;

        switch (type) {
            case "order.created":
                await this.handleOrderCreated(payload);
                break;
            case "order.cancelled":
                await this.handleOrderCancelled(payload);
                break;
            case "order.delivered":
                await this.handleOrderDelivered(payload);
                break;
            default:
                break;
        }
    }

    private async handleOrderCreated(payload: any) {
        const { orderId, items, userId } = payload;
        console.log(`📦 Processing stock reservation for order: ${orderId}`);

        try {
            await inventoryService.reserveStockForOrder(orderId, items, userId);

            await this.emitInventoryEvent("inventory.reserved", {
                orderId,
                status: "SUCCESS"
            });
            console.log(`✅ Stock reserved successfully for order: ${orderId}`);
        } catch (error: any) {
            console.error(`❌ Stock reservation failed for order: ${orderId}`, error.message);

            await this.emitInventoryEvent("inventory.reservation_failed", {
                orderId,
                reason: error.message || "Insufficient stock or internal error",
                items
            });
        }
    }

    private async handleOrderCancelled(payload: any) {
        const { orderId, items, userId } = payload;
        console.log(`🔄 Reversing stock for cancelled order: ${orderId}`);

        try {
            await inventoryService.releaseStockForOrder(orderId, items, userId);
            console.log(`✅ Stock reversed for order: ${orderId}`);
        } catch (error: any) {
            console.error(`❌ Stock reversal failed for order: ${orderId}`, error.message);
        }
    }

    private async handleOrderDelivered(payload: any) {
        const { orderId, items, userId } = payload;
        console.log(`🚚 Deducting final stock for delivered order: ${orderId}`);

        try {
            await inventoryService.completeStockDeductionForOrder(orderId, items, userId);
            console.log(`✅ Stock deducted for order: ${orderId}`);
        } catch (error: any) {
            console.error(`❌ Stock deduction failed for order: ${orderId}`, error.message);
        }
    }

    private async emitInventoryEvent(type: string, payload: any) {
        try {
            const producer = kafkaClient.getProducer();
            await producer.send({
                topic: config.kafka.topics.orderEvents,
                messages: [
                    {
                        key: payload.orderId,
                        value: JSON.stringify({ type, payload }),
                    },
                ],
            });
        } catch (error) {
            console.error(`Failed to emit inventory event ${type}:`, error);
        }
    }
}
