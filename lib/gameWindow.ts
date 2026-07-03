// Shared NFL game-window detection, used both server-side (to shorten cache
// TTLs for live scores) and client-side (to drive Game Day auto-refresh).
//
// Windows are in US Eastern time. Regular slates:
//   Sun  9:00 AM - midnight ET (covers 9:30 AM international kickoffs
//        through the end of SNF)
//   Mon  7:00 PM - midnight ET (MNF, including doubleheader early kicks)
//   Thu  7:30 PM - midnight ET (TNF)
//   Sat  1:00 PM - midnight ET (late-season Saturday slate)
// Special slates (checked by date, any year):
//   Thanksgiving Thursday and Black Friday from 12:00 PM ET
//   Dec 24-26 from 12:00 PM ET regardless of weekday (holiday games)
// Every window also spills 2 hours past midnight ET so a late Monday/Sunday
// night game (10:15 PM West Coast kick, overtime) keeps live scores, TD
// pushes, and short cache TTLs until it actually ends.

const SPILL_END_MINS = 120; // 2:00 AM ET the next calendar day

type EtParts = { day: number; mins: number; month: number; date: number };

function etPartsAt(instant: Date): EtParts {
  const et = new Date(instant.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return {
    day: et.getDay(),
    mins: et.getHours() * 60 + et.getMinutes(),
    month: et.getMonth(),
    date: et.getDate(),
  };
}

/** Thanksgiving is the 4th Thursday of November: Nov 22-28. */
function isThanksgiving(p: EtParts): boolean {
  return p.month === 10 && p.day === 4 && p.date >= 22 && p.date <= 28;
}

/** The Friday after Thanksgiving: Nov 23-29. */
function isBlackFriday(p: EtParts): boolean {
  return p.month === 10 && p.day === 5 && p.date >= 23 && p.date <= 29;
}

/** Dec 24-26: holiday slate lands here whatever the weekday. */
function isChristmasSlate(p: EtParts): boolean {
  return p.month === 11 && p.date >= 24 && p.date <= 26;
}

/** Window start in ET minutes for the given day, or null when no window. */
function windowStartMins(p: EtParts): number | null {
  const special =
    isThanksgiving(p) || isBlackFriday(p) || isChristmasSlate(p) ? 720 : null; // 12:00 PM

  let regular: number | null = null;
  if (p.day === 0) regular = 540; // Sunday 9:00 AM
  else if (p.day === 1) regular = 1140; // Monday 7:00 PM
  else if (p.day === 4) regular = 1170; // Thursday 7:30 PM
  else if (p.day === 6) regular = 780; // Saturday 1:00 PM

  if (special !== null && regular !== null) return Math.min(special, regular);
  return special ?? regular;
}

export function isNflGameWindow(now: Date = new Date()): boolean {
  try {
    const p = etPartsAt(now);

    const start = windowStartMins(p);
    if (start !== null && p.mins >= start) return true;

    // Post-midnight spillover from the previous day's window.
    if (p.mins < SPILL_END_MINS) {
      const prev = etPartsAt(new Date(now.getTime() - 24 * 3600 * 1000));
      if (windowStartMins(prev) !== null) return true;
    }

    return false;
  } catch {
    return false;
  }
}
