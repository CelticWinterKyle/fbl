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
