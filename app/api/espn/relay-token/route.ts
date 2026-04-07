// GET /api/espn/relay-token
// Issues a short-lived HMAC-signed token for the browser extension to use
// in relay requests. Requires Clerk auth — extension calls this while on the FBL page.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function signRelayToken(userId: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${timestamp}`)
    .digest("hex");
  return `${userId}:${timestamp}:${hmac}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const token = signRelayToken(userId, secret);
  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours

  return NextResponse.json({ ok: true, token, expiresAt });
}
