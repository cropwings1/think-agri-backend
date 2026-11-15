import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http.js";
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({
        success: false,
        error: { message: "Validation failed", details: err.flatten() },
      });
  if (err instanceof HttpError)
    return res
      .status(err.status)
      .json({
        success: false,
        error: { message: err.message, details: err.details },
      });
  // Log the full error server-side; never leak stack traces or database details.
  console.error(err);
  return res
    .status(500)
    .json({ success: false, error: { message: "Internal server error" } });
};
