import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";

export const contentPublicRouter = Router();
export const contentAdminRouter = Router();
const languages = ["en", "te", "kn", "hi"] as const;
const sectionKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);
const contentKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,99}$/);
const upsertSchema = z
  .object({
    language_code: z.enum(languages),
    content_key: contentKeySchema,
    content_value: z.string().max(5000),
    is_published: z.boolean().default(true),
  })
  .superRefine((row, ctx) => {
    if (
      row.content_key === "community_invite_url" &&
      !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+$/.test(row.content_value)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["content_value"],
        message: "Use a valid WhatsApp Community invite URL.",
      });
    }
  });

contentPublicRouter.get(
  "/:sectionKey",
  asyncHandler(async (req, res) => {
    const sectionKey = sectionKeySchema.parse(req.params.sectionKey);
    const language = z.enum(languages).catch("en").parse(req.query.language);
    const { data, error } = await supabase
      .from("content_translations")
      .select("content_key,content_value,language_code")
      .eq("section_key", sectionKey)
      .eq("language_code", language)
      .eq("is_published", true);
    if (error) throw new HttpError(500, "Unable to load website content");
    const values = Object.fromEntries(
      (data ?? []).map((row) => [row.content_key, row.content_value])
    );
    if (language !== "en") {
      const { data: fallback, error: fallbackError } = await supabase
        .from("content_translations")
        .select("content_key,content_value")
        .eq("section_key", sectionKey)
        .eq("language_code", "en")
        .eq("is_published", true);
      if (fallbackError)
        throw new HttpError(500, "Unable to load fallback content");
      for (const row of fallback ?? [])
        if (!(row.content_key in values))
          values[row.content_key] = row.content_value;
    }
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300"
    );
    res.json({
      success: true,
      data: { section: sectionKey, language, content: values },
    });
  })
);

contentAdminRouter.get(
  "/:sectionKey",
  asyncHandler(async (req, res) => {
    const sectionKey = sectionKeySchema.parse(req.params.sectionKey);
    const { data, error } = await supabase
      .from("content_translations")
      .select(
        "id,section_key,language_code,content_key,content_value,is_published,updated_at"
      )
      .eq("section_key", sectionKey)
      .order("content_key")
      .order("language_code");
    if (error) throw new HttpError(500, "Unable to load content translations");
    res.json({ success: true, data: data ?? [] });
  })
);

contentAdminRouter.put(
  "/:sectionKey",
  asyncHandler(async (req, res) => {
    const sectionKey = sectionKeySchema.parse(req.params.sectionKey);
    const rows = z
      .array(upsertSchema)
      .min(1)
      .max(200)
      .parse(req.body?.translations);
    const payload = rows.map((row) => ({
      ...row,
      section_key: sectionKey,
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await supabase
      .from("content_translations")
      .upsert(payload, { onConflict: "section_key,language_code,content_key" })
      .select(
        "id,section_key,language_code,content_key,content_value,is_published,updated_at"
      );
    if (error) throw new HttpError(400, "Unable to save content translations");
    await supabase.from("audit_logs").insert({
      entity_type: "content",
      entity_id: null,
      action: "updated",
      actor: req.admin?.email || "admin",
      metadata: {
        section_key: sectionKey,
        updated_count: payload.length,
        keys: [...new Set(rows.map((r) => r.content_key))],
      },
    });
    res.json({ success: true, data: data ?? [] });
  })
);
