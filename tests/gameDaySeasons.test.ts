import { describe, it, expect } from "vitest";
import { expectedSeason, isBehind } from "../lib/gameDaySeasons";

describe("expectedSeason", () => {
  it("before kickoff, the newest league on screen decides", () => {
    // Two Yahoo leagues at 2026 week 1, one ESPN league still on 2025 finals.
    expect(expectedSeason([2026, 2026, 2025], false, 2026)).toBe(2026);
  });

  it("before kickoff, a screen where nothing rolled over is not behind", () => {
    // August: every platform still serves last season. That is the finished
    // season, not a stale one, so the "Season complete" framing applies.
    expect(expectedSeason([2025, 2025], false, 2026)).toBe(2025);
  });

  it("once games are underway the calendar wins", () => {
    expect(expectedSeason([2025, 2025], true, 2026)).toBe(2026);
  });

  it("ignores junk seasons", () => {
    expect(expectedSeason([NaN, 0, 2026], false, 2026)).toBe(2026);
    expect(expectedSeason([], false, 2026)).toBe(0);
  });
});

describe("isBehind", () => {
  it("flags only leagues older than the expected season", () => {
    expect(isBehind(2025, 2026)).toBe(true);
    expect(isBehind(2026, 2026)).toBe(false);
    expect(isBehind(2027, 2026)).toBe(false);
  });

  it("never flags an unknown season", () => {
    expect(isBehind(0, 2026)).toBe(false);
    expect(isBehind(NaN, 2026)).toBe(false);
  });
});
