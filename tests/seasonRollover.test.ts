import { describe, it, expect } from "vitest";
import {
  renewedToLeagueKey,
  swapYahooTeamKey,
  findSleeperSuccessor,
} from "@/lib/seasonRollover";

describe("renewedToLeagueKey", () => {
  it("parses Yahoo's renewed pointer into a league key", () => {
    expect(renewedToLeagueKey("466_12345")).toBe("466.l.12345");
    expect(renewedToLeagueKey(" 461_9 ")).toBe("461.l.9");
  });

  it("rejects malformed and non-string pointers", () => {
    expect(renewedToLeagueKey("")).toBeNull();
    expect(renewedToLeagueKey("466_")).toBeNull();
    expect(renewedToLeagueKey("_12345")).toBeNull();
    expect(renewedToLeagueKey("466.l.12345")).toBeNull();
    expect(renewedToLeagueKey("466_12345_7")).toBeNull();
    expect(renewedToLeagueKey(null)).toBeNull();
    expect(renewedToLeagueKey(undefined)).toBeNull();
    expect(renewedToLeagueKey(46612345)).toBeNull();
    expect(renewedToLeagueKey({ renewed: "466_1" })).toBeNull();
  });
});

describe("swapYahooTeamKey", () => {
  it("re-homes the team id onto the new league key", () => {
    expect(swapYahooTeamKey("461.l.5.t.7", "466.l.99")).toBe("466.l.99.t.7");
    expect(swapYahooTeamKey("461.l.123456.t.12", "466.l.654321")).toBe("466.l.654321.t.12");
  });

  it("rejects keys without a team suffix", () => {
    expect(swapYahooTeamKey("461.l.5", "466.l.99")).toBeNull();
    expect(swapYahooTeamKey("", "466.l.99")).toBeNull();
    expect(swapYahooTeamKey(null, "466.l.99")).toBeNull();
    expect(swapYahooTeamKey(undefined, "466.l.99")).toBeNull();
  });
});

describe("findSleeperSuccessor", () => {
  const leagues = [
    { league_id: "2026aaa", previous_league_id: "2025aaa" },
    { league_id: "2026bbb", previous_league_id: null },
    { league_id: "2026ccc" },
  ];

  it("finds the league whose previous_league_id matches", () => {
    expect(findSleeperSuccessor(leagues, "2025aaa")).toBe("2026aaa");
  });

  it("returns null when nothing chains back to the old id", () => {
    expect(findSleeperSuccessor(leagues, "2025zzz")).toBeNull();
    expect(findSleeperSuccessor([], "2025aaa")).toBeNull();
    expect(findSleeperSuccessor(null, "2025aaa")).toBeNull();
    expect(findSleeperSuccessor(undefined, "2025aaa")).toBeNull();
  });

  it("ignores entries missing a league_id", () => {
    expect(
      findSleeperSuccessor([{ previous_league_id: "2025aaa" }], "2025aaa")
    ).toBeNull();
  });
});
