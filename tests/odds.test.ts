import { describe, expect, it } from "vitest";
import { parseEspnScoreboardOdds } from "@/lib/odds";

// Realistic fixture matching ESPN's public scoreboard shape: one pre-game
// event with a full odds object, and one completed game with NO odds object
// (ESPN omits odds on finals).
const fixture = {
  events: [
    {
      id: "401547001",
      date: "2026-09-13T17:00Z",
      status: { type: { state: "pre" } },
      competitions: [
        {
          competitors: [
            {
              homeAway: "home",
              team: { abbreviation: "BUF", displayName: "Buffalo Bills" },
            },
            {
              homeAway: "away",
              team: { abbreviation: "KC", displayName: "Kansas City Chiefs" },
            },
          ],
          odds: [
            {
              provider: { name: "ESPN BET" },
              details: "KC -3.5",
              overUnder: 47.5,
              spread: 3.5,
              homeTeamOdds: { moneyLine: 120 },
              awayTeamOdds: { moneyLine: -140 },
            },
          ],
        },
      ],
    },
    {
      id: "401547002",
      date: "2026-09-10T00:15Z",
      status: { type: { state: "post" } },
      competitions: [
        {
          competitors: [
            {
              homeAway: "home",
              team: { abbreviation: "PHI", displayName: "Philadelphia Eagles" },
            },
            {
              homeAway: "away",
              team: { abbreviation: "DAL", displayName: "Dallas Cowboys" },
            },
          ],
          // no odds object: ESPN drops it once a game is final
        },
      ],
    },
  ],
};

describe("parseEspnScoreboardOdds", () => {
  it("normalizes a pre-game event with full odds", () => {
    const games = parseEspnScoreboardOdds(fixture);
    expect(games).toHaveLength(2);

    const g = games[0];
    expect(g.gameId).toBe("401547001");
    expect(g.kickoff).toBe("2026-09-13T17:00Z");
    expect(g.state).toBe("pre");
    expect(g.home).toEqual({ name: "Buffalo Bills", abbrev: "BUF", moneyline: 120 });
    expect(g.away).toEqual({ name: "Kansas City Chiefs", abbrev: "KC", moneyline: -140 });
    expect(g.spread).toEqual({ favorite: "KC", line: -3.5, details: "KC -3.5" });
    expect(g.total).toBe(47.5);
    expect(g.provider).toBe("ESPN BET");
  });

  it("still returns a completed game with no odds object, with null lines", () => {
    const games = parseEspnScoreboardOdds(fixture);
    const g = games[1];
    expect(g.gameId).toBe("401547002");
    expect(g.state).toBe("post");
    expect(g.home).toEqual({ name: "Philadelphia Eagles", abbrev: "PHI", moneyline: null });
    expect(g.away).toEqual({ name: "Dallas Cowboys", abbrev: "DAL", moneyline: null });
    expect(g.spread).toEqual({ favorite: null, line: null, details: null });
    expect(g.total).toBeNull();
    expect(g.provider).toBe("");
  });

  it("falls back to the numeric spread when details does not parse", () => {
    const games = parseEspnScoreboardOdds({
      events: [
        {
          id: "1",
          date: "2026-09-13T20:25Z",
          status: { type: { state: "pre" } },
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { abbreviation: "NYJ", displayName: "New York Jets" } },
                { homeAway: "away", team: { abbreviation: "MIA", displayName: "Miami Dolphins" } },
              ],
              odds: [{ provider: { name: "ESPN BET" }, details: "EVEN", spread: 0 }],
            },
          ],
        },
      ],
    });
    expect(games).toHaveLength(1);
    expect(games[0].spread).toEqual({ favorite: null, line: 0, details: "EVEN" });
    expect(games[0].total).toBeNull();
  });

  it("handles a partial odds object (details only, no moneylines or total)", () => {
    const games = parseEspnScoreboardOdds({
      events: [
        {
          id: "2",
          date: "2026-09-14T00:20Z",
          status: { type: { state: "pre" } },
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { abbreviation: "DET", displayName: "Detroit Lions" } },
                { homeAway: "away", team: { abbreviation: "GB", displayName: "Green Bay Packers" } },
              ],
              odds: [{ provider: { name: "ESPN BET" }, details: "DET -6.5" }],
            },
          ],
        },
      ],
    });
    expect(games).toHaveLength(1);
    expect(games[0].spread).toEqual({ favorite: "DET", line: -6.5, details: "DET -6.5" });
    expect(games[0].home.moneyline).toBeNull();
    expect(games[0].away.moneyline).toBeNull();
    expect(games[0].total).toBeNull();
  });

  it("returns [] for garbage input", () => {
    expect(parseEspnScoreboardOdds({})).toEqual([]);
    expect(parseEspnScoreboardOdds(null)).toEqual([]);
    expect(parseEspnScoreboardOdds(undefined)).toEqual([]);
    expect(parseEspnScoreboardOdds("nonsense")).toEqual([]);
    expect(parseEspnScoreboardOdds({ events: "not-an-array" })).toEqual([]);
    // Events missing competitions/competitors are skipped, not fatal.
    expect(parseEspnScoreboardOdds({ events: [{}, { competitions: [] }, { competitions: [{}] }] })).toEqual([]);
  });
});
