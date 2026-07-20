// ─── Shared per-platform league data fetchers ────────────────────────────────
// Used by /api/leagues/data (user requests) and /api/cron/refresh-leagues
// (background snapshot refresh). Extracted from the route so both paths share
// identical cache keys, TTLs, normalization, and retry logic.

import { getYahooAuthedForUser, getYahoo } from "@/lib/yahoo";
import {
  readEspnRelayData,
  readEspnRelaySnapshot,
  updateEspnConnectionCreds,
  updateEspnConnectionSeason,
  forceRefreshTokenForUser,
} from "@/lib/tokenStore/index";
import { espnSeasonsToTry } from "@/lib/season";
import { fetchLeagueData } from "@/lib/adapters/yahoo";
import { fetchSleeperLeagueData } from "@/lib/adapters/sleeper";
import {
  fetchEspnLeagueData,
  parseEspnLeagueRaw,
  exchangeEspnOneSiteToken,
} from "@/lib/adapters/espn";
import { withCache, refreshCache, TTL } from "@/lib/cache";
import { isNflGameWindow } from "@/lib/gameWindow";

export const RELAY_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// During live game windows, cache league data for only 60s so scores stay fresh;
// otherwise hold the standard 15-min TTL.
export function leagueDataTtl(): number {
  return isNflGameWindow() ? TTL.LIVE_SCORE : TTL.STANDINGS;
}

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

export type FetchOutcome = PlatformLeagueData | PlatformError;

export function isError(o: FetchOutcome): o is PlatformError {
  return (o as PlatformError).kind === "error";
}

// A league fetch that comes back with no matchups AND no teams almost always
// means an auth/upstream failure rather than a real empty league (off-season
// still returns standings/teams). We use this to avoid caching junk.
function isEmptyLeagueData(d: { matchups: unknown[]; teams: unknown[] }): boolean {
  return d.matchups.length === 0 && d.teams.length === 0;
}

export type FetchOpts = {
  /** Cron mode: always run the fetcher and rewrite the snapshot. */
  force?: boolean;
};

function cached<T>(force: boolean | undefined, key: string, ttl: number, fetcher: () => Promise<T>) {
  return force ? refreshCache(key, ttl, fetcher) : withCache(key, ttl, fetcher);
}

// ─── Per-platform fetchers ────────────────────────────────────────────────────

export async function getYahooData(
  userId: string,
  leagueKey: string,
  week?: number,
  opts?: FetchOpts
): Promise<FetchOutcome | null> {
  try {
    const data = await cached(
      opts?.force,
      // v2: 2026-06-10 shape fixes (standings array + points.total); the v1
      // entries held zeroed scores parsed by the old code.
      `unified:yahoo:v2:${leagueKey}:${week ?? "cur"}`,
      leagueDataTtl(),
      async () => {
        const { yf, access } = await getYahooAuthedForUser(userId);
        if (!yf || !access) throw new Error("yahoo_auth_unavailable");

        let result = await fetchLeagueData(yf, leagueKey, week);

        // The Yahoo SDK swallows per-call 401s into empty sections, so an
        // expired token surfaces as an all-empty league. Force a token refresh
        // and retry once before giving up — and never cache the empty result.
        if (isEmptyLeagueData(result)) {
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            result = await fetchLeagueData(getYahoo(newToken), leagueKey, week);
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
      matchups: data.matchups.map((m: any) => ({
        id: `yahoo:${leagueKey}:${m.aK}v${m.bK}`,
        teamA: { name: m.aN, points: m.aP, projectedPoints: m.aProj ?? 0, key: m.aK },
        teamB: { name: m.bN, points: m.bP, projectedPoints: m.bProj ?? 0, key: m.bK },
      })),
      teams: data.teams.map((t: any) => ({
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
    console.error("[leagueData] Yahoo fetch failed:", (e as any)?.message);
    return {
      kind: "error",
      platform: "yahoo",
      leagueId: leagueKey,
      error: "Couldn't load this Yahoo league. Try reconnecting Yahoo on the Leagues page.",
    };
  }
}

export async function getSleeperData(
  leagueId: string,
  week?: number,
  opts?: FetchOpts
): Promise<FetchOutcome | null> {
  try {
    const data = await cached(
      opts?.force,
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
    console.error("[leagueData] Sleeper fetch failed:", (e as any)?.message);
    return {
      kind: "error",
      platform: "sleeper",
      leagueId,
      error: "Couldn't load this Sleeper league right now. Please try again shortly.",
    };
  }
}

function isEspnAuthError(e: unknown): boolean {
  return /private|espn_s2|swid|401|403/i.test(String((e as any)?.message ?? ""));
}

// ESPN sometimes answers 400 (not 401/403) when the embedded access_token has
// expired, so a persistent 400 is worth one re-mint attempt before giving up.
// Deliberately separate from isEspnAuthError: a real 400 (bad league ID) must
// keep the generic error message, not the "reconnect" hint.
function isEspnBadRequest(e: unknown): boolean {
  return /ESPN returned 400/.test(String((e as any)?.message ?? ""));
}

/**
 * Fetch ESPN league data, refreshing the ONESITE token server-side on an auth
 * failure. The access_token embedded in ESPN's cookie token expires ~hourly;
 * exchangeEspnOneSiteToken() re-mints a fresh one (and an espn_s2 for accounts
 * that have it) via Disney's refresh endpoint. On success we persist the fresh
 * espn_s2/swid so later reads skip the round-trip. Mirrors the Yahoo 401 retry.
 * This is what makes a connected private league "stay connected".
 */
export async function fetchEspnWithRefresh(
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
    if ((!isEspnAuthError(e) && !isEspnBadRequest(e)) || !conn.espnToken) throw e;

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

// ── Season-probe negative cache ───────────────────────────────────────────────
// When a stored ESPN season falls behind the calendar, the fetch path probes
// the current season first (ESPN serves the old season's data forever without
// erroring, so failure-driven retry can't catch this). Probes that miss are
// negative-cached for 6 hours so we don't double ESPN traffic on every
// request between the season flip and the league's reactivation; the nightly
// espn-keepalive cron is the primary healer.

const SEASON_PROBE_MISS_TTL_S = 6 * 3600;
const probeMissMem = new Map<string, number>(); // dev fallback: key -> expiresAtMs

async function seasonProbeMissedRecently(leagueId: string, season: number): Promise<boolean> {
  const key = `espn:probe-miss:${leagueId}:${season}`;
  if (!process.env.KV_REST_API_URL) {
    const exp = probeMissMem.get(key);
    return typeof exp === "number" && exp > Date.now();
  }
  try {
    const { kv } = await import("@/lib/kv");
    return (await kv.exists(key)) === 1;
  } catch {
    return false;
  }
}

async function recordSeasonProbeMiss(leagueId: string, season: number): Promise<void> {
  const key = `espn:probe-miss:${leagueId}:${season}`;
  if (!process.env.KV_REST_API_URL) {
    probeMissMem.set(key, Date.now() + SEASON_PROBE_MISS_TTL_S * 1000);
    return;
  }
  try {
    const { kv } = await import("@/lib/kv");
    await kv.set(key, 1, { ex: SEASON_PROBE_MISS_TTL_S });
  } catch {
    // Best-effort: worst case the probe repeats sooner.
  }
}

export async function getEspnData(
  conn: { leagueId: string; season: number; espnS2?: string; swid?: string; espnToken?: string },
  week?: number,
  userId?: string,
  opts?: FetchOpts
): Promise<FetchOutcome | null> {
  try {
    // Check relay cache first — data synced by the browser extension.
    // This is the path for private leagues on new ESPN accounts (no espn_s2).
    if (userId && !opts?.force) {
      // Pre-parsed snapshot first (current week only): tiny KV read, skips the
      // potentially hundreds-of-KB raw blob entirely.
      if (week === undefined) {
        const snap = await readEspnRelaySnapshot(userId, conn.leagueId);
        const snapUsable =
          snap &&
          snap.leagueId === conn.leagueId &&
          snap.parsed != null &&
          Date.now() - snap.synced < RELAY_MAX_AGE_MS;
        if (snapUsable && snap) {
          const data = snap.parsed as Awaited<ReturnType<typeof fetchEspnLeagueData>>;
          return normalizeParsed(data, conn.leagueId);
        }
      }

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

    // Season rollover guard: prefer the current season once the stored one
    // falls behind; fall back to the stored season while ESPN hasn't created
    // the new season's league entry yet.
    for (const season of espnSeasonsToTry(conn.season)) {
      const isProbe = season !== conn.season;
      if (isProbe && (await seasonProbeMissedRecently(conn.leagueId, season))) continue;

      try {
        const data = await cached(
          opts?.force,
          `unified:espn:${conn.leagueId}:${season}:${week ?? "cur"}`,
          leagueDataTtl(),
          () => fetchEspnWithRefresh({ ...conn, season }, week, userId)
        );
        if (isProbe && isEmptyLeagueData(data)) {
          // Answers but with nothing in it: treat as not-yet-reactivated.
          await recordSeasonProbeMiss(conn.leagueId, season);
          continue;
        }
        if (isProbe && userId) {
          void updateEspnConnectionSeason(userId, conn.leagueId, season).catch(() => {});
        }
        return normalizeParsed(data, conn.leagueId);
      } catch (e) {
        if (!isProbe) throw e; // stored-season failures keep the existing error surface
        await recordSeasonProbeMiss(conn.leagueId, season);
      }
    }
    throw new Error("ESPN fetch failed for all candidate seasons");
  } catch (e) {
    const msg = String((e as any)?.message ?? "");
    console.error("[leagueData] ESPN fetch failed:", msg);
    // ESPN cookies (espn_s2/SWID) expire frequently — give a reconnect hint
    // rather than letting the league silently vanish from the dashboard.
    const isAuth = /private|espn_s2|SWID|401|403/i.test(msg);
    return {
      kind: "error",
      platform: "espn",
      leagueId: conn.leagueId,
      error: isAuth
        ? "Your ESPN connection expired. Reconnect this league (re-sync the extension or refresh espn_s2/SWID)."
        : "Couldn't load this ESPN league right now. Please try again shortly.",
    };
  }
}

export function normalizeParsed(
  data: Awaited<ReturnType<typeof fetchEspnLeagueData>>,
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
