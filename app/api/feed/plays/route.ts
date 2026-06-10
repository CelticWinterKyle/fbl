// ─── /api/feed/plays ───────────────────────────────────────────────────────────
// Returns this week's NFL scoring plays (from ESPN's public sports API), parsed
// into structured players + yardage. NOT user-specific — the Live Feed overlays
// the signed-in user's rosters client-side. Cached globally on a short TTL so a
// busy Sunday doesn't hammer ESPN once per viewer.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withCache, TTL } from "@/lib/cache";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { isNflGameWindow } from "@/lib/gameWindow";
import { fetchNflScoringFeed } from "@/lib/nflPlays";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await checkUserRateLimit(userId, "feed-plays", 60, 60))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // 60s during games keeps it live; off the clock there's nothing changing, so
  // hold longer to avoid needless ESPN round-trips.
  const ttl = isNflGameWindow() ? TTL.LIVE_SCORE : TTL.STANDINGS;

  try {
    const feed = await withCache("nfl:scoringplays:current", ttl, fetchNflScoringFeed);
    const res = NextResponse.json({ ok: true, ...feed });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[feed/plays] failed:", e?.message);
    return NextResponse.json({ ok: false, error: "Couldn't load NFL plays right now." }, { status: 502 });
  }
}
