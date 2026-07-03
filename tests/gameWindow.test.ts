import { afterEach, describe, expect, it, vi } from "vitest";
import { isNflGameWindow } from "@/lib/gameWindow";

// All instants are explicit UTC. November/December dates are EST (UTC-5),
// so the ET mapping is unambiguous.
// Windows (ET): Sun 9:00 AM, Mon 7:00 PM, Thu 7:30 PM, Sat 1:00 PM, each to
// midnight plus a 2h spillover; Thanksgiving/Black Friday/Dec 24-26 from noon.

function at(utcIso: string): boolean {
  vi.setSystemTime(new Date(utcIso));
  return isNflGameWindow();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isNflGameWindow: regular slates", () => {
  it("is closed Sunday 8:00 AM ET (before the international slate)", () => {
    vi.useFakeTimers();
    // Sun Nov 15 2026, 8:00 AM EST = 13:00 UTC
    expect(at("2026-11-15T13:00:00Z")).toBe(false);
  });

  it("is open Sunday 9:30 AM ET (international kickoff)", () => {
    vi.useFakeTimers();
    // Sun Nov 15 2026, 9:30 AM EST = 14:30 UTC
    expect(at("2026-11-15T14:30:00Z")).toBe(true);
  });

  it("is open Sunday 1:00 PM ET (early games underway)", () => {
    vi.useFakeTimers();
    expect(at("2026-11-15T18:00:00Z")).toBe(true);
  });

  it("is open Sunday 11:50 PM ET (SNF still finishing)", () => {
    vi.useFakeTimers();
    // Sun Nov 15 2026, 11:50 PM EST = Mon Nov 16 04:50 UTC
    expect(at("2026-11-16T04:50:00Z")).toBe(true);
  });

  it("is open Monday 1:00 AM ET (Sunday spillover)", () => {
    vi.useFakeTimers();
    // Mon Nov 16 2026, 1:00 AM EST = 06:00 UTC
    expect(at("2026-11-16T06:00:00Z")).toBe(true);
  });

  it("is closed Monday 2:30 AM ET (spillover over)", () => {
    vi.useFakeTimers();
    expect(at("2026-11-16T07:30:00Z")).toBe(false);
  });

  it("is closed Monday noon ET", () => {
    vi.useFakeTimers();
    expect(at("2026-11-16T17:00:00Z")).toBe(false);
  });

  it("is open Monday 7:15 PM ET (MNF doubleheader early kick)", () => {
    vi.useFakeTimers();
    // Mon Nov 16 2026, 7:15 PM EST = Tue Nov 17 00:15 UTC
    expect(at("2026-11-17T00:15:00Z")).toBe(true);
  });

  it("is open Tuesday 1:15 AM ET (late MNF spillover)", () => {
    vi.useFakeTimers();
    // Tue Nov 17 2026, 1:15 AM EST = 06:15 UTC
    expect(at("2026-11-17T06:15:00Z")).toBe(true);
  });

  it("is closed Tuesday 2:05 AM ET (spillover over)", () => {
    vi.useFakeTimers();
    expect(at("2026-11-17T07:05:00Z")).toBe(false);
  });

  it("is closed Tuesday 1:00 PM ET", () => {
    vi.useFakeTimers();
    expect(at("2026-11-17T18:00:00Z")).toBe(false);
  });

  it("is open Thursday 8:20 PM ET (TNF)", () => {
    vi.useFakeTimers();
    // Thu Nov 19 2026, 8:20 PM EST = Fri Nov 20 01:20 UTC
    expect(at("2026-11-20T01:20:00Z")).toBe(true);
  });

  it("is closed Thursday 6:00 PM ET on a regular Thursday", () => {
    vi.useFakeTimers();
    expect(at("2026-11-19T23:00:00Z")).toBe(false);
  });

  it("is open Saturday 2:00 PM ET (late-season slate)", () => {
    vi.useFakeTimers();
    // Sat Dec 19 2026, 2:00 PM EST = 19:00 UTC
    expect(at("2026-12-19T19:00:00Z")).toBe(true);
  });

  it("is closed a regular Friday afternoon", () => {
    vi.useFakeTimers();
    // Fri Nov 13 2026, 1:00 PM EST = 18:00 UTC
    expect(at("2026-11-13T18:00:00Z")).toBe(false);
  });

  it("is closed a regular Wednesday", () => {
    vi.useFakeTimers();
    expect(at("2026-11-18T18:00:00Z")).toBe(false);
  });
});

describe("isNflGameWindow: holiday slates", () => {
  it("is open Thanksgiving 12:45 PM ET (Nov 26 2026, early game)", () => {
    vi.useFakeTimers();
    // Thu Nov 26 2026, 12:45 PM EST = 17:45 UTC
    expect(at("2026-11-26T17:45:00Z")).toBe(true);
  });

  it("is open Black Friday 3:00 PM ET (Nov 27 2026)", () => {
    vi.useFakeTimers();
    expect(at("2026-11-27T20:00:00Z")).toBe(true);
  });

  it("is open Christmas Day 1:30 PM ET (Dec 25 2026, a Friday)", () => {
    vi.useFakeTimers();
    expect(at("2026-12-25T18:30:00Z")).toBe(true);
  });

  it("is closed Christmas morning before the slate", () => {
    vi.useFakeTimers();
    // Fri Dec 25 2026, 9:00 AM EST = 14:00 UTC
    expect(at("2026-12-25T14:00:00Z")).toBe(false);
  });

  it("is open Dec 26 (Saturday) from the special noon start", () => {
    vi.useFakeTimers();
    // Sat Dec 26 2026, 12:30 PM EST = 17:30 UTC (before the 1 PM Saturday start)
    expect(at("2026-12-26T17:30:00Z")).toBe(true);
  });
});
