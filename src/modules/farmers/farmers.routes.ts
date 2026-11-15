import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";

export const farmersRouter = Router();
const languages = ["en", "te", "kn", "hi"] as const;
const farmerInput = z.object({
  name: z.string().trim().min(2).max(80),
  mobile: z.string().regex(/^\+?91?[6-9]\d{9}$/),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  state: z.string().trim().max(80).optional().default("Telangana"),
  district: z.string().trim().max(100).optional().nullable(),
  mandal: z.string().trim().max(100).optional().nullable(),
  village: z.string().trim().max(100).optional().nullable(),
  language: z.enum(languages),
  interests: z.array(z.string().uuid()).min(1).max(20),
  consent: z.boolean(),
  consent_text_version: z.string().max(30).optional(),
});
const selectFields =
  "id,farmer_code,name,mobile,pincode,state,district,mandal,village,language,community_status,consent,consent_at,consent_text_version,source,created_at,updated_at,farmer_interests(interest_id,interests(id,slug,name_en,name_te,name_kn,name_hi)),whatsapp_messages(id,status,message_id,error_message,sent_at,delivered_at,read_at,created_at)";

farmersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = supabase
      .from("farmers")
      .select(selectFields, { count: "exact" });
    const q = String(req.query.search ?? "").trim();
    if (q)
      query = query.or(
        `name.ilike.%${q}%,mobile.ilike.%${q}%,farmer_code.ilike.%${q}%,pincode.ilike.%${q}%`
      );
    for (const key of [
      "language",
      "state",
      "district",
      "mandal",
      "pincode",
    ] as const) {
      const value = req.query[key];
      if (typeof value === "string" && value) query = query.eq(key, value);
    }
    if (req.query.consent === "true" || req.query.consent === "false")
      query = query.eq("consent", req.query.consent === "true");
    if (typeof req.query.from === "string")
      query = query.gte("created_at", req.query.from);
    if (typeof req.query.to === "string")
      query = query.lte("created_at", `${req.query.to}T23:59:59.999Z`);
    if (typeof req.query.community_status === "string") {
      const status = z
        .enum(["joined", "not_joined"])
        .safeParse(req.query.community_status);
      if (!status.success) throw new HttpError(400, "Invalid community status");
      query = query.eq("community_status", status.data);
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new HttpError(500, "Unable to fetch farmers");
    let rows = data ?? [];
    if (typeof req.query.interestId === "string")
      rows = rows.filter((f: any) =>
        f.farmer_interests?.some(
          (i: any) => i.interest_id === req.query.interestId
        )
      );
    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  })
);

farmersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("farmers")
      .select(selectFields)
      .eq("id", req.params.id)
      .single();
    if (error || !data) throw new HttpError(404, "Farmer not found");
    const { data: auditLogs } = await supabase
      .from("audit_logs")
      .select("id,action,actor,metadata,created_at")
      .eq("entity_type", "farmer")
      .eq("entity_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(50);
    res.json({ success: true, data: { ...data, audit_logs: auditLogs ?? [] } });
  })
);

farmersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = farmerInput.parse(req.body);
    const normalizedMobile = input.mobile.replace(/\D/g, "").replace(/^91/, "");
    const { data: existing } = await supabase
      .from("farmers")
      .select("id")
      .eq("mobile", `+91${normalizedMobile}`)
      .maybeSingle();
    if (existing)
      throw new HttpError(
        409,
        "A farmer with this mobile number is already registered"
      );
    const { data, error } = await supabase
      .from("farmers")
      .insert({
        name: input.name,
        mobile: `+91${normalizedMobile}`,
        pincode: input.pincode,
        state: input.state,
        district: input.district,
        mandal: input.mandal,
        village: input.village,
        language: input.language,
        consent: input.consent,
        consent_at: input.consent ? new Date().toISOString() : null,
        consent_text_version: input.consent_text_version,
        source: "admin",
      })
      .select("id")
      .single();
    if (error || !data) throw new HttpError(500, "Unable to create farmer");
    const links = input.interests.map((interest_id) => ({
      farmer_id: data.id,
      interest_id,
    }));
    const inserted = await supabase.from("farmer_interests").insert(links);
    if (inserted.error) {
      await supabase.from("farmers").delete().eq("id", data.id);
      throw new HttpError(500, "Unable to save farmer interests");
    }
    await supabase.from("audit_logs").insert({
      entity_type: "farmer",
      entity_id: data.id,
      action: "created",
      actor: "admin",
      metadata: { source: "admin" },
    });
    res.status(201).json({ success: true, data: { id: data.id } });
  })
);

const communityStatusSchema = z.object({
  community_status: z.enum(["joined", "not_joined"]),
});

farmersRouter.patch(
  "/:id/community-status",
  asyncHandler(async (req, res) => {
    const { community_status } = communityStatusSchema.parse(req.body);
    const farmerId = z.string().uuid().parse(req.params.id);

    const { data: current, error: readError } = await supabase
      .from("farmers")
      .select("id,community_status")
      .eq("id", farmerId)
      .maybeSingle();

    if (readError) throw new HttpError(500, "Unable to read farmer status");
    if (!current) throw new HttpError(404, "Farmer not found");

    if (current.community_status === community_status) {
      const { data } = await supabase
        .from("farmers")
        .select("id,farmer_code,name,community_status")
        .eq("id", farmerId)
        .single();
      res.json({ success: true, data });
      return;
    }

    const { data, error } = await supabase
      .from("farmers")
      .update({ community_status, updated_at: new Date().toISOString() })
      .eq("id", farmerId)
      .select("id,farmer_code,name,community_status")
      .single();

    if (error || !data)
      throw new HttpError(500, "Unable to update community status");

    const { error: auditError } = await supabase.from("audit_logs").insert({
      entity_type: "farmer",
      entity_id: farmerId,
      action: "community_status_updated",
      actor: "admin",
      metadata: {
        old_status: current.community_status ?? "not_joined",
        new_status: community_status,
      },
    });
    if (auditError)
      throw new HttpError(
        500,
        "Status updated but audit log could not be saved"
      );

    res.json({ success: true, data });
  })
);

farmersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const partial = farmerInput.partial().parse(req.body);
    const { interests, ...fields } = partial;
    const update: Record<string, unknown> = {
      ...fields,
      updated_at: new Date().toISOString(),
    };
    if (fields.mobile)
      update.mobile = `+91${fields.mobile
        .replace(/\D/g, "")
        .replace(/^91/, "")}`;
    if (fields.consent === true && !fields.consent_text_version)
      update.consent_at = new Date().toISOString();
    const { error } = await supabase
      .from("farmers")
      .update(update)
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, "Unable to update farmer");
    if (interests) {
      await supabase
        .from("farmer_interests")
        .delete()
        .eq("farmer_id", req.params.id);
      const r = await supabase.from("farmer_interests").insert(
        interests.map((interest_id) => ({
          farmer_id: req.params.id,
          interest_id,
        }))
      );
      if (r.error)
        throw new HttpError(
          500,
          "Farmer updated but interests could not be saved"
        );
    }
    await supabase.from("audit_logs").insert({
      entity_type: "farmer",
      entity_id: req.params.id,
      action: "updated",
      actor: "admin",
      metadata: { fields: Object.keys(req.body) },
    });
    res.json({ success: true });
  })
);

farmersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("farmers")
      .delete()
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, "Unable to delete farmer");
    await supabase.from("audit_logs").insert({
      entity_type: "farmer",
      entity_id: req.params.id,
      action: "deleted",
      actor: "admin",
      metadata: {},
    });
    res.json({ success: true });
  })
);
