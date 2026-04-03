import { NextRequest, NextResponse } from "next/server";
import { validateYahooEnvironment } from "@/lib/envCheck";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: validateYahooEnvironment(),
    note: "Global token removed. Use /api/debug/yahoo/user for per-user token diagnostics.",
  }, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
