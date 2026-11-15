import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Service-role client is server-only. Never expose this key to the browser.
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "X-Application-Name": "farmer-community-api" } },
  }
);
