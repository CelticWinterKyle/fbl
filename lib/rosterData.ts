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
import { currentNflSeason } from "@/lib/season";
import { isNflGameWindow } from "@/lib/gameWindow";
import { getWeekKickoffs, applyKickoffs } from "@/lib/nflKickoffs";

/** Roster cache life: a minute while games are on (lineup points move), five off the clock. */
function rosterTtl(): number {
  return isNflGameWindow() ? TTL.LIVE_SCORE : TTL.ROSTER;
}

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

// Canonical lineup display order, the one every platform's own UI uses.
// Platforms return roster entries in arbitrary order (ESPN by internal slot
// id), which read as scrambled: RB, TE, K, QB. Unknown slots sort last, in
// their original order.
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "W/R/T", "OP", "DEF", "D/ST", "DST", "K"];
function slotRank(pos: string): number {
  const i = SLOT_ORDER.indexOf(String(pos ?? "").toUpperCase());
  return i === -1 ? SLOT_ORDER.length : i;
}

async function splitCards(cards: any[], teamKey: string, week?: number): Promise<RosterPayload> {
  // Every platform funnels through here, so this is where each player gets
  // this week's kickoff time and opponent by NFL team (lib/nflKickoffs.ts).
  // That is what drives the "playing now" dot, the dimmed not-yet-played
  // points, the "@ NE Wed 6:20 PM" line, and the lineup alert's "already
  // kicked off" skip. Best-effort: a feed hiccup leaves the cards as they were.
  const all = applyKickoffs(cards, await getWeekKickoffs(currentNflSeason(), week));
  const starters = all
    .filter((p) => p.position !== "BN" && p.position !== "IR")
    .sort((a, b) => slotRank(a.position) - slotRank(b.position));
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
      // The extension's relayed copy (up to 6h old): the only source for a
      // login the server cannot use, and the cheap one off the clock.
      const relayRoster = async () => {
        const relay = await readEspnRelayData(userId, leagueId);
        const RELAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
        const relayUsable = relay && relay.leagueId === leagueId && Date.now() - relay.synced < RELAY_MAX_AGE_MS;
        if (!relayUsable || !relay) return null;
        return parseEspnRosterFromRaw(relay.raw, relay.leagueId, teamKey, relay.season, week);
      };

      // Ask ESPN directly with the stored login.
      const liveRoster = () => {
        const creds = conn.espnS2 || conn.swid || conn.espnToken
          ? { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken }
          : undefined;
        return withCache(
          `roster:espn:${leagueId}:${teamKey}:${week ?? "cur"}`,
          rosterTtl(),
          () => fetchEspnRoster(leagueId, teamKey, conn.season, week, creds)
        );
      };

      // During games, live first: the relayed copy is a photo of whenever the
      // desktop last loaded a page, and a lineup's points must not sit on it.
      // Same order as getEspnData in lib/leagueData.ts.
      let roster;
      if (isNflGameWindow()) {
        try {
          roster = await liveRoster();
        } catch (e) {
          roster = await relayRoster();
          if (!roster) throw e;
        }
      } else {
        roster = (await relayRoster()) ?? (await liveRoster());
      }

      return await splitCards(roster.all.map(normalizedToCard), teamKey, week ?? roster.week ?? undefined);
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
        rosterTtl(),
        () => fetchSleeperRoster(leagueId, teamKey, week)
      );

      return await splitCards(roster.all.map(normalizedToCard), teamKey, week ?? roster.week ?? undefined);
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

  // v3: user-scoped. A shared key let any Yahoo-connected user read a private
  // league's roster out of another member's warm cache (5 min window); scoping
  // per user keeps Yahoo's own league-membership authz as the gate on every
  // cold fetch. Slight cache duplication is fine at current scale.
  const cacheKey = `roster:yahoo:v3:${userId}:${teamKey}:${requestedWeek ?? "current"}`;

  try {
    const roster = await withCache(cacheKey, rosterTtl(), async () => {
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

    // Yahoo returns players in the NormalizedPlayer shape (nflTeam) and never a
    // kickoff time, so stamp here the same way splitCards does for the others.
    const kickoffs = await getWeekKickoffs(currentNflSeason(), roster.week ?? week);
    const all = applyKickoffs(roster.all, kickoffs);
    return {
      ok: true,
      teamKey,
      week: roster.week,
      roster: all,
      players: all,
      starters: applyKickoffs(roster.starters, kickoffs),
      bench: applyKickoffs(roster.bench, kickoffs),
      empty: all.length === 0,
    };
  } catch (e: any) {
    console.error("[Roster/Yahoo] Error:", e?.message || e);
    return { ok: false, status: 502, reason: "fetch_failed", error: e?.message || String(e) };
  }
}
