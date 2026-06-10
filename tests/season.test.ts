import { afterEach, describe, expect, it, vi } from "vitest";
import { currentNflSeason } from "@/lib/season";

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
