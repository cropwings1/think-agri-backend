import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../config/supabase.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
import { sendInvitationMessage } from "../whatsapp/whatsapp.service.js";
export const registrationRouter = Router();
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\+?91?[6-9]\d{9}$/),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  state: z.string().max(80).optional().default("Telangana"),
  district: z.string().max(100).optional().nullable(),
  mandal: z.string().max(100).optional().nullable(),
  village: z.string().max(100).optional().nullable(),
  language: z.enum(["en", "te", "kn", "hi"]),
  interests: z.array(z.string().uuid()).min(1).max(20),
  consent: z.literal(true),
  consent_text_version: z.string().max(30).default("v1"),
  source: z.string().max(80).default("website"),
});
registrationRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = schema.parse(req.body);
    const mobile = `+91${input.phone.replace(/\D/g, "").replace(/^91/, "")}`;
    const { data: existing } = await supabase
      .from("farmers")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle();
    if (existing)
      throw new HttpError(409, "This mobile number is already registered");
    const { data: farmer, error } = await supabase
      .from("farmers")
      .insert({
        name: input.name,
        mobile,
        pincode: input.pincode,
        state: input.state,
        district: input.district,
        mandal: input.mandal,
        village: input.village,
        language: input.language,
        consent: true,
        consent_at: new Date().toISOString(),
        consent_text_version: input.consent_text_version,
        source: input.source,
      })
      .select("id,farmer_code")
      .single();
    if (error || !farmer)
      throw new HttpError(500, "Unable to save registration");
    const { error: interestError } = await supabase
      .from("farmer_interests")
      .insert(
        input.interests.map((interest_id) => ({
          farmer_id: farmer.id,
          interest_id,
        }))
      );
    if (interestError) {
      await supabase.from("farmers").delete().eq("id", farmer.id);
      throw new HttpError(500, "Unable to save selected interests");
    }
    await supabase.from("audit_logs").insert({
      entity_type: "farmer",
      entity_id: farmer.id,
      action: "registered",
      actor: "website",
      metadata: { source: input.source, language: input.language },
    });
    let whatsapp: { queued: boolean; messageId?: string; reason?: string } = {
      queued: false,
      reason: "WhatsApp sending is disabled",
    };
    try {
      const message = await sendInvitationMessage(farmer.id);
      whatsapp = { queued: true, messageId: message.id };
    } catch (error) {
      whatsapp = {
        queued: false,
        reason:
          error instanceof Error ? error.message : "Message could not be sent",
      };
    }
    res.status(201).json({
      success: true,
      data: { id: farmer.id, farmerCode: farmer.farmer_code, whatsapp },
    });
  })
);
