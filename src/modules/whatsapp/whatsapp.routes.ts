import { Router } from "express";
import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";
import { asyncHandler, HttpError } from "../../utils/http.js";
import {
  sendInvitationMessage,
  //   verifyMetaSignature,
} from "./whatsapp.service.js";
export const whatsappRouter = Router();
whatsappRouter.get(
  "/messages",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    let q = supabase
      .from("whatsapp_messages")
      .select("*,farmers(farmer_code,name,mobile)", { count: "exact" });
    if (typeof req.query.status === "string")
      q = q.eq("status", req.query.status);
    if (typeof req.query.search === "string" && req.query.search)
      q = q.ilike("phone", `%${req.query.search}%`);
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) throw new HttpError(500, "Unable to load WhatsApp messages");
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
whatsappRouter.post(
  "/send/:farmerId",
  asyncHandler(async (req, res) => {
    const farmerId = req.params.farmerId;

    if (typeof farmerId !== "string" || !farmerId.trim()) {
      throw new HttpError(400, "Invalid farmer ID");
    }

    const record = await sendInvitationMessage(farmerId);

    res.status(202).json({
      success: true,
      data: record,
    });
  })
);
whatsappRouter.post(
  "/retry/:messageId",
  asyncHandler(async (req, res) => {
    const messageId = req.params.messageId;
    if (typeof messageId !== "string" || !messageId.trim()) {
      throw new HttpError(400, "Invalid message ID");
    }
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("farmer_id,status")
      .eq("id", messageId)
      .single();
    if (error || !data) throw new HttpError(404, "Message not found");
    if (data.status !== "failed")
      throw new HttpError(409, "Only failed messages can be retried");
    const farmerId = req.params.farmerId;

    if (typeof farmerId !== "string" || !farmerId.trim()) {
      throw new HttpError(400, "Invalid farmer ID");
    }

    const record = await sendInvitationMessage(farmerId);
    res.status(202).json({ success: true, data: record });
  })
);
export const whatsappWebhookRouter = Router();
whatsappWebhookRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    typeof challenge === "string"
  ) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});
whatsappWebhookRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const raw = req.body as Buffer;
    if (
      !Buffer.isBuffer(raw)
      //   !verifyMetaSignature(raw, req.header("x-hub-signature-256"))
    )
      throw new HttpError(401, "Invalid Meta webhook signature");
    const body = JSON.parse(raw.toString("utf8"));
    for (const entry of body.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const status of change.value?.statuses ?? []) {
          const mapped =
            status.status === "read"
              ? "read"
              : status.status === "delivered"
              ? "delivered"
              : status.status === "failed"
              ? "failed"
              : status.status === "sent"
              ? "sent"
              : null;
          if (!mapped) continue;
          const update: any = { status: mapped };
          const at = status.timestamp
            ? new Date(Number(status.timestamp) * 1000).toISOString()
            : new Date().toISOString();
          if (mapped === "delivered") update.delivered_at = at;
          if (mapped === "read") update.read_at = at;
          if (mapped === "failed")
            update.error_message = JSON.stringify(status.errors ?? []);
          await supabase
            .from("whatsapp_messages")
            .update(update)
            .eq("message_id", status.id);
        }
    res.sendStatus(200);
  })
);
