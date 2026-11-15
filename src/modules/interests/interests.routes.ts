import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const interestsRouter = Router();
const input = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name_en: z.string().min(2),
  name_te: z.string().min(2),
  name_kn: z.string().min(2),
  name_hi: z.string().min(2),
  description_en: z.string().optional().nullable(),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});
interestsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from("interests")
      .select("*")
      .order("sort_order");
    if (error) throw new HttpError(500, "Unable to load interests");
    res.json({ success: true, data });
  })
);
interestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("interests")
      .insert(input.parse(req.body))
      .select()
      .single();
    if (error) throw new HttpError(400, "Unable to create interest");
    res.status(201).json({ success: true, data });
  })
);
interestsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("interests")
      .update(input.partial().parse(req.body))
      .eq("id", req.params.id)
      .select()
      .single();
    if (error || !data) throw new HttpError(404, "Interest not found");
    res.json({ success: true, data });
  })
);
