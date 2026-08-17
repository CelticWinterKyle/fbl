import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentNflSeason,
  espnSeasonsToTry,
  isNflSeasonUnderway,
  nflWeek1KickoffMs,
} from "@/lib/season";

// currentNflSeason uses LOCAL month; vitest.config.ts pins TZ=UTC so these
// instants map 1:1 to the asserted months.

function at(utcIso: string): number {
  vi.setSystemTime(new Date(utcIso));
  return currentNflSeason();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("currentNflSeason", () => {
  it("returns the prior year through August (preseason holds the old season)", () => {
    vi.useFakeTimers();
    expect(at("2025-08-31T23:59:59Z")).toBe(2024);
  });

  it("flips to the new season on September 1", () => {
    vi.useFakeTimers();
    expect(at("2025-09-01T00:00:00Z")).toBe(2025);
  });

  it("stays on the season year through December", () => {
    vi.useFakeTimers();
    expect(at("2025-12-15T12:00:00Z")).toBe(2025);
  });

  it("keeps the prior season's year through the January/February playoffs", () => {
    vi.useFakeTimers();
    expect(at("2026-01-15T12:00:00Z")).toBe(2025);
    expect(at("2026-02-08T12:00:00Z")).toBe(2025);
  });

  it("holds the prior season in July (off-season)", () => {
    vi.useFakeTimers();
    expect(at("2026-07-04T12:00:00Z")).toBe(2025);
  });
});

describe("espnSeasonsToTry", () => {
  it("uses only the stored season while it matches the calendar", () => {
    expect(espnSeasonsToTry(2026, 2026)).toEqual([2026]);
  });

  it("prefers the current season and falls back when the stored season is behind", () => {
    // The September flip: a league connected in June 2026 stored 2025.
    expect(espnSeasonsToTry(2025, 2026)).toEqual([2026, 2025]);
  });

  it("never proposes moving backwards", () => {
    // Stored ahead of the calendar (connected from ESPN's next-season page in preseason).
    expect(espnSeasonsToTry(2026, 2025)).toEqual([2026]);
  });

  it("recovers from a missing/garbage stored season", () => {
    expect(espnSeasonsToTry(0, 2026)).toEqual([2026]);
    expect(espnSeasonsToTry(NaN, 2026)).toEqual([2026]);
  });
});

describe("nflWeek1KickoffMs", () => {
  it("lands on the Thursday after Labor Day", () => {
    // Real opening Thursdays: 2024-09-05, 2025-09-04, 2026-09-10.
    expect(new Date(nflWeek1KickoffMs(2024)).toISOString()).toBe("2024-09-05T04:00:00.000Z");
    expect(new Date(nflWeek1KickoffMs(2025)).toISOString()).toBe("2025-09-04T04:00:00.000Z");
    expect(new Date(nflWeek1KickoffMs(2026)).toISOString()).toBe("2026-09-10T04:00:00.000Z");
  });

  it("handles September starting on a Monday (Labor Day is the 1st)", () => {
    // 2031-09-01 is a Monday, so week 1 opens Thursday the 4th.
    expect(new Date(nflWeek1KickoffMs(2031)).toISOString()).toBe("2031-09-04T04:00:00.000Z");
  });
});

describe("isNflSeasonUnderway", () => {
  it("is false in the preseason, when platforms still serve last season's finals", () => {
    // The 2026 case this guards: Game Day showed the 2025 week 17 finals.
    expect(isNflSeasonUnderway(new Date("2026-08-17T12:00:00Z"))).toBe(false);
    expect(isNflSeasonUnderway(new Date("2026-09-09T23:00:00Z"))).toBe(false);
  });

  it("is true from the week 1 opener through the end of week 18", () => {
    expect(isNflSeasonUnderway(new Date("2026-09-10T04:00:00Z"))).toBe(true);
    expect(isNflSeasonUnderway(new Date("2026-11-23T12:00:00Z"))).toBe(true);
    expect(isNflSeasonUnderway(new Date("2027-01-01T12:00:00Z"))).toBe(true);
  });

  it("is false again once the fantasy season has run out", () => {
    // 126 days past 2026-09-10 is mid-January, after week 18.
    expect(isNflSeasonUnderway(new Date("2027-02-01T12:00:00Z"))).toBe(false);
    expect(isNflSeasonUnderway(new Date("2027-06-01T12:00:00Z"))).toBe(false);
  });
});
