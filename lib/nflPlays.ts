// ─── NFL play-by-play (ESPN public sports API) ─────────────────────────────────
// Source of real scoring plays for the Live Feed. This is ESPN's FREE, public
// sports API (site.api.espn.com) — completely separate from the fantasy API and
// requiring no auth. It's NFL-wide, so it works the same regardless of which
// fantasy platform a league lives on. We pull each in-progress / final game's
// scoring plays, parse the play text into structured players + yardage, and the
// feed overlays which of the user's rostered players were involved.

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlayCategory =
  | "touchdown"
  | "field-goal"
  | "two-point"
  | "safety"
  | "other";

export type PlayRole =
  | "passer"
  | "receiver"
  | "rusher"
  | "kicker"
  | "defense"
  | "returner";

export type ScoringPlayPlayer = {
  name: string; // player as ESPN wrote it (or the scoring team, for a defense)
  role: PlayRole;
  isTeamDefense: boolean;
};

export type ScoringPlay = {
  id: string;
  gameId: string;
  typeText: string; // ESPN's label, e.g. "Passing Touchdown"
  category: PlayCategory;
  isTouchdown: boolean;
  yards: number | null;
  period: number;
  clock: string; // "8:00"
  teamAbbr: string; // the scoring team's abbreviation
  wallclockMs: number | null; // real timestamp when available
  sortMs: number; // monotonic key for newest-first ordering
  players: ScoringPlayPlayer[];
};

export type NflScoringFeed = {
  plays: ScoringPlay[];
  week: number | null;
  season: number | null;
  fetchedAtMs: number;
};

// ─── Fetch helper (with timeout) ──────────────────────────────────────────────

async function getJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // ESPN's public endpoints are CDN-cached; let our own withCache layer own TTL.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── Play-text parsing ────────────────────────────────────────────────────────

// Strip ALL parentheticals, e.g. the PAT "(Harrison Butker Kick)" — real ESPN
// text sometimes carries two of them, and a trailing-only strip would leak a
// "(...)" into the captured passer/receiver name.
function stripParenthetical(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

// Clean a captured name: trim, collapse spaces. ESPN occasionally prefixes the
// scoring summary with down/distance noise; the patterns anchor on the verb so
// the name capture stays tight, but we guard against stray leading tokens.
function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Parse an ESPN scoring-play description into the fantasy-relevant players and
 * yardage. Returns the involved players (role-tagged) and parsed yards. Handles
 * the common NFL scoring-play phrasings; unknown phrasings degrade to no players
 * (the play is then simply not shown, since the feed is roster-scoped).
 */
export function parsePlayText(
  text: string,
  typeText: string,
  teamAbbr: string
): { players: ScoringPlayPlayer[]; yards: number | null; category: PlayCategory; isTouchdown: boolean } {
  const core = stripParenthetical(text);
  const type = (typeText || "").toLowerCase();
  const lower = core.toLowerCase();
  const players: ScoringPlayPlayer[] = [];
  let yards: number | null = null;

  // Defensive / special-teams scores credit the team D/ST in fantasy, so we key
  // defense entries by the scoring team's abbreviation (matched against rostered
  // DEF slots), not the individual defender named in the play text.
  const teamDef = (): ScoringPlayPlayer => ({ name: teamAbbr, role: "defense", isTeamDefense: true });

  let category: PlayCategory = "other";
  let isTouchdown = false;

  // ── Safety ──
  if (type.includes("safety") || /\bsafety\b/i.test(core)) {
    return { players: [teamDef()], yards: null, category: "safety", isTouchdown: false };
  }

  // ── Field goal ──
  let m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+Field\s+Goal/i);
  if (m) {
    yards = Number(m[2]);
    players.push({ name: cleanName(m[1]), role: "kicker", isTeamDefense: false });
    return { players, yards, category: "field-goal", isTouchdown: false };
  }

  // ── Passing TD: "Passer N Yd pass to Receiver" ──
  m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+pass\s+to\s+(.+)$/i);
  if (m) {
    yards = Number(m[2]);
    players.push({ name: cleanName(m[1]), role: "passer", isTeamDefense: false });
    players.push({ name: cleanName(m[3]), role: "receiver", isTeamDefense: false });
    return { players, yards, category: "touchdown", isTouchdown: true };
  }

  // ── Passing TD alt: "Receiver N Yd pass from Passer" ──
  m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+pass\s+from\s+(.+)$/i);
  if (m) {
    yards = Number(m[2]);
    players.push({ name: cleanName(m[3]), role: "passer", isTeamDefense: false });
    players.push({ name: cleanName(m[1]), role: "receiver", isTeamDefense: false });
    return { players, yards, category: "touchdown", isTouchdown: true };
  }

  // ── Rushing TD: "Rusher N Yd Run" ──
  m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+(?:Run|Rush)\b/i);
  if (m) {
    yards = Number(m[2]);
    players.push({ name: cleanName(m[1]), role: "rusher", isTeamDefense: false });
    return { players, yards, category: "touchdown", isTouchdown: true };
  }

  // ── Interception / fumble return TD → team defense ──
  m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+(?:Interception|Fumble)\s+Return/i);
  if (m) {
    yards = Number(m[2]);
    players.push(teamDef());
    return { players, yards, category: "touchdown", isTouchdown: true };
  }

  // ── Kickoff / punt return TD → returner (skill) + team defense/ST ──
  m = core.match(/^(.+?)\s+(\d+)\s+Yd\s+(?:Kickoff|Punt)\s+Return/i);
  if (m) {
    yards = Number(m[2]);
    players.push({ name: cleanName(m[1]), role: "returner", isTeamDefense: false });
    players.push(teamDef());
    return { players, yards, category: "touchdown", isTouchdown: true };
  }

  // ── Two-point conversion ──
  if (type.includes("two-point") || /two-point|two point/i.test(core)) {
    return { players: [], yards: null, category: "two-point", isTouchdown: false };
  }

  // ── Generic touchdown fallback (covers phrasings we didn't anchor) ──
  if (type.includes("touchdown") || /\btouchdown\b/i.test(lower)) {
    isTouchdown = true;
    category = "touchdown";
  }

  return { players, yards, category, isTouchdown };
}

// ─── Per-game scoring plays ────────────────────────────────────────────────────

function teamAbbrFromId(competitors: any[], teamId: string | undefined): string {
  if (!teamId) return "";
  const c = competitors.find((x) => String(x?.team?.id ?? x?.id) === String(teamId));
  return c?.team?.abbreviation ?? "";
}

function clockToSeconds(display: string | undefined): number {
  if (!display) return 0;
  const [mm, ss] = display.split(":").map((n) => Number(n));
  if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss;
  return 0;
}

async function fetchGameScoringPlays(
  gameId: string,
  gameDateMs: number,
  competitors: any[]
): Promise<ScoringPlay[]> {
  const summary = await getJson(`${SUMMARY_URL}?event=${encodeURIComponent(gameId)}`);
  const raw: any[] = summary?.scoringPlays ?? [];
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const out: ScoringPlay[] = [];
  for (const p of raw) {
    const text: string = p?.text ?? "";
    const typeText: string = p?.type?.text ?? p?.scoringType?.displayName ?? "";
    if (!text) continue;

    const period = Number(p?.period?.number ?? 0);
    const clock = String(p?.clock?.displayValue ?? "");
    const teamAbbr = teamAbbrFromId(competitors, p?.team?.id);
    const { players, yards, category, isTouchdown } = parsePlayText(text, typeText, teamAbbr);

    // Skip plays we can't tie to a fantasy-relevant player (e.g. lone extra
    // points, or phrasings we couldn't parse) — the feed is roster-scoped.
    if (players.length === 0) continue;

    const wallclockMs = p?.wallclock ? Date.parse(p.wallclock) : NaN;
    const validWall = Number.isFinite(wallclockMs);
    // Newest-first ordering: prefer the real timestamp; otherwise approximate
    // from game date + game progress (later period / lower clock = more recent).
    const sortMs = validWall
      ? (wallclockMs as number)
      : gameDateMs + period * 15 * 60 * 1000 + (15 * 60 - clockToSeconds(clock)) * 1000;

    out.push({
      id: String(p?.id ?? `${gameId}:${period}:${clock}:${text.slice(0, 24)}`),
      gameId,
      typeText: typeText || (isTouchdown ? "Touchdown" : "Score"),
      category,
      isTouchdown,
      yards,
      period,
      clock,
      teamAbbr,
      wallclockMs: validWall ? (wallclockMs as number) : null,
      sortMs,
      players,
    });
  }
  return out;
}

// ─── Week feed ──────────────────────────────────────────────────────────────

/**
 * Fetch this week's scoring plays across every in-progress / completed NFL game.
 * NOT user-specific, so it's safe to cache globally. The feed route overlays the
 * user's rosters on top of this.
 */
export async function fetchNflScoringFeed(): Promise<NflScoringFeed> {
  const board = await getJson(SCOREBOARD_URL);
  const fetchedAtMs = Date.now();
  const events: any[] = board?.events ?? [];
  const week: number | null = board?.week?.number ?? null;
  const season: number | null = board?.season?.year ?? null;

  // Only games that are live or final have plays; skip pre-game.
  const liveOrDone = events.filter((e) => {
    const state = e?.status?.type?.state;
    return state === "in" || state === "post";
  });

  const perGame = await Promise.all(
    liveOrDone.map(async (e) => {
      try {
        const comp = e?.competitions?.[0];
        const competitors: any[] = comp?.competitors ?? [];
        const gameDateMs = Date.parse(e?.date ?? comp?.date ?? "") || fetchedAtMs;
        return await fetchGameScoringPlays(String(e?.id), gameDateMs, competitors);
      } catch {
        return [] as ScoringPlay[];
      }
    })
  );

  // Flatten, dedupe by id, newest first.
  const seen = new Set<string>();
  const plays: ScoringPlay[] = [];
  for (const p of perGame.flat()) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    plays.push(p);
  }
  plays.sort((a, b) => b.sortMs - a.sortMs);

  return { plays, week, season, fetchedAtMs };
}
