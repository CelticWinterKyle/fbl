// ─── /api/leagues/data ────────────────────────────────────────────────────────
// Unified endpoint: fans out to every platform the user has connected,
// returns a normalized array of platform league objects the dashboard consumes.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYahooAuthedForUser, getYahoo } from "@/lib/yahoo";
import {
  readUserLeagues,
  readSleeperConnection,
  readSleeperLeagues,
  readEspnConnections,
  readEspnRelayData,
  updateEspnConnectionCreds,
  forceRefreshTokenForUser,
} from "@/lib/tokenStore/index";
import { fetchLeagueData } from "@/lib/adapters/yahoo";
import { fetchSleeperLeagueData } from "@/lib/adapters/sleeper";
import { fetchEspnLeagueData, parseEspnLeagueRaw, exchangeEspnOneSiteToken } from "@/lib/adapters/espn";
import { withCache, TTL } from "@/lib/cache";
import { isNflGameWindow } from "@/lib/gameWindow";

const RELAY_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// During live game windows, cache league data for only 60s so scores stay fresh;
// otherwise hold the standard 15-min TTL. (LIVE_SCORE was defined but unused.)
function leagueDataTtl(): number {
  return isNflGameWindow() ? TTL.LIVE_SCORE : TTL.STANDINGS;
}

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

// Returned (instead of silently dropping the league) when a platform fetch
// fails, so the client can tell the user a league needs attention/reconnecting.
export type PlatformError = {
  kind: "error";
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  error: string;
};

type FetchOutcome = PlatformLeagueData | PlatformError;

function isError(o: FetchOutcome): o is PlatformError {
  return (o as PlatformError).kind === "error";
}

// A league fetch that comes back with no matchups AND no teams almost always
// means an auth/upstream failure rather than a real empty league (off-season
// still returns standings/teams). We use this to avoid caching junk.
function isEmptyLeagueData(d: { matchups: unknown[]; teams: unknown[] }): boolean {
  return d.matchups.length === 0 && d.teams.length === 0;
}

// ─── Per-platform fetchers ────────────────────────────────────────────────────

async function getYahooData(
  userId: string,
  leagueKey: string,
  week?: number
): Promise<FetchOutcome | null> {
  try {
    const data = await withCache(
      `unified:yahoo:${leagueKey}:${week ?? "cur"}`,
      leagueDataTtl(),
      async () => {
        const { yf, access } = await getYahooAuthedForUser(userId);
        if (!yf || !access) throw new Error("yahoo_auth_unavailable");

        let result = await fetchLeagueData(yf, leagueKey);

        // The Yahoo SDK swallows per-call 401s into empty sections, so an
        // expired token surfaces as an all-empty league. Force a token refresh
        // and retry once before giving up — and never cache the empty result.
        if (isEmptyLeagueData(result)) {
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            result = await fetchLeagueData(getYahoo(newToken), leagueKey);
          }
        }
        if (isEmptyLeagueData(result)) throw new Error("yahoo_empty_after_refresh");
        return result;
      }
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
    return {
      kind: "error",
      platform: "yahoo",
      leagueId: leagueKey,
      error: "Couldn't load this Yahoo league — try reconnecting Yahoo on the Leagues page.",
    };
  }
}

async function getSleeperData(
  leagueId: string,
  week?: number
): Promise<FetchOutcome | null> {
  try {
    const data = await withCache(
      `unified:sleeper:${leagueId}:${week ?? "cur"}`,
      leagueDataTtl(),
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
    return {
      kind: "error",
      platform: "sleeper",
      leagueId,
      error: "Couldn't load this Sleeper league right now — please try again shortly.",
    };
  }
}

function isEspnAuthError(e: unknown): boolean {
  return /private|espn_s2|swid|401|403/i.test(String((e as any)?.message ?? ""));
}

/**
 * Fetch ESPN league data, refreshing the ONESITE token server-side on an auth
 * failure. The access_token embedded in ESPN's cookie token expires ~hourly;
 * exchangeEspnOneSiteToken() re-mints a fresh one (and an espn_s2 for accounts
 * that have it) via Disney's refresh endpoint. On success we persist the fresh
 * espn_s2/swid so later reads skip the round-trip. Mirrors the Yahoo 401 retry.
 * This is what makes a connected private league "stay connected".
 */
async function fetchEspnWithRefresh(
  conn: { leagueId: string; season: number; espnS2?: string; swid?: string; espnToken?: string },
  week: number | undefined,
  userId?: string
) {
  const baseCreds =
    conn.espnS2 || conn.swid || conn.espnToken
      ? { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken }
      : undefined;

  try {
    return await fetchEspnLeagueData(conn.leagueId, conn.season, week, baseCreds);
  } catch (e) {
    if (!isEspnAuthError(e) || !conn.espnToken) throw e;

    const fresh = await exchangeEspnOneSiteToken(conn.espnToken);
    if (!fresh || (!fresh.accessToken && !fresh.espnS2)) throw e;

    const data = await fetchEspnLeagueData(conn.leagueId, conn.season, week, {
      espnS2: fresh.espnS2 ?? conn.espnS2,
      swid: fresh.swid ?? conn.swid,
      espnToken: conn.espnToken,
      accessToken: fresh.accessToken,
    });

    // Persist newly-minted espn_s2/swid so the next read doesn't re-hit Disney.
    if (userId && (fresh.espnS2 || fresh.swid)) {
      try {
        await updateEspnConnectionCreds(userId, conn.leagueId, {
          espnS2: fresh.espnS2 ?? conn.espnS2,
          swid: fresh.swid ?? conn.swid,
        });
      } catch { /* non-fatal */ }
    }
    return data;
  }
}

async function getEspnData(
  conn: { leagueId: string; season: number; espnS2?: string; swid?: string; espnToken?: string },
  week?: number,
  userId?: string
): Promise<FetchOutcome | null> {
  try {
    // Check relay cache first — data synced by the browser extension.
    // This is the path for private leagues on new ESPN accounts (no espn_s2).
    if (userId) {
      const relay = await readEspnRelayData(userId, conn.leagueId);
      const isUsable =
        relay &&
        relay.leagueId === conn.leagueId &&
        Date.now() - relay.synced < RELAY_MAX_AGE_MS;

      if (isUsable && relay) {
        const data = parseEspnLeagueRaw(relay.raw, relay.leagueId, relay.season, week);
        return normalizeParsed(data, conn.leagueId);
      }
    }

    const data = await withCache(
      `unified:espn:${conn.leagueId}:${conn.season}:${week ?? "cur"}`,
      leagueDataTtl(),
      () => fetchEspnWithRefresh(conn, week, userId)
    );

    return normalizeParsed(data, conn.leagueId);
  } catch (e) {
    const msg = String((e as any)?.message ?? "");
    console.error("[leagues/data] ESPN fetch failed:", msg);
    // ESPN cookies (espn_s2/SWID) expire frequently — give a reconnect hint
    // rather than letting the league silently vanish from the dashboard.
    const isAuth = /private|espn_s2|SWID|401|403/i.test(msg);
    return {
      kind: "error",
      platform: "espn",
      leagueId: conn.leagueId,
      error: isAuth
        ? "Your ESPN connection expired — reconnect this league (re-sync the extension or refresh espn_s2/SWID)."
        : "Couldn't load this ESPN league right now — please try again shortly.",
    };
  }
}

function normalizeParsed(
  data: Awaited<ReturnType<typeof import("@/lib/adapters/espn").fetchEspnLeagueData>>,
  leagueId: string
): PlatformLeagueData {
  return {
    platform: "espn",
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
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam ? Number(weekParam) : undefined;

  // Read all connections in parallel
  const [yahooLeagues, sleeperConn, sleeperLeagues, espnConns] = await Promise.all([
    readUserLeagues(userId),
    readSleeperConnection(userId),
    readSleeperLeagues(userId),
    readEspnConnections(userId),
  ]);

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
