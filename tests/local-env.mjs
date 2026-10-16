import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function localContainer() {
  const config = readFileSync(
    resolve(process.env.MUSICALE_LOCAL_WORKDIR ?? ".", "supabase/config.toml"),
    "utf8",
  );
  const project = config.match(
    /^project_id\s*=\s*"(musicale(?:-[a-z0-9-]+)?)"/m,
  )?.[1];
  if (!project) throw new Error("Tests require a local Musicale project");
  return "supabase_db_" + project;
}

export function localSettings() {
  const cli = fileURLToPath(
    new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
  );
  const result = execFileSync(
    process.execPath,
    [
      cli,
      "status",
      "-o",
      "json",
      ...(process.env.MUSICALE_LOCAL_WORKDIR
        ? ["--workdir", process.env.MUSICALE_LOCAL_WORKDIR]
        : []),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const settings = JSON.parse(result);
  if (
    !["http://127.0.0.1:55321", "http://127.0.0.1:56321"].includes(
      settings.API_URL,
    )
  )
    throw new Error(
      "UI tests require an isolated local Musicale backend on port 55321 or 56321.",
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
  };
}
