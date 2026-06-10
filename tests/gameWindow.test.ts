import { afterEach, describe, expect, it, vi } from "vitest";
import { isNflGameWindow } from "@/lib/gameWindow";

// All instants are explicit UTC and chosen in November 2025, when US Eastern
// is EST (UTC-5), so the ET mapping is unambiguous.
// Windows (ET): Sun 12:00 PM - 11:45 PM, Mon/Thu 7:30 PM - 11:45 PM,
// Sat 1:00 PM - 11:45 PM.

function at(utcIso: string): boolean {
  vi.setSystemTime(new Date(utcIso));
  return isNflGameWindow();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isNflGameWindow", () => {
  it("is closed Sunday 11:00 AM ET (before the early slate)", () => {
    vi.useFakeTimers();
    // Sun Nov 16 2025, 11:00 AM EST = 16:00 UTC
    expect(at("2025-11-16T16:00:00Z")).toBe(false);
  });

  it("is open Sunday 1:00 PM ET (early games underway)", () => {
    vi.useFakeTimers();
    // Sun Nov 16 2025, 1:00 PM EST = 18:00 UTC
    expect(at("2025-11-16T18:00:00Z")).toBe(true);
  });

  it("is closed Sunday 11:50 PM ET (after the SNF cutoff)", () => {
    vi.useFakeTimers();
    // Sun Nov 16 2025, 11:50 PM EST = Mon Nov 17 04:50 UTC
    expect(at("2025-11-17T04:50:00Z")).toBe(false);
  });

  it("is closed on Tuesday", () => {
    vi.useFakeTimers();
    // Tue Nov 18 2025, 1:00 PM EST = 18:00 UTC
    expect(at("2025-11-18T18:00:00Z")).toBe(false);
  });

  it("is open Monday 8:00 PM ET (MNF)", () => {
    vi.useFakeTimers();
    // Mon Nov 17 2025, 8:00 PM EST = Tue Nov 18 01:00 UTC
    expect(at("2025-11-18T01:00:00Z")).toBe(true);
  });
});
