import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function localSettings() {
  const cli = fileURLToPath(
    new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
  );
  const result = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const settings = JSON.parse(result);
  if (settings.API_URL !== "http://127.0.0.1:55321")
    throw new Error(
      "UI tests require the isolated local Musicale Supabase project on port 55321.",
    );
  return settings;
}
export function localAppEnv() {
  const settings = localSettings();
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: settings.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: settings.ANON_KEY,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    MUSICALE_TIMEZONE: "UTC",
    YOUTUBE_API_KEY: "", // Browser regressions must not consume real API quota.
  };
}
