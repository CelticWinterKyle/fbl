// Single source of truth for the current NFL fantasy season year.
// (Previously duplicated in lib/adapters/sleeper.ts and espn.ts, which risked drift.)

/**
 * Current NFL fantasy season year.
 *
 * The NFL season spans September through February. We treat September
 * (month index 8) through December as the new season's year, and January
 * through August as the prior season's year.
 *
 * The cutoff is September rather than August on purpose: during the
 * preseason window, ESPN/Sleeper may not have created the upcoming season's
 * league entry yet, so flipping early produces "league not found" errors.
 * Holding on the prior season through August keeps off-season views working;
 * once real games begin in September the season flips correctly.
 */
export function currentNflSeason(): number {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Which seasons to try for a stored ESPN connection, in order. ESPN keeps
 * serving the OLD season's league forever (no error, just stale data), so
 * when the stored season falls behind the calendar we must PREFER the
 * current season and fall back to the stored one only while ESPN hasn't
 * created the new season's entry yet (league not reactivated).
 */
export function espnSeasonsToTry(
  storedSeason: number,
  current: number = currentNflSeason()
): number[] {
  if (!Number.isFinite(storedSeason) || storedSeason <= 0) return [current];
  if (storedSeason < current) return [current, storedSeason];
  return [storedSeason];
}

/**
 * UTC ms for the Thursday that opens the given season's Week 1: the Thursday
 * after Labor Day (the first Monday in September). Anchored at 00:00 ET on
 * that Thursday, not the 8:20 PM kickoff, so the whole opening day counts as
 * in-season. September is always EDT, hence the fixed UTC-4 offset.
 */
export function nflWeek1KickoffMs(season: number): number {
  const sept1Dow = new Date(Date.UTC(season, 8, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - sept1Dow) % 7);
  return Date.UTC(season, 8, firstMonday + 3, 4, 0, 0);
}

/** Week 1 Thursday through the end of fantasy week 18 (18 weeks + spill). */
const SEASON_SPAN_MS = 126 * 24 * 3600 * 1000;

/**
 * Is a fantasy season actually being played right now?
 *
 * Distinct from currentNflSeason(), which only answers "which season year do
 * we query". Between the last week-18 game and the next Week 1 Thursday the
 * platforms keep serving the completed season's final week, so anything that
 * presents that data as the current week (live badges, "your week" records,
 * WINNING/LOSING) is lying. Callers use this to label it as final instead.
 */
export function isNflSeasonUnderway(now: Date = new Date()): boolean {
  const t = now.getTime();
  const year = now.getUTCFullYear();
  // Check this calendar year's season first, then last year's (January
  // playoffs still belong to the prior season).
  for (const season of [year, year - 1]) {
    const start = nflWeek1KickoffMs(season);
    if (t >= start && t < start + SEASON_SPAN_MS) return true;
  }
  return false;
}
