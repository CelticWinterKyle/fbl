// ─── Cross-league waiver intel ────────────────────────────────────────────────
// SEASON_FEATURES_PLAN.md #7: who the fantasy world is adding right now
// (Sleeper publishes global trending-adds data), tagged with availability in
// each of the user's leagues. Availability sources:
//   - Sleeper: one rosters call per league = the full taken-player set
//   - Yahoo: status=A search per player per league (capped, cached)
//   - ESPN: not implemented in v1 ("unknown" -> the UI says check the league)
// Trending is global (cached 1h); per-league pieces cache independently.

import { withCache } from "@/lib/cache";
import { lookupSleeperPlayers } from "@/lib/adapters/sleeper";
import { yahooFetch } from "@/lib/adapters/yahoo";
import { fetchEspnAvailablePlayerNames, type EspnCredentials } from "@/lib/adapters/espn";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { playerNameKey } from "@/lib/playerName";

const TRENDING_URL =
  "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=25";

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

export type TrendingPlayer = {
  /** Sleeper player id (identity source) */
  id: string;
  name: string;
  position: string;
  team: string;
  /** Adds across all of Sleeper in the lookback window */
  adds: number;
};

// ─── Trending (global) ────────────────────────────────────────────────────────

async function fetchTrendingAdds(): Promise<TrendingPlayer[]> {
  try {
    const res = await fetch(TRENDING_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const raw: { player_id: string; count: number }[] = await res.json();
    if (!Array.isArray(raw)) return [];

    const ids = raw.map((r) => String(r.player_id));
    const identities = await lookupSleeperPlayers(ids);

    const out: TrendingPlayer[] = [];
    for (const r of raw) {
      const id = String(r.player_id);
      const who = identities.get(id);
      if (!who || !FANTASY_POSITIONS.has(who.position)) continue;
      out.push({ id, name: who.name, position: who.position, team: who.team, adds: Number(r.count) || 0 });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getTrendingAdds(): Promise<TrendingPlayer[]> {
  return withCache("waiver:trending", 3600, fetchTrendingAdds);
}

// ─── Availability: Sleeper ────────────────────────────────────────────────────

/** Every player id rostered anywhere in a Sleeper league. */
async function fetchSleeperRosteredIds(leagueId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rosters: any[] = await res.json();
    const ids = new Set<string>();
    for (const r of Array.isArray(rosters) ? rosters : []) {
      for (const id of r?.players ?? []) ids.add(String(id));
    }
    return [...ids];
  } catch {
    return [];
  }
}

export async function isAvailableInSleeper(leagueId: string, playerId: string): Promise<boolean | null> {
  const ids = await withCache(`waiver:rostered:sleeper:${leagueId}`, 1800, () =>
    fetchSleeperRosteredIds(leagueId)
  );
  if (ids.length === 0) return null; // couldn't load -> unknown
  return !ids.includes(playerId);
}

// ─── Availability: ESPN ───────────────────────────────────────────────────────

/**
 * Available-player name set per ESPN league (FA + waivers, top 600 by
 * ownership), cached 30 min. Availability = the trending player's name is in
 * the set; null when the league call failed.
 */
export async function isAvailableInEspn(
  conn: { leagueId: string; season: number } & EspnCredentials,
  playerName: string
): Promise<boolean | null> {
  const keys = await withCache<{ v: string[] | null }>(
    `waiver:av:espn:${conn.leagueId}`,
    1800,
    async () => {
      const names = await fetchEspnAvailablePlayerNames(conn.leagueId, conn.season, {
        espnS2: conn.espnS2,
        swid: conn.swid,
        espnToken: conn.espnToken,
      });
      return { v: names ? names.map(playerNameKey) : null };
    }
  );
  if (!keys.v) return null;
  return keys.v.includes(playerNameKey(playerName));
}

// ─── Availability: Yahoo ──────────────────────────────────────────────────────

/**
 * One status=A (available) name search per player per league, cached 1h.
 * Parses name fields out of Yahoo's deeply-nested raw JSON by extraction
 * rather than shape-walking: we only need "is a player with this name in
 * the available list".
 */
export async function isAvailableInYahoo(
  userId: string,
  leagueKey: string,
  playerName: string
): Promise<boolean | null> {
  const key = `waiver:yav:${leagueKey}:${playerNameKey(playerName)}`;
  const result = await withCache<{ v: boolean | null }>(key, 3600, async () => {
    try {
      const guard = await getYahooAuthedForUser(userId);
      if (!guard.access) return { v: null };
      const path = `league/${leagueKey}/players;search=${encodeURIComponent(playerName)};status=A`;
      const resp = await yahooFetch(guard.access, path);
      if (!resp.ok) return { v: null };
      const wanted = playerNameKey(playerName);
      const names = [...resp.text.matchAll(/"full":"([^"]+)"/g)].map((m) => m[1]);
      return { v: names.some((n) => playerNameKey(n) === wanted) };
    } catch {
      return { v: null };
    }
  });
  return result.v;
}
