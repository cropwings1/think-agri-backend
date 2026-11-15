import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const locationsRouter = Router();
locationsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from("farmer_locations_view")
      .select("*")
      .order("farmer_count", { ascending: false })
      .limit(5000);
    if (error) throw new HttpError(500, "Unable to load location summary");
    res.json({ success: true, data });
  })
);

locationsRouter.get(
  "/pincode/:pincode",
  asyncHandler(async (req, res) => {
    const pin = req.params.pincode;

    if (typeof pin !== "string" || !/^[1-9]\d{5}$/.test(pin)) {
      throw new HttpError(400, "Invalid PIN code");
    }

    const { data, error } = await supabase
      .from("pincode_directory")
      .select("*")
      .eq("pincode", pin)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Unable to look up PIN code");
    }

    res.json({ success: true, data });
  })
);
