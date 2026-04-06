// ─── ESPN Fantasy adapter ──────────────────────────────────────────────────────
// Uses the unofficial ESPN Fantasy API (lm-api-reads.fantasy.espn.com).
// Public leagues need no auth. Private leagues require espn_s2 + SWID cookies.

import type {
  NormalizedLeague,
  NormalizedTeam,
  NormalizedMatchup,
  NormalizedPlayer,
  NormalizedRoster,
  ScoringType,
  PlayerStatus,
} from "@/lib/types/index";

const ESPN_BASE =
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

// ─── ESPN API shapes (partial — only fields we use) ──────────────────────────

interface EspnTeamRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

interface EspnTeam {
  id: number;
  location: string;
  nickname: string;
  abbrev: string;
  owners: string[];
  record?: { overall?: EspnTeamRecord };
  points?: number;
  projectedPoints?: number;
}

interface EspnMatchupTeam {
  teamId: number;
  totalPoints: number;
  totalProjectedPointsLive?: number;
  rosterForCurrentScoringPeriod?: { entries: EspnRosterEntry[] };
}

interface EspnMatchup {
  id: number;
  matchupPeriodId: number;
  winner: "HOME" | "AWAY" | "UNDECIDED" | "TIE";
  home: EspnMatchupTeam;
  away: EspnMatchupTeam;
}

interface EspnRosterEntry {
  playerId: number;
  lineupSlotId: number;
  acquisitionType?: string;
  playerPoolEntry: {
    acquisitionType?: string;
    lineupLocked?: boolean;
    playerPoolEntryId?: number;
    onTeamId?: number;
    appliedStatTotal?: number;
    player: {
      id: number;
      fullName: string;
      defaultPositionId: number;
      proTeamId: number;
      injuryStatus?: string;
      stats?: EspnStat[];
    };
  };
}

interface EspnStat {
  scoringPeriodId: number;
  seasonId: number;
  statSourceId: number; // 0 = actual, 1 = projected
  appliedTotal: number;
}

interface EspnSettings {
  name: string;
  scheduleSettings?: { matchupPeriodCount?: number; playoffMatchupPeriodLength?: number };
  scoringSettings?: {
    scoringItems?: Array<{ statId: number; pointsOverrides?: Record<number, number> }>;
    scoringType?: string;
  };
  rosterSettings?: {
    lineupSlotCounts: Record<string, number>;
    rosterLocktimeType?: string;
  };
  acquisitionSettings?: { waiverOrderReset?: boolean };
  tradeSettings?: { deadlineDate?: number | null };
}

interface EspnLeagueResponse {
  id: number;
  seasonId: number;
  scoringPeriodId: number;
  gameCode?: string;
  teams?: EspnTeam[];
  schedule?: EspnMatchup[];
  settings?: EspnSettings;
  status?: {
    currentMatchupPeriod: number;
    isActive: boolean;
    finalScoringPeriod?: number;
  };
  members?: Array<{ id: string; displayName: string; firstName?: string; lastName?: string }>;
}

// ─── Static lookup tables ─────────────────────────────────────────────────────

// lineup slot ID → slot name
const ESPN_SLOT_MAP: Record<number, string> = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "DEF",
  17: "K",
  20: "BN",
  21: "IR",
  23: "FLEX",
  24: "WR/TE",
};

// ESPN position ID → abbreviation
const ESPN_POSITION_MAP: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DEF",
  // others map to their ID as string
};

// ESPN pro team ID → NFL abbreviation
const ESPN_TEAM_MAP: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
  21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA",
  27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function currentNflSeason(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function espnCookieHeader(
  espnS2?: string,
  swid?: string,
  espnToken?: string,
  accessToken?: string
): Record<string, string> {
  const parts: string[] = [];
  if (espnS2) parts.push(`espn_s2=${espnS2}`);
  if (swid) parts.push(`SWID=${swid}`);
  if (espnToken) parts.push(`ESPN-ONESITE.WEB-PROD.token=${espnToken}`);
  const headers: Record<string, string> = {};
  if (parts.length > 0) headers["Cookie"] = parts.join("; ");
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

/**
 * Decode the payload segment of an ESPN-ONESITE.WEB-PROD.token.
 * Token format: "{version}={base64url_json}|{signature}"
 * The JSON contains access_token, refresh_token, swid, and other fields.
 */
function decodeEspnOneSitePayload(
  espnToken: string
): Record<string, unknown> | null {
  // Grab segment between first "=" and first "|"
  const match = espnToken.match(/=([^|]+)\|/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    try {
      return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

/**
 * Extract credentials from ESPN-ONESITE.WEB-PROD.token.
 *
 * Primary path: decode the token payload directly — it contains swid and
 * access_token which is used as a Bearer token for API requests.
 *
 * Secondary path: call the Disney refresh-auth endpoint with refresh_token
 * to obtain the legacy espn_s2 credential (older accounts only).
 */
export async function exchangeEspnOneSiteToken(
  espnToken: string
): Promise<{ espnS2?: string; swid?: string; accessToken?: string; _debug: Record<string, unknown> } | null> {
  const _debug: Record<string, unknown> = {};
  try {
    const payload = decodeEspnOneSitePayload(espnToken);
    _debug.payloadDecoded = !!payload;
    _debug.payloadKeys = payload ? Object.keys(payload) : [];
    if (!payload) return null;

    // Extract swid and access_token directly from the payload
    const rawSwid = payload.swid as string | undefined;
    const swid = rawSwid
      ? rawSwid.startsWith("{") ? rawSwid : `{${rawSwid}}`
      : undefined;
    let accessToken = payload.access_token as string | undefined;
    _debug.hasSwid = !!swid;
    _debug.hasAccessToken = !!accessToken;

    // Optionally fetch espn_s2 from Disney (only works for older accounts that have it)
    let espnS2: string | undefined;
    const refreshToken = payload.refresh_token as string | undefined;
    _debug.hasRefreshToken = !!refreshToken;

    if (refreshToken) {
      try {
        const resp = await fetch(
          "https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/refresh-auth",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
            cache: "no-store",
          }
        );
        _debug.disneyStatus = resp.status;
        if (resp.ok) {
          const body = await resp.json();
          _debug.disneyDataKeys = Object.keys(body?.data ?? {});
          _debug.disneyTokenKeys = Object.keys(body?.data?.token ?? {});
          espnS2 = body?.data?.s2 || undefined;
          _debug.disneyHasS2 = !!espnS2;
          const disneySwid = body?.data?.token?.swid as string | undefined;
          _debug.disneyHasSwid = !!disneySwid;
          // Prefer Disney's freshly-issued access_token — it has a scope field
          // that the original cookie token may lack, giving broader API access.
          const freshAccessToken = body?.data?.token?.access_token as string | undefined;
          if (freshAccessToken) accessToken = freshAccessToken;
          if (disneySwid && !swid) {
            const normalized = disneySwid.startsWith("{") ? disneySwid : `{${disneySwid}}`;
            return { espnS2, swid: normalized, accessToken, _debug };
          }
        } else {
          const errText = await resp.text().catch(() => "");
          _debug.disneyErrorPreview = errText.slice(0, 200);
        }
      } catch (err) {
        _debug.disneyFetchError = String(err);
      }
    }

    if (!swid && !accessToken) return null;
    return { espnS2, swid, accessToken, _debug };
  } catch (e) {
    _debug.fatalError = String(e);
    return null;
  }
}

function espnPlayerStatus(s: string | undefined): PlayerStatus | undefined {
  if (!s) return undefined;
  switch (s.toUpperCase()) {
    case "ACTIVE": return "active";
    case "OUT": return "out";
    case "INJURED_RESERVE":
    case "INJURY_RESERVE": return "ir";
    case "QUESTIONABLE": return "questionable";
    case "DOUBTFUL": return "doubtful";
    case "SUSPENSION": return "out";
    default: return undefined;
  }
}

function espnScoringType(settings: EspnSettings | undefined): ScoringType {
  const t = settings?.scoringSettings?.scoringType?.toLowerCase() ?? "";
  if (t.includes("ppr")) return "ppr";
  if (t.includes("half")) return "half_ppr";
  if (t.includes("standard")) return "standard";
  return "standard";
}

async function espnFetch<T>(
  url: string,
  cookies?: { espnS2?: string; swid?: string; espnToken?: string; accessToken?: string },
  useFilter = false
): Promise<T> {
  // Auto-extract access_token from ONESITE payload if not already provided
  let accessToken = cookies?.accessToken;
  if (!accessToken && cookies?.espnToken) {
    const payload = decodeEspnOneSitePayload(cookies.espnToken);
    accessToken = payload?.access_token as string | undefined;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    // Headers ESPN's web app sends for cross-origin requests to lm-api-reads
    "Origin": "https://fantasy.espn.com",
    "Referer": "https://fantasy.espn.com/football/league",
    "x-fantasy-source": "kona",
    "x-fantasy-platform": "kona-PROD-m.4.8.0-rc3",
    ...espnCookieHeader(cookies?.espnS2, cookies?.swid, cookies?.espnToken, accessToken),
  };
  // x-fantasy-filter causes 400 on settings/meta endpoints — only add for data views
  if (useFilter) {
    headers["x-fantasy-filter"] = JSON.stringify({ filterActive: { value: true } });
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "ESPN league is private — provide espn_s2 and SWID cookies to access it."
    );
  }
  if (!res.ok) {
    throw new Error(
      `ESPN returned ${res.status}. Check that your league ID is correct and the league exists for the ${new URL(url).pathname.match(/seasons\/(\d+)/)?.[1] ?? "current"} season.`
    );
  }
  return res.json() as Promise<T>;
}

function buildEspnUrl(
  leagueId: string | number,
  season: number,
  views: string[],
  scoringPeriod?: number
): string {
  const params = new URLSearchParams();
  for (const v of views) params.append("view", v);
  if (scoringPeriod !== undefined) params.set("scoringPeriodId", String(scoringPeriod));
  return `${ESPN_BASE}/${season}/segments/0/leagues/${leagueId}?${params}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EspnCredentials {
  espnS2?: string;
  swid?: string;
  espnToken?: string;    // ESPN-ONESITE.WEB-PROD.token cookie (newer ESPN auth)
  accessToken?: string;  // Bearer token extracted from ONESITE payload
}

/**
 * Validate that a league ID is accessible and return its name.
 * Throws if private league and no credentials provided, or if not found.
 */
export async function validateEspnLeague(
  leagueId: string,
  season = currentNflSeason(),
  creds?: EspnCredentials
): Promise<{ id: string; name: string; season: number }> {
  const url = buildEspnUrl(leagueId, season, ["mSettings"]);
  const data = await espnFetch<EspnLeagueResponse>(url, creds);
  return {
    id: String(data.id),
    name: data.settings?.name ?? `ESPN League ${leagueId}`,
    season: data.seasonId ?? season,
  };
}

/**
 * Parse raw ESPN API JSON (as returned by lm-api-reads) into normalized data.
 * Called both by fetchEspnLeagueData (direct API) and when using relay cache.
 */
export function parseEspnLeagueRaw(
  raw: unknown,
  leagueId: string,
  season: number,
  week?: number
) {
  return _parseEspnResponse(raw as EspnLeagueResponse, leagueId, season, week);
}

function _parseEspnResponse(
  data: EspnLeagueResponse,
  leagueId: string,
  season: number,
  week?: number
) {
  const currentWeek = week ?? data.status?.currentMatchupPeriod ?? 1;
  const totalWeeks  = data.settings?.scheduleSettings?.matchupPeriodCount ?? 14;

  const memberMap = new Map(
    (data.members ?? []).map((m) => [
      m.id,
      m.displayName ?? ([m.firstName, m.lastName].filter(Boolean).join(" ") || "Unknown"),
    ])
  );

  const normalizedLeague: NormalizedLeague = {
    id: `espn:${leagueId}`,
    platform: "espn",
    name: data.settings?.name ?? `League ${leagueId}`,
    season,
    currentWeek,
    totalWeeks,
    teamCount: data.teams?.length ?? 0,
    scoringType: espnScoringType(data.settings),
    rosterPositions: (() => {
      const counts = data.settings?.rosterSettings?.lineupSlotCounts ?? {};
      return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([slotId, count]) => ({
          position: ESPN_SLOT_MAP[Number(slotId)] ?? `Slot${slotId}`,
          count,
        }));
    })(),
    platformLeagueId: String(leagueId),
  };

  const teams: NormalizedTeam[] = (data.teams ?? []).map((t) => {
    const record = t.record?.overall;
    const ownerName = t.owners?.[0] ? (memberMap.get(t.owners[0]) ?? "Unknown") : "Unknown";
    return {
      id: `espn:${leagueId}:${t.id}`,
      leagueId: `espn:${leagueId}`,
      platform: "espn",
      name: [t.location, t.nickname].filter(Boolean).join(" ") || t.abbrev || `Team ${t.id}`,
      ownerName,
      record: { w: record?.wins ?? 0, l: record?.losses ?? 0, t: record?.ties ?? 0 },
      pointsFor: record?.pointsFor ?? 0,
      pointsAgainst: record?.pointsAgainst ?? 0,
      platformTeamKey: String(t.id),
    };
  });

  const weekMatchups = (data.schedule ?? []).filter(
    (m) => m.matchupPeriodId === currentWeek && m.home != null && m.away != null
  );
  const teamMap = new Map(teams.map((t) => [Number(t.platformTeamKey), t]));

  const matchups: NormalizedMatchup[] = weekMatchups.map((m) => {
    const teamA = teamMap.get(m.home.teamId);
    const teamB = teamMap.get(m.away.teamId);
    return {
      id: `espn:${leagueId}:${currentWeek}:${m.id}`,
      leagueId: `espn:${leagueId}`,
      platform: "espn",
      week: currentWeek,
      teamA: {
        teamId: `espn:${leagueId}:${m.home.teamId}`,
        teamName: teamA?.name ?? `Team ${m.home.teamId}`,
        points: m.home.totalPoints ?? 0,
        projectedPoints: m.home.totalProjectedPointsLive ?? 0,
        platformTeamKey: String(m.home.teamId),
      },
      teamB: {
        teamId: `espn:${leagueId}:${m.away.teamId}`,
        teamName: teamB?.name ?? `Team ${m.away.teamId}`,
        points: m.away.totalPoints ?? 0,
        projectedPoints: m.away.totalProjectedPointsLive ?? 0,
        platformTeamKey: String(m.away.teamId),
      },
      isComplete: m.winner !== "UNDECIDED",
    };
  });

  return {
    normalizedLeague,
    matchups,
    teams,
    meta: { leagueName: normalizedLeague.name, currentWeek, season },
    settings: { scoringType: normalizedLeague.scoringType, rosterPositions: normalizedLeague.rosterPositions },
    rosterPositions: normalizedLeague.rosterPositions,
  };
}

/** Full league data for the dashboard — matchups, standings, meta. */
export async function fetchEspnLeagueData(
  leagueId: string,
  season = currentNflSeason(),
  week?: number,
  creds?: EspnCredentials
) {
  const url = buildEspnUrl(leagueId, season, [
    "mTeam",
    "mMatchup",
    "mMatchupScore",
    "mSettings",
    "mStandings",
  ]);
  const data = await espnFetch<EspnLeagueResponse>(url, creds, true);
  return _parseEspnResponse(data, leagueId, season, week);
}

/** Fetch a single team's roster for a given week. */
export async function fetchEspnRoster(
  leagueId: string,
  espnTeamId: string | number,
  season = currentNflSeason(),
  week?: number,
  creds?: EspnCredentials
): Promise<NormalizedRoster> {
  const teamId = Number(espnTeamId);
  const url = buildEspnUrl(
    leagueId,
    season,
    ["mRoster", "mMatchupScore"],
    week
  );

  const data = await espnFetch<EspnLeagueResponse>(url, creds, true);
  const currentWeek = week ?? data.status?.currentMatchupPeriod ?? 1;

  // Find the matching schedule entry to get roster entries
  const scheduleEntry = (data.schedule ?? []).find(
    (m) => m.matchupPeriodId === currentWeek &&
      (m.home.teamId === teamId || m.away.teamId === teamId)
  );

  const side =
    scheduleEntry?.home.teamId === teamId
      ? scheduleEntry?.home
      : scheduleEntry?.away;

  const entries: EspnRosterEntry[] = side?.rosterForCurrentScoringPeriod?.entries ?? [];

  // If mRoster gave us nothing via schedule, try the team's roster directly
  const rosterEntries: EspnRosterEntry[] =
    entries.length > 0
      ? entries
      : (() => {
          const t = (data.teams ?? []).find((t) => t.id === teamId);
          // ESPN sometimes puts roster under team entry when view=mRoster used
          return (t as any)?.roster?.entries ?? [];
        })();

  const toPlayer = (entry: EspnRosterEntry): NormalizedPlayer => {
    const p = entry.playerPoolEntry.player;
    const slotName = ESPN_SLOT_MAP[entry.lineupSlotId] ?? "BN";
    const primaryPos = ESPN_POSITION_MAP[p.defaultPositionId] ?? String(p.defaultPositionId);

    // Find actual and projected stats for this scoring period
    const stats = p.stats ?? [];
    const actual = stats.find(
      (s) => s.scoringPeriodId === currentWeek && s.statSourceId === 0
    );
    const projected = stats.find(
      (s) => s.scoringPeriodId === currentWeek && s.statSourceId === 1
    );

    return {
      id: String(p.id),
      platform: "espn",
      name: p.fullName,
      position: slotName,
      primaryPosition: primaryPos,
      nflTeam: ESPN_TEAM_MAP[p.proTeamId] ?? String(p.proTeamId),
      status: espnPlayerStatus(p.injuryStatus),
      points: actual?.appliedTotal ?? entry.playerPoolEntry.appliedStatTotal ?? 0,
      projectedPoints: projected?.appliedTotal ?? 0,
      platformKey: String(p.id),
    };
  };

  const allPlayers = rosterEntries.map(toPlayer);
  const starters = allPlayers.filter(
    (p) => p.position !== "BN" && p.position !== "IR"
  );
  const bench = allPlayers.filter(
    (p) => p.position === "BN" || p.position === "IR"
  );

  return {
    teamId: `espn:${leagueId}:${teamId}`,
    leagueId: `espn:${leagueId}`,
    platform: "espn",
    week: currentWeek,
    starters,
    bench,
    all: allPlayers,
  };
}
