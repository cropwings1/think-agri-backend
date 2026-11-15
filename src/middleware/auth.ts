import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { sendError } from "../utils/http.js";

declare global {
  namespace Express {
    interface Request {
      admin?: { email: string };
    }
  }
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (!token) return sendError(res, 401, "Authentication required");
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (payload.email !== env.ADMIN_EMAIL)
      return sendError(res, 401, "Invalid admin session");
    req.admin = { email: payload.email as string };
    next();
  } catch {
    return sendError(res, 401, "Session expired. Please sign in again.");
  }
}
