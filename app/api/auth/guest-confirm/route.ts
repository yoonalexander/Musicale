import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const failure = () =>
    NextResponse.redirect(
      `${getSiteUrl()}/login?message=${encodeURIComponent("Open the verification link in the browser where you played, or request a new sign-in link.")}`,
    );
  try {
    const db = await getSupabaseServerClient();
    if (!db) return failure();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user || user.is_anonymous || !user.email_confirmed_at)
      return failure();
    // Verification upgrades the already-owned guest session; refresh claims without swapping identities.
    const refreshed = await db.auth.refreshSession();
    if (
      refreshed.error ||
      refreshed.data.user?.id !== user.id ||
      refreshed.data.user.is_anonymous
    )
      return failure();
    return NextResponse.redirect(`${getSiteUrl()}/`);
  } catch {
    return failure();
  }
}
