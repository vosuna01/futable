import { createClient } from "@supabase/supabase-js";
import backendSettings from "./backend-settings.json";
export const passwordFlow =
  typeof location !== "undefined" &&
  /type=(recovery|invite)/.test(location.hash);
// These are public client settings, protected by Auth, RLS and checked RPCs.
// Never place a secret key or service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL || backendSettings.url,
  key =
    import.meta.env.VITE_SUPABASE_ANON_KEY || backendSettings.publishableKey;
const customProject = url !== backendSettings.url;
export const emailConfirmationRequired =
  import.meta.env.VITE_EMAIL_CONFIRMATION_REQUIRED === "true" ||
  (import.meta.env.VITE_EMAIL_CONFIRMATION_REQUIRED !== "false" &&
    (customProject || backendSettings.emailConfirmationRequired));
export const emailDeliveryEnabled =
  import.meta.env.VITE_EMAIL_DELIVERY_ENABLED === "true" ||
  (import.meta.env.VITE_EMAIL_DELIVERY_ENABLED !== "false" &&
    (customProject || backendSettings.emailDeliveryEnabled));
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
