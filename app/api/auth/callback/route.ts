import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { validEmailTokenHash } from "@/lib/validation";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");

  // Email previews may follow GETs; only the confirmation form consumes a token.
  if (validEmailTokenHash(tokenHash)) {
    const response = NextResponse.redirect(
      `${getSiteUrl()}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}`,
    );
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (code) {
    try {
      const supabase = await getSupabaseServerClient();
      const result = await supabase?.auth.exchangeCodeForSession(code);
      if (result && !result.error)
        return NextResponse.redirect(`${getSiteUrl()}/today`);
    } catch {
      return NextResponse.redirect(
        `${getSiteUrl()}/login?message=${encodeURIComponent("Sign-in is temporarily unavailable. Please request a new link shortly.")}`,
      );
    }
  }

  return NextResponse.redirect(
    `${getSiteUrl()}/login?message=${encodeURIComponent("Sign-in link expired, was already used, or belongs to another browser. Request a new link here.")}`,
  );
}
