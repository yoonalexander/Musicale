import { NextRequest, NextResponse } from "next/server";
import { analyticsEvents } from "@/lib/analytics";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  if (request.headers.get("origin") !== new URL(getSiteUrl()).origin)
    return new NextResponse(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 256)
    return new NextResponse(null, { status: 413 });
  const text = await request.text();
  if (text.length > 256) return new NextResponse(null, { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  // Older open tabs used this name for outbound clicks, never confirmed playback.
  if (body?.event === "preview_started") body.event = "listening_link_clicked";
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).length !== 1 ||
    !analyticsEvents.includes(body.event)
  )
    return new NextResponse(null, { status: 400 });
  const db = await getSupabaseServerClient();
  const {
    data: { user },
  } = await db!.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { error } = await db!.rpc("record_product_event", {
    p_event: body.event,
  });
  return new NextResponse(null, { status: error ? 503 : 204 });
}
