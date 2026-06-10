import { describe, expect, it } from "vitest";
import { parsePlayText } from "@/lib/nflPlays";

describe("parsePlayText", () => {
  it('parses "Passer N Yd pass to Receiver"', () => {
    const r = parsePlayText(
      "Patrick Mahomes 12 Yd pass to Travis Kelce (Harrison Butker Kick)",
      "Passing Touchdown",
      "KC"
    );
    expect(r.category).toBe("touchdown");
    expect(r.isTouchdown).toBe(true);
    expect(r.yards).toBe(12);
    expect(r.players).toEqual([
      { name: "Patrick Mahomes", role: "passer", isTeamDefense: false },
      { name: "Travis Kelce", role: "receiver", isTeamDefense: false },
    ]);
  });

  it('parses "Receiver N Yd pass from Passer"', () => {
    const r = parsePlayText(
      "Amon-Ra St. Brown 8 Yd pass from Jared Goff (Jake Bates Kick)",
      "Passing Touchdown",
      "DET"
    );
    expect(r.yards).toBe(8);
    expect(r.players).toEqual([
      { name: "Jared Goff", role: "passer", isTeamDefense: false },
      { name: "Amon-Ra St. Brown", role: "receiver", isTeamDefense: false },
    ]);
  });

  it('trims trailing metadata after the passer ("... from X at 2:34")', () => {
    const r = parsePlayText(
      "Travis Kelce 25 Yd pass from Patrick Mahomes at 2:34",
      "Passing Touchdown",
      "KC"
    );
    expect(r.yards).toBe(25);
    const passer = r.players.find((p) => p.role === "passer");
    expect(passer?.name).toBe("Patrick Mahomes");
    const receiver = r.players.find((p) => p.role === "receiver");
    expect(receiver?.name).toBe("Travis Kelce");
  });

  it("parses a field goal", () => {
    const r = parsePlayText("Harrison Butker 43 Yd Field Goal", "Field Goal", "KC");
    expect(r.category).toBe("field-goal");
    expect(r.isTouchdown).toBe(false);
    expect(r.yards).toBe(43);
    expect(r.players).toEqual([
      { name: "Harrison Butker", role: "kicker", isTeamDefense: false },
    ]);
  });

  it("parses a rushing touchdown", () => {
    const r = parsePlayText(
      "Saquon Barkley 4 Yd Run (Jake Elliott Kick)",
      "Rushing Touchdown",
      "PHI"
    );
    expect(r.category).toBe("touchdown");
    expect(r.yards).toBe(4);
    expect(r.players).toEqual([
      { name: "Saquon Barkley", role: "rusher", isTeamDefense: false },
    ]);
  });

  it("credits an interception return TD to the team defense", () => {
    const r = parsePlayText(
      "Trent McDuffie 33 Yd Interception Return (Harrison Butker Kick)",
      "Interception Return Touchdown",
      "KC"
    );
    expect(r.category).toBe("touchdown");
    expect(r.isTouchdown).toBe(true);
    expect(r.yards).toBe(33);
    expect(r.players).toEqual([
      { name: "KC", role: "defense", isTeamDefense: true },
    ]);
  });

  it("credits a fumble return TD to the team defense", () => {
    const r = parsePlayText(
      "Micah Parsons 19 Yd Fumble Return (Brandon Aubrey Kick)",
      "Fumble Return Touchdown",
      "DAL"
    );
    expect(r.yards).toBe(19);
    expect(r.players).toEqual([
      { name: "DAL", role: "defense", isTeamDefense: true },
    ]);
  });

  it("degrades to no players on unknown phrasings", () => {
    const r = parsePlayText("Some Unrecognized Play Text", "Touchdown", "KC");
    expect(r.players).toEqual([]);
    expect(r.isTouchdown).toBe(true);
    expect(r.category).toBe("touchdown");
  });
});
