import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readEspnConnection } from "@/lib/tokenStore/index";
import { fetchEspnLeagueData } from "@/lib/adapters/espn";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** GET /api/espn/leagues — return current league data for connected ESPN league */
export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  const conn = await readEspnConnection(userId);
  if (!conn) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;

  try {
    const creds = conn.espnS2 || conn.swid
      ? { espnS2: conn.espnS2, swid: conn.swid }
      : undefined;

    const data = await withCache(
      `espn:league:${conn.leagueId}:${conn.season}:${week ?? "current"}`,
      TTL.STANDINGS,
      () => fetchEspnLeagueData(conn.leagueId, conn.season, week, creds)
    );

    const res = NextResponse.json({
      ok: true,
      leagueId: conn.leagueId,
      leagueName: data.meta.leagueName,
      season: conn.season,
      currentWeek: data.meta.currentWeek,
      matchups: data.matchups,
      teams: data.teams,
      meta: data.meta,
      settings: data.settings,
      rosterPositions: data.rosterPositions,
    });

    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  } catch (e: any) {
    const msg: string = e?.message || String(e);
    const isPrivate = msg.toLowerCase().includes("private");
    return NextResponse.json(
      {
        ok: false,
        error: isPrivate ? "private_league" : "fetch_failed",
        message: msg,
      },
      { status: isPrivate ? 403 : 502 }
    );
  }
}
