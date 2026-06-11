// ─── /api/cron/refresh-leagues ────────────────────────────────────────────────
// Vercel Cron: during NFL game windows, refresh the cached league snapshot for
// every registered league so user dashboard/feed requests are pure KV reads
// ("everyone reads, nobody fetches"). Outside game windows this is a no-op.
//
// Auth: Vercel sends "Authorization: Bearer ${CRON_SECRET}" when the env var is
// set on the project. Requests without it are rejected.

import { NextRequest, NextResponse } from "next/server";
import { listRegisteredLeagues } from "@/lib/leagueRegistry";
import { getYahooData, getSleeperData, getEspnData, isError } from "@/lib/leagueData";
import { readEspnConnections } from "@/lib/tokenStore/index";
import { isNflGameWindow } from "@/lib/gameWindow";
import { recordCronHeartbeat, reportCriticalError } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bound a single run; anything beyond this is logged and picked up next tick.
const MAX_LEAGUES_PER_RUN = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!isNflGameWindow() && !force) {
    await recordCronHeartbeat("refresh-leagues", "skipped: outside game window");
    return NextResponse.json({ ok: true, skipped: "outside_game_window" });
  }

  const all = await listRegisteredLeagues();
  const batch = all.slice(0, MAX_LEAGUES_PER_RUN);
  if (all.length > batch.length) {
    // Leagues beyond the cap serve stale scores during games: page it.
    void reportCriticalError(
      "refresh-leagues-cap",
      `${all.length} registered leagues exceed the ${MAX_LEAGUES_PER_RUN}/run cap; the rest refresh late. Raise the cap or shard the cron.`
    );
  }

  const results = await Promise.allSettled(
    batch.map(async (lg) => {
      if (lg.platform === "yahoo") {
        return getYahooData(lg.userId, lg.leagueId, undefined, { force: true });
      }
      if (lg.platform === "sleeper") {
        return getSleeperData(lg.leagueId, undefined, { force: true });
      }
      // espn: need the registered user's stored creds
      const conns = await readEspnConnections(lg.userId);
      const conn = conns.find((c) => c.leagueId === lg.leagueId);
      if (!conn) return null;
      return getEspnData(
        { leagueId: conn.leagueId, season: conn.season, espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken },
        undefined,
        lg.userId,
        { force: true }
      );
    })
  );

  let refreshed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && !isError(r.value)) refreshed++;
    else failed++;
  }

  console.log(`[cron/refresh-leagues] refreshed=${refreshed} failed=${failed} total=${all.length}`);
  await recordCronHeartbeat("refresh-leagues", `refreshed=${refreshed} failed=${failed} total=${all.length}`);
  return NextResponse.json({ ok: true, refreshed, failed, total: all.length });
}
