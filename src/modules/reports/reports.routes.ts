import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const reportsRouter = Router();
reportsRouter.get(
  "/registrations.csv",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from ?? "1970-01-01");
    const to = String(req.query.to ?? "2999-12-31");
    const { data, error } = await supabase
      .from("farmers")
      .select(
        "farmer_code,name,mobile,pincode,state,district,mandal,village,language,consent,created_at"
      )
      .gte("created_at", from)
      .lte("created_at", `${to}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) throw new HttpError(500, "Unable to export farmers");
    const columns = [
      "farmer_code",
      "name",
      "mobile",
      "pincode",
      "state",
      "district",
      "mandal",
      "village",
      "language",
      "consent",
      "created_at",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      columns.join(","),
      ...(data ?? []).map((row) =>
        columns.map((c) => esc((row as any)[c])).join(",")
      ),
    ].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="farmer-registrations.csv"'
    );
    res.send("\uFEFF" + csv);
  })
);
