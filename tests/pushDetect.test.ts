import { describe, expect, it } from "vitest";
import {
  buildMembership,
  freshPlays,
  tdPayloadsFor,
  isCloseMatchup,
  finalPayload,
  isLineupAlertWindow,
  lineupPayloadsFor,
  recapPayload,
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

describe("isLineupAlertWindow", () => {
  // June 2026 is EDT (UTC-4): 9:00am ET = 13:00 UTC.
  it("opens Sunday morning ET and closes before the early slate", () => {
    expect(isLineupAlertWindow(new Date("2026-06-14T13:00:00Z"))).toBe(true); // Sun 9:00am
    expect(isLineupAlertWindow(new Date("2026-06-14T16:54:00Z"))).toBe(true); // Sun 12:54pm
    expect(isLineupAlertWindow(new Date("2026-06-14T17:00:00Z"))).toBe(false); // Sun 1:00pm
    expect(isLineupAlertWindow(new Date("2026-06-14T12:00:00Z"))).toBe(false); // Sun 8:00am
  });

  it("opens before Thursday and Monday night kickoffs", () => {
    expect(isLineupAlertWindow(new Date("2026-06-11T21:30:00Z"))).toBe(true); // Thu 5:30pm
    expect(isLineupAlertWindow(new Date("2026-06-15T23:00:00Z"))).toBe(true); // Mon 7:00pm
    expect(isLineupAlertWindow(new Date("2026-06-16T01:00:00Z"))).toBe(false); // Mon 9:00pm
  });

  it("stays closed on non-game days", () => {
    expect(isLineupAlertWindow(new Date("2026-06-13T15:00:00Z"))).toBe(false); // Saturday
    expect(isLineupAlertWindow(new Date("2026-06-10T15:00:00Z"))).toBe(false); // Wednesday
  });
});

describe("lineupPayloadsFor", () => {
  const now = Date.parse("2026-09-13T14:00:00Z"); // Sunday morning
  const future = now + 3 * 3600 * 1000;
  const past = now - 3600 * 1000;

  const lineupRosters = [
    {
      leagueId: "yahoo-1",
      leagueName: "A",
      starters: [
        { name: "Tyreek Hill", position: "WR", team: "MIA", status: "out", kickoffMs: future },
        { name: "Bijan Robinson", position: "RB", team: "ATL", status: "questionable", kickoffMs: future },
        { name: "Patrick Mahomes", position: "QB", team: "KC", status: "active", kickoffMs: future },
      ],
    },
    {
      leagueId: "espn-2",
      leagueName: "B",
      starters: [
        { name: "Tyreek Hill", position: "WR", team: "MIA", status: "out", kickoffMs: future },
        { name: "James Cook", position: "RB", team: "BUF", status: "ir", kickoffMs: past },
        { name: "Sam LaPorta", position: "TE", team: "DET", status: "bye", kickoffMs: null },
      ],
    },
  ];

  it("alerts on inactive starters, aggregated across leagues", () => {
    const candidates = lineupPayloadsFor(lineupRosters, now);
    const tyreek = candidates.find((c) => c.payload.title.startsWith("Tyreek Hill"));
    expect(tyreek).toBeDefined();
    expect(tyreek!.payload.title).toBe("Tyreek Hill is OUT");
    expect(tyreek!.payload.body).toContain("yours in 2 leagues");
  });

  it("skips questionable and active players", () => {
    const candidates = lineupPayloadsFor(lineupRosters, now);
    expect(candidates.find((c) => c.payload.title.includes("Bijan"))).toBeUndefined();
    expect(candidates.find((c) => c.payload.title.includes("Mahomes"))).toBeUndefined();
  });

  it("skips players whose game already kicked off", () => {
    const candidates = lineupPayloadsFor(lineupRosters, now);
    expect(candidates.find((c) => c.payload.title.includes("James Cook"))).toBeUndefined();
  });

  it("alerts BYE starters even without a kickoff time", () => {
    const candidates = lineupPayloadsFor(lineupRosters, now);
    const laporta = candidates.find((c) => c.payload.title.includes("LaPorta"));
    expect(laporta).toBeDefined();
    expect(laporta!.payload.title).toBe("Sam LaPorta is on BYE");
  });
});

describe("recapPayload", () => {
  it("aggregates the week across leagues", () => {
    const p = recapPayload(
      [
        { myPts: 120, oppPts: 90 },
        { myPts: 80, oppPts: 95 },
        { myPts: 110.5, oppPts: 99 },
      ],
      11
    );
    expect(p).not.toBeNull();
    expect(p!.title).toBe("Your week: 2-1");
    expect(p!.body).toContain("3 leagues");
    expect(p!.url).toBe("/recap");
    expect(p!.tag).toBe("recap-11");
  });

  it("ignores unplayed matchups and returns null when nothing was played", () => {
    const p = recapPayload(
      [
        { myPts: 0, oppPts: 0 },
        { myPts: 100, oppPts: 50 },
      ],
      3
    );
    expect(p!.title).toBe("Your week: 1-0");
    expect(recapPayload([{ myPts: 0, oppPts: 0 }], 3)).toBeNull();
  });
});

describe("finalPayload", () => {
  it("reports win, loss, and tie", () => {
    expect(finalPayload("lk1", "League A", 120.5, 99.1).title).toBe("You won: League A");
    expect(finalPayload("lk1", "League A", 90, 99.1).title).toBe("You lost: League A");
    expect(finalPayload("lk1", "League A", 100, 100).title).toBe("Tied: League A");
  });

  it("tags by league key so same-named leagues do not collapse", () => {
    const a = finalPayload("yahoo-1", "Family Business", 100, 90);
    const b = finalPayload("espn-2", "Family Business", 100, 90);
    expect(a.tag).not.toBe(b.tag);
  });
});
