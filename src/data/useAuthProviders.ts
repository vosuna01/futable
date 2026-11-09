import { useEffect, useState } from "react";
import { authSettings } from "./supabase";

/** Public provider settings: never infer readiness from a button or build flag. */
export function useAuthProviders() {
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    let active = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      if (!authSettings || !navigator.onLine) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(authSettings.url, {
          headers: { apikey: authSettings.publishableKey },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Auth settings unavailable");
        const settings = await response.json();
        if (active && !controller.signal.aborted)
          setGoogle(settings.external?.google === true);
      } catch {
        if (active && request === controller) setGoogle(false);
      } finally {
        clearTimeout(timeout);
      }
    };
    const onFocus = () => void refresh();
    void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      active = false;
      request?.abort();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, []);
  return { google };
}
