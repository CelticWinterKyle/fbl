// ─── NFL kickoff times and game state per team (ESPN public scoreboard) ──────
// The roster view highlights a player whose game is in progress and prints
// "@ NE Wed 6:20 PM" under the name, but that needs a kickoff time on each
// player, and no fantasy platform's roster API sends one: Yahoo's payload has
// no such field (the adapter's search for it always came up empty), ESPN's
// and Sleeper's rosters only carry the pro team. So the highlight had never
// lit up for anyone. This stamps every player by NFL team from ESPN's free
// sports API (site.api.espn.com, the same source as the Live Feed; no auth,
// NFL-wide, platform-neutral).
//
// It also carries each game's live state (pre / in / post). "Playing now"
// used to be "kickoff was less than four hours ago", which kept a player lit
// for an hour after a quick game ended (Davante Adams, 2026-09-10, 45 minutes
// after the final whistle). ESPN's state flips the moment the game does.

import { withCache } from "@/lib/cache";
import { isNflGameWindow } from "@/lib/gameWindow";

export type NflGameState = "pre" | "in" | "post";
export type TeamKickoff = { kickoffMs: number; opponent: string; isHome: boolean; state?: NflGameState };
/** Canonical team abbreviation -> that team's game this week. Bye = absent. */
export type WeekKickoffs = Record<string, TeamKickoff>;

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const WEEK_TTL_S = 6 * 3600; // off the clock: the schedule for a week is settled
const CURRENT_TTL_S = 3600; // "whatever week it is now" rolls over weekly
const LIVE_TTL_S = 60; // during games: state moves, one fetch a minute for everyone

// Canonical spelling is ESPN's (the key space the scoreboard feed uses).
// Each platform spells a few teams its own way: Yahoo title-cases ("Sea",
// "Was", "Jax"), Sleeper uses WAS/JAX/LAR/LV, ESPN fantasy uses WSH/JAX.
const ALIASES: Record<string, string> = {
  WAS: "WSH",
  JAC: "JAX",
  LA: "LAR",
  STL: "LAR",
  SD: "LAC",
  OAK: "LV",
  LVR: "LV",
  ARZ: "ARI",
  BLT: "BAL",
  CLV: "CLE",
  HST: "HOU",
  GNB: "GB",
  KAN: "KC",
  NWE: "NE",
  NOR: "NO",
  SFO: "SF",
  TAM: "TB",
};

/** Any platform's team abbreviation -> canonical, or null for free agents. */
export function canonicalNflAbbr(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const up = raw.trim().toUpperCase();
  if (!up || up === "FA" || up === "UNK") return null;
  return ALIASES[up] ?? up;
}

function gameState(e: any): NflGameState | undefined {
  const s = e?.status?.type?.state ?? e?.competitions?.[0]?.status?.type?.state;
  return s === "pre" || s === "in" || s === "post" ? s : undefined;
}

/** Pure: scoreboard JSON -> per-team kickoff map. Exported for tests. */
export function parseScoreboardKickoffs(json: unknown): WeekKickoffs {
  const out: WeekKickoffs = {};
  const events = Array.isArray((json as any)?.events) ? ((json as any).events as any[]) : [];
  for (const e of events) {
    const ms = Date.parse(String(e?.date ?? ""));
    if (!Number.isFinite(ms)) continue;
    const competitors = e?.competitions?.[0]?.competitors;
    if (!Array.isArray(competitors) || competitors.length !== 2) continue;
    const [x, y] = competitors;
    const ax = canonicalNflAbbr(x?.team?.abbreviation);
    const ay = canonicalNflAbbr(y?.team?.abbreviation);
    if (!ax || !ay) continue;
    const state = gameState(e);
    out[ax] = { kickoffMs: ms, opponent: ay, isHome: x?.homeAway === "home", state };
    out[ay] = { kickoffMs: ms, opponent: ax, isHome: y?.homeAway === "home", state };
  }
  return out;
}

async function fetchKickoffs(season: number, week: number | null): Promise<WeekKickoffs> {
  const params = new URLSearchParams({ seasontype: "2", dates: String(season) });
  if (week !== null) params.set("week", String(week));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${SCOREBOARD_URL}?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    // Throw rather than return {} so a bad answer is never cached for hours.
    if (!res.ok) throw new Error(`scoreboard ${res.status}`);
    const parsed = parseScoreboardKickoffs(await res.json());
    if (Object.keys(parsed).length === 0) throw new Error("scoreboard empty");
    return parsed;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Kickoff map for a fantasy week (regular season weeks 1-18 line up with NFL
 * weeks). `week` undefined means the NFL's current week. Never throws: a
 * feed problem just means no highlight until the next try.
 *
 * During a game window the map is re-fetched every minute under its own
 * cache key, so game state is live and a long-lived off-clock entry written
 * before kickoff (state "pre") is never read while games are on.
 */
export async function getWeekKickoffs(season: number, week?: number | null): Promise<WeekKickoffs> {
  const wk = Number.isFinite(Number(week)) && Number(week) >= 1 && Number(week) <= 18 ? Number(week) : null;
  const live = isNflGameWindow();
  const key = `nfl:kickoffs:${season}:${wk ?? "cur"}${live ? ":live" : ""}`;
  const ttl = live ? LIVE_TTL_S : wk === null ? CURRENT_TTL_S : WEEK_TTL_S;
  try {
    return await withCache(key, ttl, () => fetchKickoffs(season, wk));
  } catch {
    return {};
  }
}

type KickoffCard = {
  /** MatchupCard shape uses `team`; NormalizedPlayer (the Yahoo roster path) uses `nflTeam`. */
  team?: string | null;
  nflTeam?: string | null;
  kickoffMs?: number | null;
  opponent?: string | null;
  isHome?: boolean | null;
  gameState?: NflGameState | null;
};

/**
 * Pure: fill kickoff/opponent/home/state on cards that lack them, matched by
 * NFL team. A platform that does send its own values keeps them.
 */
export function applyKickoffs<T extends KickoffCard>(cards: T[], kickoffs: WeekKickoffs): T[] {
  return cards.map((c) => {
    const abbr = canonicalNflAbbr(c.team ?? c.nflTeam);
    const g = abbr ? kickoffs[abbr] : undefined;
    if (!g) return c;
    return {
      ...c,
      kickoffMs: c.kickoffMs ?? g.kickoffMs,
      opponent: c.opponent ?? g.opponent,
      isHome: c.isHome ?? g.isHome,
      gameState: c.gameState ?? g.state ?? null,
    };
  });
}
