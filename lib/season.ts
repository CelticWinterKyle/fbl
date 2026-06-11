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
