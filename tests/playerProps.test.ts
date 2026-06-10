import { describe, expect, it } from "vitest";
import { parseTheOddsApiEventProps } from "@/lib/odds";
import { playerNameKey } from "@/lib/playerName";

// Realistic fixture matching The Odds API per-event odds shape for player
// prop markets: outcomes carry the player in `description`, with the side
// ("Yes" / "Over" / "Under") in `name`.
const eventFixture = {
  id: "evt-kc-buf",
  sport_key: "americanfootball_nfl",
  commence_time: "2026-09-13T17:00:00Z",
  home_team: "Buffalo Bills",
  away_team: "Kansas City Chiefs",
  bookmakers: [
    {
      key: "draftkings",
      title: "DraftKings",
      markets: [
        {
          key: "player_anytime_td",
          outcomes: [
            { name: "Yes", description: "Patrick Mahomes II", price: 135 },
            { name: "Yes", description: "James Cook", price: -110 },
            { name: "No", description: "James Cook", price: -125 },
          ],
        },
        {
          key: "player_pass_yds",
          outcomes: [
            { name: "Over", description: "Patrick Mahomes II", price: -110, point: 274.5 },
            { name: "Under", description: "Patrick Mahomes II", price: -110, point: 274.5 },
          ],
        },
        {
          key: "player_rush_yds",
          outcomes: [
            { name: "Over", description: "James Cook", price: -115, point: 79.5 },
            { name: "Under", description: "James Cook", price: -105, point: 79.5 },
          ],
        },
        {
          // Market we do not request; must be ignored even if present.
          key: "player_field_goals",
          outcomes: [{ name: "Over", description: "Tyler Bass", price: -120, point: 1.5 }],
        },
      ],
    },
    {
      key: "fanduel",
      title: "FanDuel",
      markets: [
        {
          // Duplicate market from a second book: first book wins, no dupes.
          key: "player_anytime_td",
          outcomes: [{ name: "Yes", description: "Patrick Mahomes II", price: 140 }],
        },
      ],
    },
  ],
};

describe("parseTheOddsApiEventProps", () => {
  it("normalizes props per player, keeping only the Yes/Over side", () => {
    const props = parseTheOddsApiEventProps(eventFixture);

    const mahomes = props.find((p) => p.player === "Patrick Mahomes II");
    expect(mahomes).toBeDefined();
    expect(mahomes!.nameKey).toBe("patrick mahomes");
    expect(mahomes!.gameId).toBe("evt-kc-buf");
    expect(mahomes!.kickoff).toBe("2026-09-13T17:00:00Z");
    expect(mahomes!.book).toBe("DraftKings");
    expect(mahomes!.lines).toEqual([
      { market: "player_anytime_td", label: "Anytime TD", value: "Yes", price: 135 },
      { market: "player_pass_yds", label: "Pass Yds", value: "O 274.5", price: -110 },
    ]);

    const cook = props.find((p) => p.player === "James Cook");
    expect(cook).toBeDefined();
    expect(cook!.lines.map((l) => l.market)).toEqual([
      "player_anytime_td",
      "player_rush_yds",
    ]);
    // The "No"/"Under" sides never produce lines.
    expect(cook!.lines).toHaveLength(2);
  });

  it("ignores markets outside the requested set", () => {
    const props = parseTheOddsApiEventProps(eventFixture);
    expect(props.find((p) => p.player === "Tyler Bass")).toBeUndefined();
  });

  it("first book to quote a market wins; later books never duplicate", () => {
    const props = parseTheOddsApiEventProps(eventFixture);
    const mahomes = props.find((p) => p.player === "Patrick Mahomes II")!;
    const tdLines = mahomes.lines.filter((l) => l.market === "player_anytime_td");
    expect(tdLines).toHaveLength(1);
    expect(tdLines[0].price).toBe(135); // DraftKings, not FanDuel's 140
  });

  it("returns [] on malformed input", () => {
    expect(parseTheOddsApiEventProps(null)).toEqual([]);
    expect(parseTheOddsApiEventProps("nope")).toEqual([]);
    expect(parseTheOddsApiEventProps({})).toEqual([]);
    expect(parseTheOddsApiEventProps({ bookmakers: "bad" })).toEqual([]);
  });
});

describe("playerNameKey", () => {
  it("matches sportsbook and platform spellings of the same player", () => {
    expect(playerNameKey("Patrick Mahomes II")).toBe(playerNameKey("Patrick Mahomes"));
    expect(playerNameKey("A.J. Brown")).toBe(playerNameKey("AJ Brown"));
    expect(playerNameKey("Ja'Marr Chase")).toBe(playerNameKey("Ja’Marr Chase"));
    expect(playerNameKey("Odell Beckham Jr.")).toBe(playerNameKey("Odell Beckham"));
    expect(playerNameKey("Kenneth Walker III")).toBe(playerNameKey("Kenneth Walker"));
  });

  it("does not collapse different players", () => {
    expect(playerNameKey("Josh Allen")).not.toBe(playerNameKey("Keenan Allen"));
    expect(playerNameKey("Justin Jefferson")).not.toBe(playerNameKey("Van Jefferson"));
  });

  it("strips diacritics", () => {
    expect(playerNameKey("José Ramírez")).toBe("jose ramirez");
  });
});
