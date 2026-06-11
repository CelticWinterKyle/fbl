import { describe, expect, it } from "vitest";
import {
  buildMembership,
  freshPlays,
  tdPayloadsFor,
  isCloseMatchup,
  finalPayload,
} from "@/lib/pushDetect";
import type { ScoringPlay } from "@/lib/nflPlays";

const rosters = [
  {
    leagueId: "yahoo-1",
    leagueName: "Family Business",
    starters: [
      { name: "Patrick Mahomes", position: "QB", team: "KC" },
      { name: "Tyreek Hill", position: "WR", team: "MIA" },
      { name: "49ers", position: "DEF", team: "SF" },
    ],
  },
  {
    leagueId: "espn-2",
    leagueName: "Pigskin Court",
    starters: [
      { name: "Patrick Mahomes II", position: "QB", team: "KC" }, // suffix variant
      { name: "Bijan Robinson", position: "RB", team: "ATL" },
    ],
  },
];

function play(overrides: Partial<ScoringPlay>): ScoringPlay {
  return {
    id: "p1",
    gameId: "g1",
    typeText: "Passing Touchdown",
    category: "touchdown",
    isTouchdown: true,
    yards: 25,
    period: 2,
    clock: "8:00",
    teamAbbr: "KC",
    wallclockMs: 1_000,
    sortMs: 1_000,
    players: [],
    ...overrides,
  };
}

describe("buildMembership", () => {
  it("counts leagues per player across name variants and tracks defenses", () => {
    const m = buildMembership(rosters);
    expect(m.players.get("patrick mahomes")?.leagues).toEqual(["yahoo-1", "espn-2"]);
    expect(m.players.get("tyreek hill")?.leagues).toEqual(["yahoo-1"]);
    expect(m.defenses.get("SF")).toEqual(["yahoo-1"]);
  });
});

describe("freshPlays", () => {
  it("returns only plays newer than the cursor, oldest first", () => {
    const plays = [
      play({ id: "a", sortMs: 3_000 }),
      play({ id: "b", sortMs: 1_000 }),
      play({ id: "c", sortMs: 2_000 }),
    ];
    const { fresh, nextCursor } = freshPlays(plays, 1_000);
    expect(fresh.map((p) => p.id)).toEqual(["c", "a"]);
    expect(nextCursor).toBe(3_000);
  });
});

describe("tdPayloadsFor", () => {
  const membership = buildMembership(rosters);

  it("combines a user's passer and receiver on the same play", () => {
    const tdPlay = play({
      players: [
        { name: "Patrick Mahomes", role: "passer", isTeamDefense: false },
        { name: "Tyreek Hill", role: "receiver", isTeamDefense: false },
      ],
    });
    const payloads = tdPayloadsFor(membership, [tdPlay]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].title).toBe("Patrick Mahomes + Tyreek Hill TD");
    expect(payloads[0].body).toContain("Passing Touchdown, 25 yds");
    expect(payloads[0].body).toContain("yours in 2 leagues");
    expect(payloads[0].tag).toBe("td-p1");
  });

  it("matches team defenses by abbreviation", () => {
    const defPlay = play({
      id: "p2",
      typeText: "Interception Return Touchdown",
      teamAbbr: "SF",
      players: [{ name: "SF", role: "defense", isTeamDefense: true }],
    });
    const payloads = tdPayloadsFor(membership, [defPlay]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].title).toBe("SF D/ST TD");
  });

  it("ignores non-TD plays and players the user does not roster", () => {
    const fg = play({ id: "p3", isTouchdown: false, category: "field-goal" });
    const stranger = play({
      id: "p4",
      players: [{ name: "Josh Allen", role: "rusher", isTeamDefense: false }],
    });
    expect(tdPayloadsFor(membership, [fg, stranger])).toEqual([]);
  });
});

describe("isCloseMatchup", () => {
  it("is close within one score, with points on the board", () => {
    expect(isCloseMatchup(100.2, 95.4)).toBe(true);
    expect(isCloseMatchup(95.4, 100.2)).toBe(true);
    expect(isCloseMatchup(110, 90)).toBe(false);
    expect(isCloseMatchup(0, 0)).toBe(false);
    expect(isCloseMatchup(NaN, 90)).toBe(false);
  });
});

describe("finalPayload", () => {
  it("reports win, loss, and tie", () => {
    expect(finalPayload("League A", 120.5, 99.1).title).toBe("You won: League A");
    expect(finalPayload("League A", 90, 99.1).title).toBe("You lost: League A");
    expect(finalPayload("League A", 100, 100).title).toBe("Tied: League A");
  });
});
