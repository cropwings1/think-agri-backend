import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
export const communitiesRouter = Router();
const input = z.object({
  interest_id: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  invite_url: z.string().url().startsWith("https://chat.whatsapp.com/"),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});
communitiesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from("communities")
      .select("*,interests(id,slug,name_en)")
      .order("sort_order");
    if (error) throw new HttpError(500, "Unable to load communities");
    res.json({ success: true, data });
  })
);
communitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = input.parse(req.body);
    const { data, error } = await supabase
      .from("communities")
      .insert(body)
      .select()
      .single();
    if (error) throw new HttpError(400, "Unable to create community");
    await supabase
      .from("audit_logs")
      .insert({
        entity_type: "community",
        entity_id: data.id,
        action: "created",
        actor: "admin",
        metadata: { name: data.name },
      });
    res.status(201).json({ success: true, data });
  })
);
communitiesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = input.partial().parse(req.body);
    const { data, error } = await supabase
      .from("communities")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error || !data) throw new HttpError(404, "Community not found");
    await supabase
      .from("audit_logs")
      .insert({
        entity_type: "community",
        entity_id: data.id,
        action: "updated",
        actor: "admin",
        metadata: { fields: Object.keys(body) },
      });
    res.json({ success: true, data });
  })
);
communitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("communities")
      .delete()
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, "Unable to delete community");
    await supabase
      .from("audit_logs")
      .insert({
        entity_type: "community",
        entity_id: req.params.id,
        action: "deleted",
        actor: "admin",
        metadata: {},
      });
    res.json({ success: true });
  })
);
