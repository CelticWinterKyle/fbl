import { NextResponse } from "next/server";
import { validateYahooEnvironment } from "@/lib/envCheck";

export const dynamic = "force-dynamic";

export async function GET() {
  const envValidation = validateYahooEnvironment();

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    environment: {
      yahoo_configured: envValidation.valid,
      missing_vars: envValidation.missing,
      kv_available: !!process.env.KV_REST_API_URL,
      skip_yahoo: process.env.SKIP_YAHOO === "1",
    },
    status: envValidation.valid ? "healthy" : "degraded",
  });
}
