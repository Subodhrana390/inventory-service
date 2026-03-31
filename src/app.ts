import cors from "cors";
import express, { Request, Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import publicRoutes from "./routes/inventory.public.js";
import internalRoutes from "./routes/inventory.internal.js";
import stockLedgerRoutes from "./routes/stockLedger.routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.json({ service: "inventory-service", status: "healthy" });
});

app.use("/api/v1/inventory", publicRoutes);
app.use("/api/v1/internal/inventory", internalRoutes);
app.use("/api/v1/inventory/stock-ledger", stockLedgerRoutes);

app.use(errorHandler as any);

export default app;
