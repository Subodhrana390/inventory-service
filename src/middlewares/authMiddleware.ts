import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createInternalClient } from "../utils/http.js";
import { config } from "../config/index.js";

const shopClient = createInternalClient(config.services.shop);

const JWT_SECRET = config.jwt.secret;

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        [key: string]: any;
    };
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        const error = new Error("No token provided") as any;
        error.statusCode = 401;
        throw error;
    }

    const token = header.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (err: any) {
        err.statusCode = 401;
        throw err;
    }
};

export const requireShopOwner = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "shop-owner") {
        const error = new Error("Access denied. Shop owner privileges required.") as any;
        error.statusCode = 403;
        throw error;
    }
    next();
};

export const requireShopOwnership = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const shopId = req.params.shopId || req.body.shopId || req.query.shopId;

    if (!shopId) {
        const error = new Error("Shop ID is required") as any;
        error.statusCode = 400;
        return next(error);
    }

    if (!req.user) {
        const error = new Error("Unauthorized") as any;
        error.statusCode = 401;
        return next(error);
    }

    try {
        const { data } = await shopClient.get(`/api/v1/internal/shops/verify-owner/${req.user.id}/${shopId}`);
        if (!data.isOwner) {
            const error = new Error("Unauthorized: You do not own this shop") as any;
            error.statusCode = 403;
            return next(error);
        }
        next();
    } catch (err: any) {
        console.error("Error verifying shop ownership:", err.message);
        const error = new Error("Service unavailable") as any;
        error.statusCode = 503;
        return next(error);
    }
};
