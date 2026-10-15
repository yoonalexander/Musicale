import type { NextConfig } from "next";

if (
  process.env.VERCEL_ENV === "preview" &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
)
  throw new Error(
    "Preview deployments must not have Supabase credentials. Remove both Supabase variables from the Preview environment.",
  );

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
