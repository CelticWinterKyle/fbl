// POST /api/rosters/batch
// Fetches up to 24 rosters in one request so the feed does not fan out N
// individual /api/roster/{teamKey} calls. Reuses the exact same per-platform
// fetch + cache logic (and cache keys) as the single roster route.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRosterForUser } from "@/lib/rosterData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_ITEMS = 24;
const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);

type BatchItem = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueKey: string;
  teamKey: string;
};

function isValidItem(item: unknown): item is BatchItem {
  if (!item || typeof item !== "object") return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.platform === "string" &&
    PLATFORMS.has(i.platform) &&
    typeof i.leagueKey === "string" &&
    i.leagueKey.length > 0 &&
    typeof i.teamKey === "string" &&
    i.teamKey.length > 0
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const items: unknown = body?.items;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_ITEMS ||
    !items.every(isValidItem)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const settled = await Promise.allSettled(
    items.map((item) =>
      getRosterForUser(userId, {
        platform: item.platform,
        teamKey: item.teamKey,
        leagueKey: item.leagueKey,
        requestedWeek: null,
      })
    )
  );

  const rosters = settled.map((outcome, i) => {
    const { platform, leagueKey, teamKey } = items[i];
    if (outcome.status === "rejected") {
      return {
        platform,
        leagueKey,
        teamKey,
        roster: null,
        error: String((outcome.reason as any)?.message ?? outcome.reason ?? "fetch_failed"),
      };
    }
    const result = outcome.value;
    if (!result.ok) {
      return { platform, leagueKey, teamKey, roster: null, error: result.error ?? result.reason };
    }
    return { platform, leagueKey, teamKey, roster: result };
  });

  const res = NextResponse.json({ ok: true, rosters });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
