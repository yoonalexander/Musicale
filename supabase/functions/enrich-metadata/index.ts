import { createClient } from "@supabase/supabase-js";
import { runMetadataJob } from "../../../lib/metadata-jobs.ts";

Deno.serve(async (request: Request) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("metadata_worker_config")
    .select("secret")
    .eq("id", true)
    .single();
  if (
    request.method !== "POST" ||
    error ||
    !data?.secret ||
    request.headers.get("x-metadata-secret") !== data.secret
  )
    return new Response("Unauthorized", { status: 401 });
  const results = [];
  try {
    // A short resumable batch fits the platform request budget; the queue owns retries.
    const started = Date.now();
    for (let i = 0; i < 10 && Date.now() - started < 40000; i++) {
      const result = await runMetadataJob(db);
      results.push(result);
      if (result.status === "idle") break;
    }
    return Response.json({ results });
  } catch {
    return Response.json(
      { error: "Metadata worker failed; unfinished leases will retry." },
      { status: 503 },
    );
  }
});
