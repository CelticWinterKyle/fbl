// ─── League history: champions by year, across all three platforms ───────────
// SEASON_FEATURES_PLAN.md #4 (Trophy Case). Each platform exposes the past
// differently:
//   - Yahoo: every league carries a `renew` pointer ("449_12345") to its
//     previous-season league; walk the chain, read each season's standings.
//   - Sleeper: leagues chain via previous_league_id; the champion comes from
//     the winners bracket (the match decided for place 1).
//   - ESPN: archived seasons live on the leagueHistory endpoint; probe years
//     backwards until two consecutive misses.
// History is immutable once a season ends, so results cache for 7 days.

import { withCache } from "@/lib/cache";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { fetchEspnSeasonChampion, type EspnCredentials } from "@/lib/adapters/espn";
import { currentNflSeason } from "@/lib/season";

const MAX_SEASONS = 10;
const HISTORY_TTL_S = 7 * 24 * 3600;

export type SeasonChampion = {
  season: number;
  teamName: string;
  ownerName: string | null;
};

export type LeagueHistory = {
  champions: SeasonChampion[]; // newest first
};

// ─── Sleeper ──────────────────────────────────────────────────────────────────

const SLEEPER_BASE = "https://api.sleeper.app/v1";

async function sleeperJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SLEEPER_BASE}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function sleeperSeasonChampion(leagueId: string): Promise<SeasonChampion | null> {
  const [league, bracket, rosters, users] = await Promise.all([
    sleeperJson<any>(`/league/${leagueId}`),
    sleeperJson<any[]>(`/league/${leagueId}/winners_bracket`),
    sleeperJson<any[]>(`/league/${leagueId}/rosters`),
    sleeperJson<any[]>(`/league/${leagueId}/users`),
  ]);
  if (!league || league.status !== "complete") return null;

  // The championship is the bracket match decided for first place; fall back
  // to the last round's first match for older bracket shapes.
  const matches = Array.isArray(bracket) ? bracket : [];
  const title =
    matches.find((m) => m?.p === 1 && m?.w != null) ??
    [...matches].sort((a, b) => (b?.r ?? 0) - (a?.r ?? 0)).find((m) => m?.w != null);
  const winnerRosterId = title?.w;
  if (winnerRosterId == null) return null;

  const roster = (rosters ?? []).find((r) => r?.roster_id === winnerRosterId);
  const user = (users ?? []).find((u) => u?.user_id === roster?.owner_id);
  const teamName: string =
    user?.metadata?.team_name || user?.display_name || `Roster ${winnerRosterId}`;

  const season = Number(league.season);
  if (!Number.isFinite(season)) return null;
  return { season, teamName, ownerName: user?.display_name ?? null };
}

async function fetchSleeperHistory(leagueId: string): Promise<LeagueHistory> {
  const champions: SeasonChampion[] = [];
  let id: string | null | undefined = leagueId;

  for (let hop = 0; hop < MAX_SEASONS && id; hop++) {
    const champ = await sleeperSeasonChampion(id);
    if (champ) champions.push(champ);
    const league: { previous_league_id?: string | null } | null =
      await sleeperJson(`/league/${id}`);
    id = league?.previous_league_id || null;
  }
  champions.sort((a, b) => b.season - a.season);
  return { champions };
}

// ─── Yahoo ────────────────────────────────────────────────────────────────────

/** "449_12345" -> "449.l.12345" (Yahoo's renew pointer to league key). */
function renewToLeagueKey(renew: unknown): string | null {
  if (typeof renew !== "string" || !renew.includes("_")) return null;
  const [gameId, leagueId] = renew.split("_");
  if (!gameId || !leagueId) return null;
  return `${gameId}.l.${leagueId}`;
}

async function yahooSeasonChampion(yf: any, leagueKey: string): Promise<{
  champ: SeasonChampion | null;
  renew: string | null;
}> {
  const [meta, standingsRaw] = await Promise.all([
    yf.league.meta(leagueKey).catch(() => null),
    yf.league.standings(leagueKey).catch(() => null),
  ]);
  const season = Number(meta?.season);
  const renew = renewToLeagueKey(meta?.renew);

  const teams: any[] = standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];
  const winner = teams.find((t) => Number(t?.team_standings?.rank) === 1);
  if (!winner || !Number.isFinite(season)) return { champ: null, renew };

  const ownerName: string | null =
    (Array.isArray(winner.managers) ? winner.managers[0]?.nickname : undefined) ??
    winner.managers?.manager?.nickname ??
    null;

  return {
    champ: { season, teamName: winner.name ?? `Team ${winner.team_id}`, ownerName },
    renew,
  };
}

async function fetchYahooHistory(userId: string, leagueKey: string): Promise<LeagueHistory> {
  const guard = await getYahooAuthedForUser(userId);
  const yf = guard.yf;
  if (!yf) return { champions: [] };
  const champions: SeasonChampion[] = [];

  // The CURRENT season's league has no champion yet; start from its renew
  // pointer and walk backwards.
  const current = await yf.league.meta(leagueKey).catch(() => null);
  let key = renewToLeagueKey(current?.renew);

  for (let hop = 0; hop < MAX_SEASONS && key; hop++) {
    const { champ, renew } = await yahooSeasonChampion(yf, key);
    if (champ) champions.push(champ);
    key = renew;
  }
  champions.sort((a, b) => b.season - a.season);
  return { champions };
}

// ─── ESPN ─────────────────────────────────────────────────────────────────────

async function fetchEspnHistory(
  leagueId: string,
  creds?: EspnCredentials
): Promise<LeagueHistory> {
  const champions: SeasonChampion[] = [];
  const newest = currentNflSeason() - 1; // current season has no champion yet
  let misses = 0;

  for (let season = newest; season > newest - MAX_SEASONS && misses < 2; season--) {
    const champ = await fetchEspnSeasonChampion(leagueId, season, creds);
    if (champ) {
      champions.push(champ);
      misses = 0;
    } else {
      misses++;
    }
  }
  return { champions };
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export async function getCachedLeagueHistory(
  platform: "yahoo" | "sleeper" | "espn",
  leagueKey: string,
  ctx: { userId: string; espnCreds?: EspnCredentials }
): Promise<LeagueHistory> {
  // History is league-scoped, not user-scoped, so the cache key is global:
  // whichever member fetches first warms it for the league.
  return withCache(`history:${platform}:${leagueKey}`, HISTORY_TTL_S, async () => {
    if (platform === "sleeper") return fetchSleeperHistory(leagueKey);
    if (platform === "yahoo") return fetchYahooHistory(ctx.userId, leagueKey);
    return fetchEspnHistory(leagueKey, ctx.espnCreds);
  });
}
