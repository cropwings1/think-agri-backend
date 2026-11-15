import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const publicRouter = Router();
publicRouter.get(
  "/interests",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from("interests")
      .select(
        "id,slug,name_en,name_te,name_kn,name_hi,description_en,description_te,description_kn,description_hi"
      )
      .eq("active", true)
      .order("sort_order");
    if (error) throw new HttpError(500, "Unable to load interests");
    res.json({ success: true, data });
  })
);
