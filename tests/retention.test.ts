import { describe, expect, it } from "vitest";
import { YAHOO_RETENTION_S } from "@/lib/retention";
import { nflWeek1KickoffMs } from "@/lib/season";

// The window has to satisfy two things at once: a connection made at any point
// in a season must survive that whole season, and must not survive into the
// next one (or the data is being kept indefinitely in practice).

const SEASON_SPAN_MS = 126 * 24 * 3600 * 1000;

describe("YAHOO_RETENTION_S", () => {
  it("outlives a season for a connection made on opening day", () => {
    const week1 = nflWeek1KickoffMs(2026);
    const expiresAt = week1 + YAHOO_RETENTION_S * 1000;
    expect(expiresAt).toBeGreaterThan(week1 + SEASON_SPAN_MS);
  });

  it("expires before the following season opens", () => {
    const week1 = nflWeek1KickoffMs(2026);
    const expiresAt = week1 + YAHOO_RETENTION_S * 1000;
    expect(expiresAt).toBeLessThan(nflWeek1KickoffMs(2027));
  });

  it("still expires before the next season for a preseason connection", () => {
    // Connecting in August, the earliest anyone realistically sets up.
    const august = Date.UTC(2026, 7, 1);
    expect(august + YAHOO_RETENTION_S * 1000).toBeLessThan(nflWeek1KickoffMs(2027));
  });
});
