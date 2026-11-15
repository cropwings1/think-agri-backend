import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const auditRouter = Router();
auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 30);
    let q = supabase.from("audit_logs").select("*", { count: "exact" });
    if (typeof req.query.entityType === "string")
      q = q.eq("entity_type", req.query.entityType);
    if (typeof req.query.action === "string")
      q = q.eq("action", req.query.action);
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) throw new HttpError(500, "Unable to load audit activity");
    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  })
);
