import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    if (!isSupabaseConfigured())
      return NextResponse.json({ status: "preview" }, { status: 503, headers });
    const db = await getSupabaseServerClient();
    const { data, error } = await db!.rpc("get_product_readiness");
    if (error || !data) throw new Error("Readiness unavailable");
    const ready = data.today_playable && data.buffer_days >= 14;
    return NextResponse.json(
      { status: ready ? "ready" : "attention", ...data },
      { status: ready ? 200 : 503, headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
