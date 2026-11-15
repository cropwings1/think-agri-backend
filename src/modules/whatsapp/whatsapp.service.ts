import { env } from "../../config/env.js";
import { supabase } from "../../config/supabase.js";
import { HttpError } from "../../utils/http.js";
type Locale = "en" | "te" | "kn" | "hi";
const templateByLocale: Record<Locale, string> = {
  en: env.WHATSAPP_TEMPLATE_EN,
  te: env.WHATSAPP_TEMPLATE_TE,
  kn: env.WHATSAPP_TEMPLATE_KN,
  hi: env.WHATSAPP_TEMPLATE_HI,
};
export async function sendInvitationMessage(farmerId: string) {
  if (env.WHATSAPP_ENABLED !== "true")
    throw new HttpError(503, "WhatsApp sending is disabled");
  if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN)
    throw new HttpError(503, "WhatsApp API credentials are incomplete");
  const { data: farmer, error } = await supabase
    .from("farmers")
    .select("id,mobile,language,consent")
    .eq("id", farmerId)
    .single();
  if (error || !farmer) throw new HttpError(404, "Farmer not found");
  if (!farmer.consent)
    throw new HttpError(403, "Farmer has not consented to WhatsApp messages");
  const { data: rows } = await supabase
    .from("farmer_interests")
    .select("interests(communities(id,name,invite_url,active,sort_order))")
    .eq("farmer_id", farmerId);
  const groups = (rows ?? [])
    .flatMap((r: any) => r.interests?.communities ?? [])
    .filter((c: any) => c.active && c.invite_url)
    .sort((a: any, b: any) => a.sort_order - b.sort_order);
  if (!groups.length)
    throw new HttpError(
      400,
      "No active WhatsApp invitations found for selected interests"
    );
  const locale = (
    ["en", "te", "kn", "hi"].includes(farmer.language) ? farmer.language : "en"
  ) as Locale;
  // Approved template body must have matching placeholders. For arbitrary group counts, prefer one personalized invitation page URL.
  const maxLinks = 5;
  const selected = groups.slice(0, maxLinks);
  const parameters = [
    { type: "text", text: farmer.mobile },
    ...selected.flatMap((g: any) => [
      { type: "text", text: g.name },
      { type: "text", text: g.invite_url },
    ]),
  ];
  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: farmer.mobile.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateByLocale[locale],
          language: { code: locale },
          components: [{ type: "body", parameters }],
        },
      }),
    }
  );
  const payload: any = await response.json();
  const messageId = payload?.messages?.[0]?.id ?? null;
  const { data: record, error: logError } = await supabase
    .from("whatsapp_messages")
    .insert({
      farmer_id: farmerId,
      phone: farmer.mobile,
      template_name: templateByLocale[locale],
      language: locale,
      status: response.ok ? "sent" : "failed",
      message_id: messageId,
      error_message: response.ok ? null : JSON.stringify(payload),
      metadata: {
        community_ids: selected.map((g: any) => g.id),
        links_included: selected.length,
        omitted_links: Math.max(0, groups.length - selected.length),
      },
    })
    .select()
    .single();
  if (logError)
    throw new HttpError(
      500,
      "WhatsApp response received but message log could not be saved"
    );
  if (!response.ok)
    throw new HttpError(502, "WhatsApp API rejected the message", payload);
  return record;
}
