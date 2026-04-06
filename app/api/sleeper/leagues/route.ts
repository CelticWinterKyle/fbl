import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readSleeperConnection,
  addSleeperLeague,
  removeSleeperLeague,
  readSleeperLeagues,
  saveMyTeam,
} from "@/lib/tokenStore/index";
import {
  fetchSleeperLeaguesForUser,
  currentNflSeason,
} from "@/lib/adapters/sleeper";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

// ─── Auto-detect which Sleeper roster belongs to the user ────────────────────

async function autoDetectSleeperMyTeam(
  userId: string,
  leagueId: string,
  sleeperId: string
): Promise<{ teamKey: string; teamName: string } | null> {
  try {
    const [rosters, users] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`).then((r) => r.json()),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`).then((r) => r.json()),
    ]);

    const myRoster = (rosters as any[]).find((r: any) => r.owner_id === sleeperId);
    if (!myRoster) return null;

    const me = (users as any[]).find((u: any) => u.user_id === sleeperId);
    const teamName: string =
      myRoster.metadata?.team_name ??
      `${me?.display_name ?? me?.username ?? "My"} Team`;

    const result = { teamKey: String(myRoster.roster_id), teamName };
    await saveMyTeam(userId, "sleeper", result, leagueId);
    return result;
  } catch (e) {
    console.error("[sleeper/leagues] auto-detect error:", (e as any)?.message);
    return null;
  }
}

// ─── GET — list available leagues ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const connection = await readSleeperConnection(userId);
  if (!connection) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });

  const seasonParam = req.nextUrl.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : currentNflSeason();

  try {
    const [leagues, selectedLeagues] = await Promise.all([
      withCache(
        `sleeper:leagues:${connection.sleeperId}:${season}`,
        TTL.LEAGUE_META,
        () => fetchSleeperLeaguesForUser(connection.sleeperId, season)
      ),
      readSleeperLeagues(userId),
    ]);

    return NextResponse.json({
      ok: true,
      username: connection.username,
      season,
      selectedLeagues,
      leagues: leagues.map((l) => ({
        id: l.league_id,
        name: l.name,
        season: l.season,
        status: l.status,
        teamCount: l.total_rosters,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", message: e?.message || String(e) },
      { status: 502 }
    );
  }
}

// ─── POST — add a league ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const connection = await readSleeperConnection(userId);
  if (!connection) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leagueId = String(body.leagueId ?? "").trim();
  if (!leagueId) return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });

  await addSleeperLeague(userId, leagueId);

  const myTeam = await autoDetectSleeperMyTeam(userId, leagueId, connection.sleeperId);

  return NextResponse.json({ ok: true, leagueId, myTeam });
}

// ─── DELETE — remove a league ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leagueId = String(body.leagueId ?? "").trim();
  if (!leagueId) return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });

  await removeSleeperLeague(userId, leagueId);
  return NextResponse.json({ ok: true, leagueId });
}
