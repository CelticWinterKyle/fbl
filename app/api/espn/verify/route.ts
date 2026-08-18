// ─── POST /api/espn/verify ────────────────────────────────────────────────────
// On-demand "is my ESPN connection actually working" check for the signed-in
// user's own connections.
//
// This exists because the Leagues page had no way to answer that question. It
// showed "Syncing via FBL Extension" whenever the extension had ever pushed a
// snapshot, which is not the same thing: the app serves a relay snapshot for
// six hours without contacting ESPN at all, so a connection whose credentials
// died reads as perfectly healthy right up until the snapshot goes stale.
// Waiting for the nightly cron to find out is too slow to debug against.
//
// Runs the same checks the keepalive cron runs (lib/espnVerify.ts) and
// persists the same health records, so the page and the cron cannot disagree.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { verifyEspnForUser } from "@/lib/espnVerify";
import { checkUserRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Each call hits ESPN once or twice per connected league, so this is not a
  // button to lean on. Generous enough to debug with, tight enough that a
  // stuck retry loop cannot hammer ESPN on the user's behalf.
  if (!(await checkUserRateLimit(userId, "espn-verify", 10, 600))) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Too many checks. Try again in a few minutes." },
      { status: 429 }
    );
  }

  try {
    const results = await verifyEspnForUser(userId);
    return NextResponse.json({
      ok: true,
      checkedAt: Date.now(),
      healthy: results.filter((r) => r.ok).length,
      total: results.length,
      leagues: results,
    });
  } catch (e) {
    console.error("[espn/verify]", (e as any)?.message || e);
    return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 500 });
  }
}
