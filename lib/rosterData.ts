// ─── Shared per-platform roster fetcher ──────────────────────────────────────
// Used by /api/roster/[teamKey] (single roster) and /api/rosters/batch
// (batched fan-out). Extracted from the single route so both paths share
// identical cache keys, TTLs, normalization, and retry logic.

import { getYahooAuthedForUser, leagueKeyFromTeamKey } from "@/lib/yahoo";
import {
  forceRefreshTokenForUser,
  readEspnRelayData,
  readSleeperConnection,
  readEspnConnections,
} from "@/lib/tokenStore/index";
import { fetchRoster } from "@/lib/adapters/yahoo";
import { fetchEspnRoster, parseEspnRosterFromRaw } from "@/lib/adapters/espn";
import { fetchSleeperRoster } from "@/lib/adapters/sleeper";
import { withCache, TTL } from "@/lib/cache";

// ─── Helpers to normalise NormalizedPlayer → Player shape MatchupCard expects ─

function normalizedToCard(p: any) {
  return {
    name: p.name,
    position: p.position ?? p.slotPosition,
    team: p.nflTeam,
    actual: p.points ?? 0,
    points: p.points ?? 0,
    projection: p.projectedPoints ?? 0,
    projectedPoints: p.projectedPoints ?? 0,
    kickoffMs: p.kickoffMs ?? p.kickoff_ms ?? null,
    opponent: p.opponent ?? null,
    isHome: p.isHome ?? null,
    status: p.status ?? null,
  };
}

export type RosterPayload = {
  ok: true;
  teamKey: string;
  week?: number | null;
  roster: any[];
  players: any[];
  starters: any[];
  bench: any[];
  empty: boolean;
};

export type RosterFailure = {
  ok: false;
  status: number;
  reason: string;
  error?: string;
};

export type RosterResult = RosterPayload | RosterFailure;

function splitCards(all: any[], teamKey: string, week?: number): RosterPayload {
  const starters = all.filter((p) => p.position !== "BN" && p.position !== "IR");
  const bench = all.filter((p) => p.position === "BN" || p.position === "IR");
  return { ok: true, teamKey, week, roster: all, players: all, starters, bench, empty: all.length === 0 };
}

export async function getRosterForUser(
  userId: string,
  opts: {
    platform: string | null;
    teamKey: string;
    leagueKey?: string;
    /** Raw week query param (string); kept as-is so Yahoo cache keys match. */
    requestedWeek?: string | null;
  }
): Promise<RosterResult> {
  const { platform, teamKey, leagueKey } = opts;
  const requestedWeek = opts.requestedWeek ?? null;
  const week = requestedWeek ? Number(requestedWeek) : undefined;

  // ─── ESPN ─────────────────────────────────────────────────────────────────

  if (platform === "espn") {
    const leagueId = leagueKey ?? null;
    if (!leagueId) {
      return { ok: false, status: 400, reason: "missing_league_key" };
    }

    const espnConns = await readEspnConnections(userId);
    const conn = espnConns.find((c) => c.leagueId === leagueId);
    if (!conn) {
      return { ok: false, status: 401, reason: "espn_not_connected" };
    }

    try {
      // Try relay data first (private leagues)
      const relay = await readEspnRelayData(userId, leagueId);
      const RELAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
      const relayUsable = relay && relay.leagueId === leagueId && Date.now() - relay.synced < RELAY_MAX_AGE_MS;

      let roster;
      if (relayUsable && relay) {
        // Parse roster directly from relay-cached raw ESPN data (no API call needed)
        roster = parseEspnRosterFromRaw(relay.raw, relay.leagueId, teamKey, relay.season, week);
        return splitCards(roster.all.map(normalizedToCard), teamKey, week);
      }

      // Fall through to direct ESPN API
      const creds = conn.espnS2 || conn.swid || conn.espnToken
        ? { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken }
        : undefined;

      roster = await withCache(
        `roster:espn:${leagueId}:${teamKey}:${week ?? "cur"}`,
        TTL.ROSTER,
        () => fetchEspnRoster(leagueId, teamKey, conn.season, week, creds)
      );

      return splitCards(roster.all.map(normalizedToCard), teamKey, week);
    } catch (e: any) {
      console.error("[Roster/ESPN] Error:", e?.message);
      return { ok: false, status: 502, reason: "fetch_failed", error: e?.message };
    }
  }

  // ─── Sleeper ──────────────────────────────────────────────────────────────

  if (platform === "sleeper") {
    const leagueId = leagueKey ?? null;
    if (!leagueId) {
      return { ok: false, status: 400, reason: "missing_league_key" };
    }

    const conn = await readSleeperConnection(userId);
    if (!conn) {
      return { ok: false, status: 401, reason: "sleeper_not_connected" };
    }

    try {
      const roster = await withCache(
        `roster:sleeper:${leagueId}:${teamKey}:${week ?? "cur"}`,
        TTL.ROSTER,
        () => fetchSleeperRoster(leagueId, teamKey, week)
      );

      return splitCards(roster.all.map(normalizedToCard), teamKey, week);
    } catch (e: any) {
      console.error("[Roster/Sleeper] Error:", e?.message);
      return { ok: false, status: 502, reason: "fetch_failed", error: e?.message };
    }
  }

  // ─── Yahoo (default) ─────────────────────────────────────────────────────

  let { access, reason: authReason } = await getYahooAuthedForUser(userId);
  if (!access) {
    return { ok: false, status: 401, reason: authReason || "yahoo_auth_failed" };
  }

  const yahooLeagueKey = leagueKeyFromTeamKey(teamKey);
  if (!yahooLeagueKey) {
    return { ok: false, status: 400, reason: "invalid_team_key" };
  }

  const cacheKey = `roster:yahoo:${teamKey}:${requestedWeek ?? "current"}`;

  try {
    const roster = await withCache(cacheKey, TTL.ROSTER, async () => {
      try {
        return await fetchRoster(access!, teamKey, yahooLeagueKey, requestedWeek);
      } catch (e: any) {
        if (String(e?.message).includes("401")) {
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            access = newToken;
            return await fetchRoster(newToken, teamKey, yahooLeagueKey, requestedWeek);
          }
        }
        throw e;
      }
    });

    return {
      ok: true,
      teamKey,
      week: roster.week,
      roster: roster.all,
      players: roster.all,
      starters: roster.starters,
      bench: roster.bench,
      empty: roster.all.length === 0,
    };
  } catch (e: any) {
    console.error("[Roster/Yahoo] Error:", e?.message || e);
    return { ok: false, status: 502, reason: "fetch_failed", error: e?.message || String(e) };
  }
}
