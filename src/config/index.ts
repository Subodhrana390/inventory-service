import dotenv from "dotenv";
import fs from 'fs';
import path from 'path'

dotenv.config({});

const nodeEnv = process.env.NODE_ENV || 'development';

const caPath = nodeEnv === 'production' ? '/etc/secrets/ca.pem' : path.resolve(process.cwd(), 'src/certs/ca.pem');


const getCA = (): string[] | undefined => {
  if (fs.existsSync(caPath)) {
    return [fs.readFileSync(caPath, 'utf-8')];
  }
  return undefined;
};


export const config = {
  env: nodeEnv,
  port: Number(process.env.APP_INVENTORY_SERVICE_PORT || "3008"),
  mongodb: {
    uri: process.env.APP_INVENTORY_MONGO_URI!,
  },
  jwt: {
    secret: process.env.JWT_ACCESS_SECRET!,
  },
  kafka: {
    clientId: process.env.APP_INVENTORY_KAFKA_CLIENT_ID!,
    brokers: process.env.APP_KAFKA_BROKER!,
    groupId:
      process.env.APP_INVENTORY_KAFKA_GROUP_ID! || "inventory-service-group",
    sasl: {
      mechanism: process.env.APP_KAFKA_SASL_MECHANISM! as "plain" | "scram-sha-256" | "scram-sha-512",
      username: process.env.APP_KAFKA_SASL_USERNAME!,
      password: process.env.APP_KAFKA_SASL_PASSWORD!,
    },
    ssl: getCA() ? { rejectUnauthorized: true, ca: getCA() } : (process.env.APP_KAFKA_SSL === "true"),
    retries: Number(process.env.APP_KAFKA_RETRIES || 5),
    retryDelay: Number(process.env.APP_KAFKA_RETRY_DELAY || 1000),
    connectionTimeout: Number(process.env.APP_KAFKA_CONNECTION_TIMEOUT),
    requestTimeout: Number(process.env.APP_KAFKA_REQUEST_TIMEOUT),
    topics: {
      orderEvents: process.env.KAFKA_TOPIC_ORDER_EVENTS!,
      shopEvents: process.env.KAFKA_TOPIC_SHOP_EVENTS!,
    },
  },
  services: {
    product: process.env.APP_PRODUCT_SERVICE_URL!,
    shop: process.env.APP_SHOP_SERVICE_URL!,
  },
  elasticSearch: {
    node: process.env.APP_ELASTICSEARCH_NODE! || "http://localhost:9200",
  },
  isProduction: nodeEnv === "production",
};
