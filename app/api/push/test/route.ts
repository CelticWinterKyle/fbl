// ─── POST /api/push/test ──────────────────────────────────────────────────────
// Sends a test notification to the caller's own subscribed devices, so users
// can confirm the pipe works end to end. Rate limited to avoid abuse.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendPushToUser, readPushSubs } from "@/lib/push";
import { checkUserRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const allowed = await checkUserRateLimit(userId, "push-test", 5, 3600);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const subs = await readPushSubs(userId);
  if (subs.length === 0) {
    return NextResponse.json({ ok: false, error: "no_subscriptions" }, { status: 400 });
  }

  const result = await sendPushToUser(userId, {
    title: "League Blitz test",
    body: "Notifications are working on this device. See you on game day.",
    url: "/gameday",
    tag: "test",
  });
  return NextResponse.json({ ok: true, ...result });
}
