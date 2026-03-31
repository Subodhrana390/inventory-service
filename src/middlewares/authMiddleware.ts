import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { ApiError } from "../utils/ApiError.js";

export const protect = (
  req: Request,
  _: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new ApiError(401, "No token provided"));
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      id: string;
      role: string;
    };

    req.user = decoded;

    next();
  } catch (error) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
};

export const authorizeRoles =
  (...allowedRoles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError(401, "Unauthorized"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          `Access denied. Allowed roles: ${allowedRoles.join(", ")}`,
        ),
      );
    }

    next();
  };
