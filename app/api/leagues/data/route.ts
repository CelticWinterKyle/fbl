// ─── /api/leagues/data ────────────────────────────────────────────────────────
// Unified endpoint: fans out to every platform the user has connected,
// returns a normalized array of platform league objects the dashboard consumes.
// The per-platform fetchers live in lib/leagueData.ts, shared with the
// snapshot-refresh cron so user requests are usually pure cache reads.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readUserLeagues,
  readSleeperConnection,
  readSleeperLeagues,
  readEspnConnections,
} from "@/lib/tokenStore/index";
import {
  getYahooData,
  getSleeperData,
  getEspnData,
  isError,
  type FetchOutcome,
  type PlatformLeagueData,
  type PlatformError,
} from "@/lib/leagueData";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { runSeasonRollover } from "@/lib/seasonRollover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Re-exported for existing importers of the route's types.
export type { PlatformLeagueData, PlatformError, PlatformMatchup, PlatformTeam } from "@/lib/leagueData";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!(await checkUserRateLimit(userId, "leagues-data", 60, 60))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;

  // Read all connections in parallel
  const [yahooBefore, sleeperConn, sleeperBefore, espnConns] = await Promise.all([
    readUserLeagues(userId),
    readSleeperConnection(userId),
    readSleeperLeagues(userId),
    readEspnConnections(userId),
  ]);

  // Yahoo/Sleeper mint new league ids each season; swap any stored id whose
  // league has renewed (negative-cached, so this is normally KV reads only).
  const { yahooLeagues, sleeperLeagues } = await runSeasonRollover(userId, {
    yahooLeagues: yahooBefore,
    sleeperLeagues: sleeperBefore,
  });

  // Fan out to all leagues across every connected platform
  const fetches: Promise<FetchOutcome | null>[] = [];

  for (const leagueKey of yahooLeagues) {
    fetches.push(getYahooData(userId, leagueKey, week));
  }
  if (sleeperConn) {
    for (const leagueId of sleeperLeagues) {
      fetches.push(getSleeperData(leagueId, week));
    }
  }
  for (const espnConn of espnConns) {
    fetches.push(
      getEspnData(
        { leagueId: espnConn.leagueId, season: espnConn.season, espnS2: espnConn.espnS2, swid: espnConn.swid, espnToken: espnConn.espnToken },
        week,
        userId
      )
    );
  }

  const results = await Promise.allSettled(fetches);

  // Partial failures are isolated per league: a platform that's down (or whose
  // auth expired) becomes an entry in `errors` instead of silently disappearing,
  // while every healthy league still renders.
  const platforms: PlatformLeagueData[] = [];
  const errors: PlatformError[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || r.value === null) continue;
    if (isError(r.value)) errors.push(r.value);
    else platforms.push(r.value);
  }

  const res = NextResponse.json({
    ok: true,
    platforms,
    errors,
    hasAnyData: platforms.length > 0,
  });

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
