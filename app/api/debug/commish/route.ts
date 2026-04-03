export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    { error: "global_token_removed", message: "This route requires per-user auth. Use /api/debug/yahoo/user instead." },
    { status: 410 }
  );
}
