// Shared NFL game-window detection, used both server-side (to shorten cache
// TTLs for live scores) and client-side (to drive Game Day auto-refresh).
//
// Windows are in US Eastern time, with explicit end bounds so polling stops
// when the slate is over instead of running to midnight:
//   Sun  12:00 PM - 11:45 PM ET (early games through end of SNF)
//   Thu/Mon 7:30 PM - 11:45 PM ET (primetime)
//   Sat  1:00 PM - 11:45 PM ET (late-season Saturday slate)

const WINDOW_END = 1425; // 11:45 PM ET

export function isNflGameWindow(): boolean {
  try {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    if (day === 0) return mins >= 720 && mins < WINDOW_END; // Sunday 12:00 PM
    if (day === 1 || day === 4) return mins >= 1170 && mins < WINDOW_END; // Mon/Thu 7:30 PM
    if (day === 6) return mins >= 780 && mins < WINDOW_END; // Saturday 1:00 PM
    return false;
  } catch {
    return false;
  }
}
