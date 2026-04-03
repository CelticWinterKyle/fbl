// ─── Core platform types ──────────────────────────────────────────────────────

export type Platform = "yahoo" | "espn" | "sleeper";

export type ScoringType = "standard" | "ppr" | "half_ppr" | "custom";

export type PlayerStatus = "active" | "questionable" | "doubtful" | "out" | "ir" | "bye";

// ─── League ──────────────────────────────────────────────────────────────────

export type RosterSlot = {
  position: string;
  count: number;
};

export type NormalizedLeague = {
  id: string;               // stable internal ID (e.g. "yahoo:461.l.123")
  platform: Platform;
  name: string;
  season: number;
  currentWeek: number;
  totalWeeks: number;
  teamCount: number;
  scoringType: ScoringType;
  tradeDeadlineWeek?: number;
  rosterPositions: RosterSlot[];
  platformLeagueId: string; // raw key as the platform knows it
};

// ─── Team ─────────────────────────────────────────────────────────────────────

export type NormalizedTeam = {
  id: string;
  leagueId: string;
  platform: Platform;
  name: string;
  ownerName: string;
  record: { w: number; l: number; t: number };
  pointsFor: number;
  pointsAgainst: number;
  streak?: { type: "W" | "L"; length: number };
  platformTeamKey: string;
};

// ─── Matchup ─────────────────────────────────────────────────────────────────

export type MatchupSide = {
  teamId: string;
  teamName: string;
  points: number;
  projectedPoints: number;
  platformTeamKey: string;
};

export type NormalizedMatchup = {
  id: string;
  leagueId: string;
  platform: Platform;
  week: number;
  teamA: MatchupSide;
  teamB: MatchupSide;
  isComplete: boolean;
};

// ─── Player ──────────────────────────────────────────────────────────────────

export type NormalizedPlayer = {
  id: string;              // platformPlayerKey
  platform: Platform;
  name: string;
  /** Roster slot (BN, QB, RB, WR, TE, K, DEF, FLEX, IR) */
  position: string;
  /** Player's actual position regardless of slot */
  primaryPosition: string;
  nflTeam: string;
  status?: PlayerStatus;
  points: number;
  projectedPoints: number;
  kickoffMs?: number | null;
  opponent?: string | null;
  isHome?: boolean | null;
  platformKey: string;
};

// ─── Roster ──────────────────────────────────────────────────────────────────

export type NormalizedRoster = {
  teamId: string;
  leagueId: string;
  platform: Platform;
  week: number | null;
  starters: NormalizedPlayer[];
  bench: NormalizedPlayer[];
  /** All players — starters + bench combined */
  all: NormalizedPlayer[];
};

// ─── Legacy shape (still used by existing UI — will migrate in Phase 4) ──────

export type LegacyMatchup = {
  aN: string; aP: number; aK: string;
  bN: string; bP: number; bK: string;
};

export type LegacyTeam = {
  name: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  owner: string;
};
