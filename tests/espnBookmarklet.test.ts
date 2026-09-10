import { describe, it, expect } from "vitest";
import { buildEspnBookmarklet } from "../lib/espnBookmarklet";

describe("buildEspnBookmarklet", () => {
  const href = buildEspnBookmarklet("tok.123", "https://leagueblitz.app", 1_800_000_000);

  it("is a single-line javascript: URL carrying the token and both endpoints", () => {
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href).not.toContain("\n");
    expect(href).toContain('"tok.123"');
    expect(href).toContain("https://leagueblitz.app/api/espn/relay-creds");
    expect(href).toContain("https://leagueblitz.app/api/espn/relay");
  });

  it("is valid JavaScript after the template escaping", () => {
    // The body lives inside a TS template literal with doubled backslashes;
    // a slipped escape would make every user's bookmark a syntax error that
    // fails silently. new Function parses without executing.
    expect(() => new Function(href.slice("javascript:".length))).not.toThrow();
  });

  it("bakes in the expiry and the 15-minute new-league window", () => {
    // fresh-until = expires - 2h + 15min
    expect(href).toContain("E=1800000000");
    expect(href).toContain("F=1799993700");
  });

  it("skips the local expiry check when no expiry is known", () => {
    const h = buildEspnBookmarklet("t");
    expect(h).toContain("E=0,F=0");
    expect(() => new Function(h.slice("javascript:".length))).not.toThrow();
  });

  it("uses no em dashes in the messages users see", () => {
    expect(href).not.toContain("—");
  });
});
