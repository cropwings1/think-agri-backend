import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { sendError } from "../utils/http.js";
export const validate =
  (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!parsed.success)
      return sendError(res, 400, "Validation failed", parsed.error.flatten());
    Object.assign(req, { validated: parsed.data });
    next();
  };
