import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  JWT_SECRET: z.string().min(64),
  JWT_EXPIRES_IN: z.string().default("8h"),
  COOKIE_NAME: z.string().default("ta_admin_session"),
  COOKIE_SECURE: z.string().default("false"),
  WHATSAPP_ENABLED: z.string().default("false"),
  WHATSAPP_API_VERSION: z.string().default("vXX.X"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_TEMPLATE_EN: z.string().default("farmer_community_invites_en"),
  WHATSAPP_TEMPLATE_TE: z.string().default("farmer_community_invites_te"),
  WHATSAPP_TEMPLATE_KN: z.string().default("farmer_community_invites_kn"),
  WHATSAPP_TEMPLATE_HI: z.string().default("farmer_community_invites_hi"),
});
export const env = schema.parse(process.env);
