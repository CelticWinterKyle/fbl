// Which season Game Day should treat as "now", and which leagues are behind it.
//
// Platforms keep serving a finished season until the commissioner opens the
// next one, and they do it one league at a time. In early September two Yahoo
// leagues sit at 2026 week 1 while an ESPN league nobody reactivated still
// answers with 2025's final week. Labelling the page by the newest week on
// screen (17) or by the oldest season (2025 finals) is wrong either way; each
// league has to be judged against the season the rest of the screen is in.

/**
 * The season the page is "in". Before kickoff nothing forces a league forward
 * (a platform that has not opened next season yet simply has not), so the
 * newest league on screen decides. Once games are being played the calendar
 * decides, so a screen where NO league rolled over still reads as behind.
 */
export function expectedSeason(
  seasons: number[],
  seasonUnderway: boolean,
  calendarSeason: number
): number {
  const latest = seasons.reduce((max, s) => (Number.isFinite(s) && s > max ? s : max), 0);
  return seasonUnderway ? Math.max(latest, calendarSeason) : latest;
}

/** A league still serving an older season than the page is in. */
export function isBehind(season: number, expected: number): boolean {
  return Number.isFinite(season) && season > 0 && season < expected;
}
