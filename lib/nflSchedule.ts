// ─── NFL season schedule: bye weeks ───────────────────────────────────────────
// One ESPN public scoreboard call per season (same site.api.espn.com source
// as lib/nflPlays.ts), reduced to a team-abbreviation -> bye-week map. A team
// is "on bye" in the regular-season week where it plays no game. Cached 7
// days; the schedule is immutable once published.

import { withCache } from "@/lib/cache";

const SEASON_URL = (season: number) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&limit=1000`;

/** Regular-season byes only occur in this window. */
const BYE_MIN_WEEK = 4;
const BYE_MAX_WEEK = 14;

export async function fetchNflByeWeeks(season: number): Promise<Record<string, number>> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    let raw: any;
    try {
      const res = await fetch(SEASON_URL(season), {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return {};
      raw = await res.json();
    } finally {
      clearTimeout(t);
    }

    const events: any[] = Array.isArray(raw?.events) ? raw.events : [];
    if (events.length === 0) return {};

    // week -> set of team abbreviations that played
    const played = new Map<number, Set<string>>();
    const allTeams = new Set<string>();
    for (const e of events) {
      const week = Number(e?.week?.number);
      if (!Number.isFinite(week)) continue;
      const competitors: any[] = e?.competitions?.[0]?.competitors ?? [];
      for (const c of competitors) {
        const abbr = String(c?.team?.abbreviation ?? "").toUpperCase();
        if (!abbr) continue;
        allTeams.add(abbr);
        const set = played.get(week) ?? new Set<string>();
        set.add(abbr);
        played.set(week, set);
      }
    }

    const byes: Record<string, number> = {};
    for (let week = BYE_MIN_WEEK; week <= BYE_MAX_WEEK; week++) {
      const playing = played.get(week);
      if (!playing || playing.size === 0) continue; // week not in data
      for (const team of allTeams) {
        if (!playing.has(team) && byes[team] === undefined) byes[team] = week;
      }
    }
    return byes;
  } catch {
    return {};
  }
}

/** Cached team-abbr -> bye week for a season; {} when the schedule is unavailable. */
export async function getNflByeWeeks(season: number): Promise<Record<string, number>> {
  if (!Number.isFinite(season) || season < 2000) return {};
  return withCache(`nfl:byes:${season}`, 7 * 24 * 3600, () => fetchNflByeWeeks(season));
}
