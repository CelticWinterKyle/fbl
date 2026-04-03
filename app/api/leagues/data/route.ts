// ─── /api/leagues/data ────────────────────────────────────────────────────────
// Unified endpoint: fans out to every platform the user has connected,
// returns a normalized array of platform league objects the dashboard consumes.

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import {
  readUserLeague,
  readSleeperConnection,
  readSleeperLeague,
  readEspnConnection,
} from "@/lib/tokenStore/index";
import { fetchLeagueData } from "@/lib/adapters/yahoo";
import { fetchSleeperLeagueData } from "@/lib/adapters/sleeper";
import { fetchEspnLeagueData } from "@/lib/adapters/espn";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Shared shape returned for every platform ─────────────────────────────────

export type PlatformMatchup = {
  id: string;
  teamA: { name: string; points: number; projectedPoints: number; key: string };
  teamB: { name: string; points: number; projectedPoints: number; key: string };
};

export type PlatformTeam = {
  name: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
};

export type PlatformLeagueData = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  leagueName: string;
  currentWeek: number;
  season: number;
  matchups: PlatformMatchup[];
  teams: PlatformTeam[];
  rosterPositions: { position: string; count: number }[];
};

// ─── Per-platform fetchers ────────────────────────────────────────────────────

async function getYahooData(
  userId: string,
  leagueKey: string,
  week?: number
): Promise<PlatformLeagueData | null> {
  try {
    const { yf } = await getYahooAuthedForUser(userId);
    if (!yf) return null;

    const data = await withCache(
      `unified:yahoo:${leagueKey}:${week ?? "cur"}`,
      TTL.STANDINGS,
      () => fetchLeagueData(yf, leagueKey)
    );

    const meta = data.meta?.league?.[0] ?? data.meta ?? {};
    const currentWeek = week ?? Number(meta.current_week ?? meta.week ?? 1);
    const season = Number(meta.season ?? new Date().getFullYear());
    const leagueName: string =
      meta.name ?? meta.league_name ?? leagueKey.split(".l.")[1] ?? leagueKey;

    return {
      platform: "yahoo",
      leagueId: leagueKey,
      leagueName,
      currentWeek,
      season,
      matchups: data.matchups.map((m) => ({
        id: `yahoo:${leagueKey}:${m.aK}v${m.bK}`,
        teamA: { name: m.aN, points: m.aP, projectedPoints: 0, key: m.aK },
        teamB: { name: m.bN, points: m.bP, projectedPoints: 0, key: m.bK },
      })),
      teams: data.teams.map((t) => ({
        name: t.name,
        ownerName: t.owner,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        pointsFor: t.points,
      })),
      rosterPositions: data.rosterPositions,
    };
  } catch (e) {
    console.error("[leagues/data] Yahoo fetch failed:", (e as any)?.message);
    return null;
  }
}

async function getSleeperData(
  leagueId: string,
  week?: number
): Promise<PlatformLeagueData | null> {
  try {
    const data = await withCache(
      `unified:sleeper:${leagueId}:${week ?? "cur"}`,
      TTL.STANDINGS,
      () => fetchSleeperLeagueData(leagueId, week)
    );

    return {
      platform: "sleeper",
      leagueId,
      leagueName: data.meta.leagueName,
      currentWeek: data.meta.currentWeek,
      season: data.meta.season,
      matchups: data.matchups.map((m) => ({
        id: m.id,
        teamA: {
          name: m.teamA.teamName,
          points: m.teamA.points,
          projectedPoints: m.teamA.projectedPoints,
          key: m.teamA.platformTeamKey,
        },
        teamB: {
          name: m.teamB.teamName,
          points: m.teamB.points,
          projectedPoints: m.teamB.projectedPoints,
          key: m.teamB.platformTeamKey,
        },
      })),
      teams: data.teams.map((t) => ({
        name: t.name,
        ownerName: t.ownerName,
        wins: t.record.w,
        losses: t.record.l,
        ties: t.record.t,
        pointsFor: t.pointsFor,
      })),
      rosterPositions: data.rosterPositions,
    };
  } catch (e) {
    console.error("[leagues/data] Sleeper fetch failed:", (e as any)?.message);
    return null;
  }
}

async function getEspnData(
  conn: { leagueId: string; season: number; espnS2?: string; swid?: string },
  week?: number
): Promise<PlatformLeagueData | null> {
  try {
    const creds =
      conn.espnS2 || conn.swid
        ? { espnS2: conn.espnS2, swid: conn.swid }
        : undefined;

    const data = await withCache(
      `unified:espn:${conn.leagueId}:${conn.season}:${week ?? "cur"}`,
      TTL.STANDINGS,
      () => fetchEspnLeagueData(conn.leagueId, conn.season, week, creds)
    );

    return {
      platform: "espn",
      leagueId: conn.leagueId,
      leagueName: data.meta.leagueName,
      currentWeek: data.meta.currentWeek,
      season: data.meta.season,
      matchups: data.matchups.map((m) => ({
        id: m.id,
        teamA: {
          name: m.teamA.teamName,
          points: m.teamA.points,
          projectedPoints: m.teamA.projectedPoints,
          key: m.teamA.platformTeamKey,
        },
        teamB: {
          name: m.teamB.teamName,
          points: m.teamB.points,
          projectedPoints: m.teamB.projectedPoints,
          key: m.teamB.platformTeamKey,
        },
      })),
      teams: data.teams.map((t) => ({
        name: t.name,
        ownerName: t.ownerName,
        wins: t.record.w,
        losses: t.record.l,
        ties: t.record.t,
        pointsFor: t.pointsFor,
      })),
      rosterPositions: data.rosterPositions,
    };
  } catch (e) {
    console.error("[leagues/data] ESPN fetch failed:", (e as any)?.message);
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;

  // Read all connections in parallel
  const [yahooLeague, sleeperConn, sleeperLeague, espnConn] = await Promise.all([
    readUserLeague(userId),
    readSleeperConnection(userId),
    readSleeperLeague(userId),
    readEspnConnection(userId),
  ]);

  // Fan out to each connected platform
  const fetches: Promise<PlatformLeagueData | null>[] = [];

  if (yahooLeague) {
    fetches.push(getYahooData(userId, yahooLeague, week));
  }
  if (sleeperConn && sleeperLeague) {
    fetches.push(getSleeperData(sleeperLeague, week));
  }
  if (espnConn) {
    fetches.push(
      getEspnData(
        { leagueId: espnConn.leagueId, season: espnConn.season, espnS2: espnConn.espnS2, swid: espnConn.swid },
        week
      )
    );
  }

  const results = await Promise.allSettled(fetches);
  const platforms: PlatformLeagueData[] = results
    .filter((r): r is PromiseFulfilledResult<PlatformLeagueData> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  const res = NextResponse.json({
    ok: true,
    platforms,
    hasAnyData: platforms.length > 0,
  });

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}
