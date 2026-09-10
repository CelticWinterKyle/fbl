import { describe, it, expect } from "vitest";
import { canonicalNflAbbr, parseScoreboardKickoffs, applyKickoffs } from "../lib/nflKickoffs";

// Trimmed from the real week 1 2026 feed (NE at SEA, the Wednesday opener).
const SCOREBOARD = {
  events: [
    {
      date: "2026-09-10T00:20Z",
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { abbreviation: "SEA" } },
            { homeAway: "away", team: { abbreviation: "NE" } },
          ],
        },
      ],
    },
    {
      date: "2026-09-13T17:00Z",
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { abbreviation: "WSH" } },
            { homeAway: "away", team: { abbreviation: "JAX" } },
          ],
        },
      ],
    },
    { date: "not a date", competitions: [{ competitors: [] }] },
  ],
};

describe("canonicalNflAbbr", () => {
  it("maps every platform's spelling onto ESPN's", () => {
    expect(canonicalNflAbbr("Sea")).toBe("SEA"); // Yahoo title case
    expect(canonicalNflAbbr("Was")).toBe("WSH"); // Yahoo
    expect(canonicalNflAbbr("WAS")).toBe("WSH"); // Sleeper
    expect(canonicalNflAbbr("JAC")).toBe("JAX");
    expect(canonicalNflAbbr("LA")).toBe("LAR");
    expect(canonicalNflAbbr("WSH")).toBe("WSH");
  });

  it("returns null for free agents and junk", () => {
    expect(canonicalNflAbbr("FA")).toBeNull();
    expect(canonicalNflAbbr("")).toBeNull();
    expect(canonicalNflAbbr(undefined)).toBeNull();
    expect(canonicalNflAbbr(12)).toBeNull();
  });
});

describe("parseScoreboardKickoffs", () => {
  it("gives both teams of a game the kickoff, opponent and home flag", () => {
    const k = parseScoreboardKickoffs(SCOREBOARD);
    const ms = Date.parse("2026-09-10T00:20Z");
    expect(k.SEA).toEqual({ kickoffMs: ms, opponent: "NE", isHome: true });
    expect(k.NE).toEqual({ kickoffMs: ms, opponent: "SEA", isHome: false });
    expect(k.WSH.opponent).toBe("JAX");
    expect(Object.keys(k)).toHaveLength(4);
  });

  it("survives garbage", () => {
    expect(parseScoreboardKickoffs(null)).toEqual({});
    expect(parseScoreboardKickoffs({ events: "nope" })).toEqual({});
  });
});

describe("applyKickoffs", () => {
  const k = parseScoreboardKickoffs(SCOREBOARD);

  it("stamps players by team across platform spellings", () => {
    const cards = applyKickoffs(
      [
        { name: "Seahawks", team: "Sea", kickoffMs: null, opponent: null, isHome: null }, // Yahoo D/ST
        { name: "Drake Maye", team: "NE", kickoffMs: null, opponent: null, isHome: null },
        { name: "Trevor Lawrence", team: "JAC", kickoffMs: null, opponent: null, isHome: null },
      ],
      k
    );
    expect(cards[0].kickoffMs).toBe(Date.parse("2026-09-10T00:20Z"));
    expect(cards[0].opponent).toBe("NE");
    expect(cards[0].isHome).toBe(true);
    expect(cards[1].opponent).toBe("SEA");
    expect(cards[1].isHome).toBe(false);
    expect(cards[2].opponent).toBe("WSH");
  });

  it("matches NormalizedPlayer rows by nflTeam (the Yahoo roster path)", () => {
    const [seaDst] = applyKickoffs(
      [{ name: "Seattle", nflTeam: "Sea", kickoffMs: null, opponent: null, isHome: null }],
      k
    );
    expect(seaDst.kickoffMs).toBe(Date.parse("2026-09-10T00:20Z"));
    expect(seaDst.opponent).toBe("NE");
  });

  it("leaves a platform-supplied kickoff alone and skips byes and free agents", () => {
    const cards = applyKickoffs(
      [
        { name: "Has one", team: "SEA", kickoffMs: 123, opponent: "NE", isHome: true },
        { name: "On bye", team: "KC", kickoffMs: null, opponent: null, isHome: null },
        { name: "Free agent", team: "FA", kickoffMs: null, opponent: null, isHome: null },
      ],
      k
    );
    expect(cards[0].kickoffMs).toBe(123);
    expect(cards[1].kickoffMs).toBeNull();
    expect(cards[2].kickoffMs).toBeNull();
  });
});
