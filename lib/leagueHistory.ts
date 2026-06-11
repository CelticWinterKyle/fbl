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

/** The SDK sometimes nests league meta under league[0] (mirrors lib/adapters/yahoo.ts:116). */
function normalizeYahooMeta(raw: any): any {
  return raw?.league?.[0] ?? raw ?? {};
}

async function yahooSeasonChampion(
  yf: any,
  leagueKey: string,
  diag?: string[]
): Promise<{
  champ: SeasonChampion | null;
  renew: string | null;
}> {
  const [metaRaw, standingsRaw] = await Promise.all([
    yf.league.meta(leagueKey).catch(() => null),
    yf.league.standings(leagueKey).catch(() => null),
  ]);
  const meta = normalizeYahooMeta(metaRaw);
  const season = Number(meta?.season);
  const renew = renewToLeagueKey(meta?.renew);

  // The SDK's standings shape varies; try every known nesting.
  const candidates: unknown[] = [
    standingsRaw?.standings?.teams,
    standingsRaw?.teams,
    standingsRaw?.league?.[1]?.standings?.teams,
    standingsRaw?.league?.[1]?.standings?.[0]?.teams,
    standingsRaw?.league?.standings?.teams,
  ];
  const teams: any[] = (candidates.find((c) => Array.isArray(c) && c.length > 0) as any[]) ?? [];
  diag?.push(
    `standings ${leagueKey}: keys=[${Object.keys(standingsRaw ?? {}).join(",")}] teams=${teams.length} ` +
      `sample=${JSON.stringify(standingsRaw)?.slice(0, 500)}`
  );
  const winner = teams.find(
    (t) => Number(t?.team_standings?.rank ?? t?.standings?.rank ?? t?.rank) === 1
  );
  diag?.push(`winner ${leagueKey}: found=${!!winner} season=${season}`);
  if (!winner || !Number.isFinite(season)) return { champ: null, renew };

  const teamName: string =
    winner.name || winner.team_name || winner.team?.name || `Team ${winner.team_id ?? ""}`;
  const ownerName: string | null =
    winner.managers?.[0]?.nickname ??
    winner.managers?.[0]?.manager?.nickname ??
    winner.managers?.manager?.nickname ??
    null;

  return { champ: { season, teamName, ownerName }, renew };
}

async function fetchYahooHistory(
  userId: string,
  leagueKey: string,
  diag?: string[]
): Promise<LeagueHistory> {
  const guard = await getYahooAuthedForUser(userId);
  const yf = guard.yf;
  if (!yf) {
    diag?.push(`yahoo auth failed: ${guard.reason}`);
    return { champions: [] };
  }
  const champions: SeasonChampion[] = [];

  // Off-season subtlety: from February to August the "current" league IS a
  // finished season whose champion belongs in the case (is_finished flag).
  // In-season it has no champion yet and only its renew pointer matters.
  const current = normalizeYahooMeta(await yf.league.meta(leagueKey).catch(() => null));
  diag?.push(
    `meta ${leagueKey}: season=${current?.season} finished=${current?.is_finished} renew=${current?.renew ?? "none"}`
  );
  let key = renewToLeagueKey(current?.renew);
  if (Number(current?.is_finished) === 1) {
    const { champ } = await yahooSeasonChampion(yf, leagueKey, diag);
    if (champ) champions.push(champ);
  }

  for (let hop = 0; hop < MAX_SEASONS && key; hop++) {
    const { champ, renew } = await yahooSeasonChampion(yf, key, diag);
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
  // currentNflSeason() returns the most recently STARTED season: from
  // February to August that season is finished and has a champion, and
  // in-season the probe just finds no rankCalculatedFinal and moves on.
  const newest = currentNflSeason();
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

/** Uncached direct fetch with diagnostics — used by the route's debug mode. */
export async function fetchLeagueHistoryDirect(
  platform: "yahoo" | "sleeper" | "espn",
  leagueKey: string,
  ctx: { userId: string; espnCreds?: EspnCredentials },
  diag: string[]
): Promise<LeagueHistory> {
  if (platform === "sleeper") return fetchSleeperHistory(leagueKey);
  if (platform === "yahoo") return fetchYahooHistory(ctx.userId, leagueKey, diag);
  return fetchEspnHistory(leagueKey, ctx.espnCreds);
}

export async function getCachedLeagueHistory(
  platform: "yahoo" | "sleeper" | "espn",
  leagueKey: string,
  ctx: { userId: string; espnCreds?: EspnCredentials }
): Promise<LeagueHistory> {
  // History is league-scoped, not user-scoped, so the cache key is global:
  // whichever member fetches first warms it for the league. v2: v1 cached
  // empty results from the off-season skip bug.
  return withCache(`history:v5:${platform}:${leagueKey}`, HISTORY_TTL_S, async () => {
    const history =
      platform === "sleeper"
        ? await fetchSleeperHistory(leagueKey)
        : platform === "yahoo"
          ? await fetchYahooHistory(ctx.userId, leagueKey)
          : await fetchEspnHistory(leagueKey, ctx.espnCreds);
    console.log(
      `[league-history] ${platform}:${leagueKey} -> ${history.champions.length} champions`
    );
    return history;
  });
}
