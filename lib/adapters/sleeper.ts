// ─── Sleeper adapter ──────────────────────────────────────────────────────────
// Public REST API — no auth required. Docs: https://docs.sleeper.com

import type {
  NormalizedLeague,
  NormalizedTeam,
  NormalizedMatchup,
  NormalizedPlayer,
  NormalizedRoster,
  ScoringType,
  PlayerStatus,
} from "@/lib/types/index";

const BASE = "https://api.sleeper.app/v1";

async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    // No Next.js caching — we handle caching externally
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Sleeper API ${res.status} for ${path}`);
  }
  return res.json() as Promise<T>;
}

// ─── Sleeper API shapes ───────────────────────────────────────────────────────

interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar?: string | null;
}

interface SleeperLeagueRaw {
  league_id: string;
  name: string;
  season: string;
  season_type: string; // "regular"
  status: string; // "in_season" | "pre_draft" | "complete" | "drafting"
  sport: string;
  total_rosters: number;
  roster_positions: string[]; // ["QB","RB","RB","WR","WR","WR","TE","FLEX","BN","BN",...]
  scoring_settings: Record<string, number>;
  settings: {
    num_teams: number;
    playoff_week_start?: number;
    leg?: number; // current week
    rec?: number; // reception points
    bonus_rec_wr?: number;
    trade_deadline?: number;
  };
}

interface SleeperRosterRaw {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi?: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    ppts?: number;
    ppts_decimal?: number;
    streak?: number;
    waiver_position?: number;
  };
  metadata?: { team_name?: string; } | null;
}

interface SleeperMatchupRaw {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  custom_points?: number | null;
  players: string[] | null;
  starters: string[] | null;
  players_points?: Record<string, number> | null;
  starters_points?: number[] | null;
}

interface SleeperPlayerRaw {
  player_id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  injury_status?: string | null;
  status?: string | null;
  active?: boolean;
}

// ─── Player catalog cache (module-level, 24h TTL) ─────────────────────────────

interface CatalogEntry {
  name: string;
  position: string; // fantasy position (QB, RB, WR, TE, K, DEF)
  team: string;    // NFL team abbr or "FA"
  status: PlayerStatus | undefined;
}

type PlayerCatalog = Record<string, CatalogEntry>;

let _catalog: PlayerCatalog | null = null;
let _catalogAt = 0;
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeSleeperStatus(s: string | null | undefined): PlayerStatus | undefined {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "out") return "out";
  if (lower === "ir" || lower === "injured_reserve" || lower === "practice_squad_injured") return "ir";
  if (lower === "questionable" || lower === "q") return "questionable";
  if (lower === "doubtful" || lower === "d") return "doubtful";
  if (lower === "active") return "active";
  return undefined;
}

async function getPlayerCatalog(): Promise<PlayerCatalog> {
  if (_catalog && Date.now() - _catalogAt < CATALOG_TTL_MS) return _catalog;

  const raw = await sleeperGet<Record<string, SleeperPlayerRaw>>("/players/nfl");
  const catalog: PlayerCatalog = {};
  for (const [id, p] of Object.entries(raw)) {
    const pos = p.fantasy_positions?.[0] ?? p.position ?? "UNK";
    catalog[id] = {
      name:
        p.full_name ??
        ([p.first_name, p.last_name].filter(Boolean).join(" ") || id),
      position: pos,
      team: p.team ?? "FA",
      status: normalizeSleeperStatus(p.injury_status),
    };
  }
  _catalog = catalog;
  _catalogAt = Date.now();
  return catalog;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferScoringType(settings: SleeperLeagueRaw["scoring_settings"]): ScoringType {
  const rec = settings["rec"] ?? 0;
  if (rec >= 1) return "ppr";
  if (rec >= 0.5) return "half_ppr";
  return "standard";
}

/** Starter slot positions (non-bench, non-IR) from roster_positions array */
function starterSlots(rosterPositions: string[]): string[] {
  return rosterPositions.filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI");
}

/** Points total from fpts + fpts_decimal (Sleeper stores decimal separately) */
function rosterPoints(s: SleeperRosterRaw["settings"]): number {
  return (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100;
}

function rosterPointsAgainst(s: SleeperRosterRaw["settings"]): number {
  return (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100;
}

/** Returns the current NFL season year. */
export function currentNflSeason(): number {
  const now = new Date();
  // Season year = calendar year if Aug–Dec, else year-1 (Jan–Jul)
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Look up a Sleeper user by username. Used during connect flow. */
export async function lookupSleeperUser(username: string): Promise<SleeperUser> {
  return sleeperGet<SleeperUser>(`/user/${encodeURIComponent(username)}`);
}

/** Fetch all NFL leagues for a Sleeper user in a given season. */
export async function fetchSleeperLeaguesForUser(
  sleeperUserId: string,
  season = currentNflSeason()
): Promise<SleeperLeagueRaw[]> {
  return sleeperGet<SleeperLeagueRaw[]>(`/user/${sleeperUserId}/leagues/nfl/${season}`);
}

/** Full league data for a single Sleeper league — normalized for the dashboard. */
export async function fetchSleeperLeagueData(leagueId: string, week?: number) {
  const [league, rosters, users] = await Promise.all([
    sleeperGet<SleeperLeagueRaw>(`/league/${leagueId}`),
    sleeperGet<SleeperRosterRaw[]>(`/league/${leagueId}/rosters`),
    sleeperGet<SleeperUser[]>(`/league/${leagueId}/users`),
  ]);

  const currentWeek = week ?? league.settings.leg ?? 1;
  const matchupData = await sleeperGet<SleeperMatchupRaw[]>(
    `/league/${leagueId}/matchups/${currentWeek}`
  );

  // ── User/roster lookup maps ──
  const userMap = new Map(users.map((u) => [u.user_id, u.display_name || u.username]));

  const rosterMeta = new Map(
    rosters.map((r) => [
      r.roster_id,
      {
        ownerName:
          r.metadata?.team_name ??
          (r.owner_id ? (userMap.get(r.owner_id) ?? `Team ${r.roster_id}`) : `Team ${r.roster_id}`),
        settings: r.settings,
      },
    ])
  );

  // ── NormalizedLeague ──
  const normalizedLeague: NormalizedLeague = {
    id: `sleeper:${leagueId}`,
    platform: "sleeper",
    name: league.name,
    season: parseInt(league.season, 10),
    currentWeek,
    totalWeeks: league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : 14,
    teamCount: league.total_rosters,
    scoringType: inferScoringType(league.scoring_settings),
    tradeDeadlineWeek: league.settings.trade_deadline ?? undefined,
    rosterPositions: (() => {
      const counts: Record<string, number> = {};
      for (const p of league.roster_positions) {
        counts[p] = (counts[p] ?? 0) + 1;
      }
      return Object.entries(counts).map(([position, count]) => ({ position, count }));
    })(),
    platformLeagueId: leagueId,
  };

  // ── NormalizedTeam[] ──
  const teams: NormalizedTeam[] = rosters.map((r) => {
    const meta = rosterMeta.get(r.roster_id)!;
    return {
      id: `sleeper:${leagueId}:${r.roster_id}`,
      leagueId: `sleeper:${leagueId}`,
      platform: "sleeper",
      name: meta.ownerName,
      ownerName: r.owner_id ? (userMap.get(r.owner_id) ?? meta.ownerName) : meta.ownerName,
      record: {
        w: r.settings.wins ?? 0,
        l: r.settings.losses ?? 0,
        t: r.settings.ties ?? 0,
      },
      pointsFor: rosterPoints(r.settings),
      pointsAgainst: rosterPointsAgainst(r.settings),
      streak:
        typeof r.settings.streak === "number" && r.settings.streak !== 0
          ? {
              type: r.settings.streak > 0 ? "W" : "L",
              length: Math.abs(r.settings.streak),
            }
          : undefined,
      platformTeamKey: String(r.roster_id),
    };
  });

  // ── NormalizedMatchup[] ──
  const groups = new Map<number, SleeperMatchupRaw[]>();
  for (const entry of matchupData) {
    if (entry.matchup_id === null) continue; // bye week
    const arr = groups.get(entry.matchup_id) ?? [];
    arr.push(entry);
    groups.set(entry.matchup_id, arr);
  }

  const matchups: NormalizedMatchup[] = [];
  for (const [matchupId, pair] of groups) {
    if (pair.length !== 2) continue;
    const [e1, e2] = pair;
    const m1 = rosterMeta.get(e1.roster_id);
    const m2 = rosterMeta.get(e2.roster_id);
    matchups.push({
      id: `sleeper:${leagueId}:${currentWeek}:${matchupId}`,
      leagueId: `sleeper:${leagueId}`,
      platform: "sleeper",
      week: currentWeek,
      teamA: {
        teamId: `sleeper:${leagueId}:${e1.roster_id}`,
        teamName: m1?.ownerName ?? `Team ${e1.roster_id}`,
        points: e1.points ?? 0,
        projectedPoints: 0, // Sleeper API does not provide projected points
        platformTeamKey: String(e1.roster_id),
      },
      teamB: {
        teamId: `sleeper:${leagueId}:${e2.roster_id}`,
        teamName: m2?.ownerName ?? `Team ${e2.roster_id}`,
        points: e2.points ?? 0,
        projectedPoints: 0,
        platformTeamKey: String(e2.roster_id),
      },
      isComplete: currentWeek < currentWeek, // always false for current week
    });
  }

  return {
    normalizedLeague,
    matchups,
    teams,
    meta: {
      leagueName: league.name,
      currentWeek,
      season: parseInt(league.season, 10),
      status: league.status,
    },
    settings: {
      scoringType: normalizedLeague.scoringType,
      rosterPositions: normalizedLeague.rosterPositions,
    },
    rosterPositions: normalizedLeague.rosterPositions,
  };
}

/** Fetch a single team's roster for a given week. */
export async function fetchSleeperRoster(
  leagueId: string,
  rosterId: number | string,
  week?: number | string | null
): Promise<NormalizedRoster> {
  const targetRosterId = Number(rosterId);

  const [league, rosters, catalog] = await Promise.all([
    sleeperGet<SleeperLeagueRaw>(`/league/${leagueId}`),
    sleeperGet<SleeperRosterRaw[]>(`/league/${leagueId}/rosters`),
    getPlayerCatalog(),
  ]);

  const roster = rosters.find((r) => r.roster_id === targetRosterId);
  if (!roster) throw new Error(`Roster ${rosterId} not found in league ${leagueId}`);

  const currentWeek = week ? Number(week) : (league.settings.leg ?? 1);

  // Get per-player points from matchup data
  let playerPoints: Record<string, number> = {};
  try {
    const matchupData = await sleeperGet<SleeperMatchupRaw[]>(
      `/league/${leagueId}/matchups/${currentWeek}`
    );
    const myEntry = matchupData.find((e) => e.roster_id === targetRosterId);
    playerPoints = myEntry?.players_points ?? {};
  } catch {
    // Points unavailable for this week — proceed without
  }

  const rosterPositions = league.roster_positions;
  const slots = starterSlots(rosterPositions);
  const starters = roster.starters ?? [];
  const reserve = new Set(roster.reserve ?? []);
  const allPlayerIds = new Set(roster.players ?? []);

  const toPlayer = (playerId: string, slotPos: string | undefined): NormalizedPlayer => {
    const cat = catalog[playerId];
    return {
      id: playerId,
      platform: "sleeper",
      name: cat?.name ?? playerId,
      position: slotPos ?? cat?.position ?? "BN",
      primaryPosition: cat?.position ?? "UNK",
      nflTeam: cat?.team ?? "FA",
      status: cat?.status,
      points: playerPoints[playerId] ?? 0,
      projectedPoints: 0,
      platformKey: playerId,
    };
  };

  const starterSet = new Set(starters);
  const starterPlayers: NormalizedPlayer[] = starters.map((pid, i) =>
    toPlayer(pid, slots[i])
  );

  const benchPlayers: NormalizedPlayer[] = [];
  for (const pid of allPlayerIds) {
    if (!starterSet.has(pid) && !reserve.has(pid)) {
      benchPlayers.push(toPlayer(pid, "BN"));
    }
  }

  // Include IR separately at end of bench
  for (const pid of reserve) {
    benchPlayers.push(toPlayer(pid, "IR"));
  }

  return {
    teamId: `sleeper:${leagueId}:${targetRosterId}`,
    leagueId: `sleeper:${leagueId}`,
    platform: "sleeper",
    week: currentWeek,
    starters: starterPlayers,
    bench: benchPlayers,
    all: [...starterPlayers, ...benchPlayers],
  };
}
