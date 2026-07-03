// ─── Push detection: turn game events into per-user notifications ────────────
// Pure logic for the push-dispatch cron (app/api/cron/push-dispatch). Maps
// scoring plays to a user's rostered players (the FeedContent membership
// logic, server-side) and decides TD / close-game / final candidates.
// Everything here is side-effect free except the small KV cursor helpers at
// the bottom.

import type { ScoringPlay } from "@/lib/nflPlays";
import type { PushPayload } from "@/lib/push";
import { playerNameKey } from "@/lib/playerName";

// ─── Roster membership ────────────────────────────────────────────────────────

export type RosterLite = {
  leagueId: string;
  leagueName: string;
  /** Fantasy week the roster is for; enables bye-week matching when known */
  week?: number | null;
  starters: {
    name: string;
    position: string;
    team: string;
    /** Normalized injury status when known: active|questionable|doubtful|out|ir|bye */
    status?: string | null;
    /** Game start when known; an alert is pointless after kickoff */
    kickoffMs?: number | null;
  }[];
};

export type Membership = {
  /** nameKey -> display name + leagues that start the player */
  players: Map<string, { display: string; leagues: string[] }>;
  /** NFL team abbreviation -> leagues that start that team's defense */
  defenses: Map<string, string[]>;
};

const DEF_POSITIONS = new Set(["DEF", "DST", "D/ST", "D"]);

export function buildMembership(rosters: RosterLite[]): Membership {
  const players = new Map<string, { display: string; leagues: string[] }>();
  const defenses = new Map<string, string[]>();

  for (const roster of rosters) {
    const seen = new Set<string>();
    for (const p of roster.starters) {
      if (!p?.name) continue;
      if (DEF_POSITIONS.has((p.position || "").toUpperCase())) {
        const abbr = (p.team || "").toUpperCase();
        if (!abbr) continue;
        const list = defenses.get(abbr) ?? [];
        if (!list.includes(roster.leagueId)) list.push(roster.leagueId);
        defenses.set(abbr, list);
        continue;
      }
      const key = playerNameKey(p.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = players.get(key) ?? { display: p.name, leagues: [] };
      if (!entry.leagues.includes(roster.leagueId)) entry.leagues.push(roster.leagueId);
      players.set(key, entry);
    }
  }
  return { players, defenses };
}

// ─── Play cursor ──────────────────────────────────────────────────────────────

/** Plays strictly newer than the cursor, plus the next cursor value. */
export function freshPlays(
  plays: ScoringPlay[],
  cursorSortMs: number
): { fresh: ScoringPlay[]; nextCursor: number } {
  let nextCursor = cursorSortMs;
  const fresh: ScoringPlay[] = [];
  for (const play of plays) {
    if (play.sortMs > cursorSortMs) fresh.push(play);
    if (play.sortMs > nextCursor) nextCursor = play.sortMs;
  }
  // Oldest first so notifications arrive in game order.
  fresh.sort((a, b) => a.sortMs - b.sortMs);
  return { fresh, nextCursor };
}

// ─── TD candidates ────────────────────────────────────────────────────────────

const NOTIFY_ROLES = new Set(["passer", "rusher", "receiver", "returner"]);

function leagueCountLabel(n: number): string {
  return n === 1 ? "yours in 1 league" : `yours in ${n} leagues`;
}

/**
 * Notifications this user should get for a batch of fresh plays. One
 * notification per play; if several of the user's starters were in on the
 * same play (QB + WR), they share it.
 */
export function tdPayloadsFor(membership: Membership, fresh: ScoringPlay[]): PushPayload[] {
  const out: PushPayload[] = [];

  for (const play of fresh) {
    if (!play.isTouchdown) continue;

    const hitNames: string[] = [];
    const hitLeagues = new Set<string>();

    for (const player of play.players) {
      if (player.isTeamDefense) {
        const leagues = membership.defenses.get((player.name || "").toUpperCase());
        if (leagues?.length) {
          hitNames.push(`${player.name} D/ST`);
          leagues.forEach((l) => hitLeagues.add(l));
        }
        continue;
      }
      if (!NOTIFY_ROLES.has(player.role)) continue;
      const entry = membership.players.get(playerNameKey(player.name));
      if (entry) {
        hitNames.push(entry.display);
        entry.leagues.forEach((l) => hitLeagues.add(l));
      }
    }

    if (hitNames.length === 0) continue;

    const yards = play.yards !== null ? `, ${play.yards} yds` : "";
    out.push({
      title: `${hitNames.join(" + ")} TD`,
      body: `${play.typeText}${yards}. You have ${hitNames.length === 1 ? "him" : "them"} (${leagueCountLabel(hitLeagues.size)}).`,
      url: "/gameday",
      tag: `td-${play.id}`,
    });
  }
  return out;
}

// ─── Lineup alerts ────────────────────────────────────────────────────────────

/**
 * Pre-kickoff windows (ET) when lineup warnings fire: Sunday morning before
 * the early slate, and the run-up to Thursday/Monday night kickoffs. These
 * are OUTSIDE isNflGameWindow() on purpose: a warning during the game is
 * too late to act on.
 */
export function isLineupAlertWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const day = get("weekday");
  const mins = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  if (day === "Sun") return mins >= 9 * 60 && mins < 12 * 60 + 55; // 9:00am-12:55pm ET
  if (day === "Thu" || day === "Mon") return mins >= 17 * 60 && mins < 20 * 60 + 10; // 5:00-8:10pm ET
  return false;
}

/**
 * When the Coach's recap narrative may be GENERATED (reading a cached one is
 * allowed any time): Tuesday or Wednesday ET. After Monday Night Football
 * wraps (early Tue ET) every matchup is final, and the platforms have not
 * yet rolled currentWeek forward. Monday is deliberately excluded: scores
 * exist Monday afternoon but MNF starters are still pending.
 */
export function isRecapNarrativeWindow(now: Date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return day === "Tue" || day === "Wed";
}

/** Statuses that make a starter alert-worthy. Questionable is excluded: too noisy. */
const LINEUP_ALERT_STATUSES: Record<string, string> = {
  out: "OUT",
  ir: "on IR",
  doubtful: "Doubtful",
  bye: "on BYE",
};

export type LineupCandidate = {
  /** Dedupe key for markSentOnce (per player per day) */
  nameKey: string;
  payload: PushPayload;
};

/**
 * Inactive players still in the user's starting lineup, aggregated across
 * leagues. Skips players whose game already kicked off (too late to fix).
 * byeWeeks (team abbr -> bye week, from lib/nflSchedule.ts) catches byes the
 * platforms don't surface as a status: only Yahoo marks byes, and only via
 * the opponent field, so ESPN/Sleeper starters need the schedule lookup.
 */
export function lineupPayloadsFor(
  rosters: RosterLite[],
  nowMs: number,
  byeWeeks?: Record<string, number>
): LineupCandidate[] {
  const byKey = new Map<
    string,
    { display: string; label: string; leagues: Set<string> }
  >();

  for (const roster of rosters) {
    for (const p of roster.starters) {
      if (!p?.name) continue;
      let label = LINEUP_ALERT_STATUSES[(p.status ?? "").toLowerCase()];
      if (!label && byeWeeks && typeof roster.week === "number" && roster.week > 0) {
        const team = (p.team ?? "").toUpperCase();
        if (team && byeWeeks[team] === roster.week) label = LINEUP_ALERT_STATUSES.bye;
      }
      if (!label) continue;
      if (typeof p.kickoffMs === "number" && p.kickoffMs <= nowMs) continue;
      const key = playerNameKey(p.name);
      if (!key) continue;
      const entry = byKey.get(key) ?? { display: p.name, label, leagues: new Set<string>() };
      entry.leagues.add(roster.leagueId);
      byKey.set(key, entry);
    }
  }

  const out: LineupCandidate[] = [];
  for (const [nameKey, e] of byKey) {
    out.push({
      nameKey,
      payload: {
        title: `${e.display} is ${e.label}`,
        body: `Still in your starting lineup (${leagueCountLabel(e.leagues.size)}). Fix it before kickoff.`,
        url: "/gameday",
        tag: `lineup-${nameKey}`,
      },
    });
  }
  return out;
}

// ─── Close game / final ───────────────────────────────────────────────────────

/** A matchup is "close" when both sides have scored and it's within one score. */
export function isCloseMatchup(myPts: number, oppPts: number): boolean {
  if (!Number.isFinite(myPts) || !Number.isFinite(oppPts)) return false;
  if (Math.max(myPts, oppPts) <= 0) return false;
  return Math.abs(myPts - oppPts) <= 9;
}

export function closeGamePayload(
  leagueKey: string,
  leagueName: string,
  myPts: number,
  oppPts: number
): PushPayload {
  return {
    title: "Close one in " + leagueName,
    body: `${myPts.toFixed(1)} to ${oppPts.toFixed(1)}. Down to the wire.`,
    url: "/gameday",
    // Tag by the unique league key: two leagues sharing a display name must
    // not collapse into one notification on the device.
    tag: `close-${leagueKey}`,
  };
}

export function finalPayload(
  leagueKey: string,
  leagueName: string,
  myPts: number,
  oppPts: number
): PushPayload {
  const won = myPts > oppPts;
  const tied = myPts === oppPts;
  const headline = tied ? "Tied" : won ? "You won" : "You lost";
  return {
    title: `${headline}: ${leagueName}`,
    body: `Final: ${myPts.toFixed(1)} to ${oppPts.toFixed(1)}.`,
    url: "/gameday",
    tag: `final-${leagueKey}`,
  };
}

// ─── Weekly recap ─────────────────────────────────────────────────────────────

/**
 * One end-of-week push across all leagues. Only matchups with points on the
 * board count toward the record.
 */
export function recapPayload(
  results: { myPts: number; oppPts: number }[],
  week: number
): PushPayload | null {
  const scored = results.filter((r) => Math.max(r.myPts, r.oppPts) > 0);
  if (scored.length === 0) return null;
  const wins = scored.filter((r) => r.myPts > r.oppPts).length;
  const losses = scored.filter((r) => r.myPts < r.oppPts).length;
  return {
    title: `Your week: ${wins}-${losses}`,
    body: `Across ${scored.length} ${scored.length === 1 ? "league" : "leagues"}. Tap for the full recap.`,
    url: "/recap",
    tag: `recap-${week}`,
  };
}

// ─── Cursor + sent-guard storage (KV in prod, in-memory in dev) ───────────────

const memStore = new Map<string, unknown>();

function kvReady(): boolean {
  return !!process.env.KV_REST_API_URL;
}

export async function readCursor(key: string): Promise<number | null> {
  if (!kvReady()) return (memStore.get(key) as number | undefined) ?? null;
  const { kv } = await import("@vercel/kv");
  const v = await kv.get<number>(key);
  return typeof v === "number" ? v : null;
}

export async function writeCursor(key: string, value: number): Promise<void> {
  if (!kvReady()) {
    memStore.set(key, value);
    return;
  }
  const { kv } = await import("@vercel/kv");
  await kv.set(key, value);
}

/** True exactly once per key: first caller marks it sent (TTL bounded). */
export async function markSentOnce(key: string, ttlSeconds: number): Promise<boolean> {
  if (!kvReady()) {
    if (memStore.has(key)) return false;
    memStore.set(key, 1);
    return true;
  }
  const { kv } = await import("@vercel/kv");
  const set = await kv.set(key, 1, { nx: true, ex: ttlSeconds });
  return set === "OK";
}
