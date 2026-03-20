import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";

dotenv.config();

const PORT = config.port || 3008;
const MONGODB_URI = config.mongodb.uri;

import { config } from "./config/index.js";
import { initializeKafka } from "./infrastructure/kafka/init.js";

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("✅ Inventory Service DB connected");

    // Initialize Kafka
    await initializeKafka();

    app.listen(PORT, () => {
      console.log(`🚀 Inventory Service running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });
