import { Kafka, SASLOptions, Producer, Consumer, Admin } from "kafkajs";
import { config } from "../../config/index.js";


const sasl: any = config.kafka.sasl.username ? {
    mechanism: config.kafka.sasl.mechanism,
    username: config.kafka.sasl.username,
    password: config.kafka.sasl.password,
} : undefined;

class KafkaClient {
    private kafka: Kafka;
    private producer: Producer | null = null;
    private consumer: Consumer | null = null;
    private admin: Admin | null = null;

    constructor() {
        this.kafka = new Kafka({
            clientId: config.kafka.clientId,
            brokers: config.kafka.brokers,
            retry: {
                initialRetryTime: config.kafka.retryDelay,
                retries: config.kafka.retries,
            },
            sasl,
            ssl: config.kafka.ssl,
            connectionTimeout: config.kafka.connectionTimeout,
            requestTimeout: config.kafka.requestTimeout,
        });
    }

    async connectProducer(): Promise<Producer> {
        if (!this.producer) {
            this.producer = this.kafka.producer();
            await this.producer.connect();
        }
        return this.producer;
    }

    async connectConsumer(groupId: string): Promise<Consumer> {
        if (!this.consumer) {
            this.consumer = this.kafka.consumer({ groupId });
            await this.consumer.connect();
        }
        return this.consumer;
    }

    async connectAdmin(): Promise<Admin> {
        if (!this.admin) {
            this.admin = this.kafka.admin();
            await this.admin.connect();
        }
        return this.admin;
    }

    async createTopics(topics: string[]): Promise<void> {
        const admin = await this.connectAdmin();
        await admin.createTopics({
            topics: topics.map((topic) => ({ topic })),
        });
    }

    getProducer(): Producer {
        if (!this.producer) {
            throw new Error("Producer not connected. Call connectProducer first.");
        }
        return this.producer;
    }

    async disconnect(): Promise<void> {
        await Promise.all([
            this.producer?.disconnect(),
            this.consumer?.disconnect(),
            this.admin?.disconnect(),
        ]);
    }
}

export const kafkaClient = new KafkaClient();
