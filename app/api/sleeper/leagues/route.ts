import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import {
  readSleeperConnection,
  saveSleeperLeague,
  readSleeperLeague,
} from "@/lib/tokenStore/index";
import {
  fetchSleeperLeaguesForUser,
  currentNflSeason,
} from "@/lib/adapters/sleeper";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

/** GET /api/sleeper/leagues — list available leagues for the connected Sleeper user */
export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  const connection = await readSleeperConnection(userId);
  if (!connection) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
  }

  const seasonParam = req.nextUrl.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : currentNflSeason();

  try {
    const leagues = await withCache(
      `sleeper:leagues:${connection.sleeperId}:${season}`,
      TTL.LEAGUE_META,
      () => fetchSleeperLeaguesForUser(connection.sleeperId, season)
    );

    const selectedLeagueId = await readSleeperLeague(userId);

    const res = NextResponse.json({
      ok: true,
      username: connection.username,
      season,
      selectedLeagueId,
      leagues: leagues.map((l) => ({
        id: l.league_id,
        name: l.name,
        season: l.season,
        status: l.status,
        teamCount: l.total_rosters,
      })),
    });

    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", message: e?.message || String(e) },
      { status: 502 }
    );
  }
}

/** POST /api/sleeper/leagues — select active Sleeper league */
export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const leagueId = String(body.leagueId ?? "").trim();

  if (!leagueId) {
    return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });
  }

  await saveSleeperLeague(userId, leagueId);

  const res = NextResponse.json({ ok: true, leagueId });
  provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}
