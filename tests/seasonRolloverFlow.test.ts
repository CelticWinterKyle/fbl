// End-to-end migration flow for runSeasonRollover with mocked platforms and
// storage: verifies stored league lists, legacy single-league keys, My Team,
// commissioner flags, and the registry all move to the renewed league ids.
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = {
  yahooLeagues: [] as string[],
  yahooSingle: null as string | null,
  sleeperLeagues: [] as string[],
  sleeperSingle: null as string | null,
  sleeperConn: null as { username: string; sleeperId: string } | null,
  myTeam: new Map<string, { teamKey: string; teamName: string }>(),
  commish: new Set<string>(),
  registry: new Map<string, string>(), // "platform:leagueId" -> userId
};

vi.mock("@/lib/tokenStore/index", () => ({
  readUserLeagues: vi.fn(async () => store.yahooLeagues),
  saveUserLeagues: vi.fn(async (_u: string, l: string[]) => {
    store.yahooLeagues = l;
  }),
  readUserLeague: vi.fn(async () => store.yahooSingle),
  saveUserLeague: vi.fn(async (_u: string, k: string) => {
    store.yahooSingle = k;
  }),
  readSleeperLeagues: vi.fn(async () => store.sleeperLeagues),
  saveSleeperLeagues: vi.fn(async (_u: string, l: string[]) => {
    store.sleeperLeagues = l;
  }),
  readSleeperLeague: vi.fn(async () => store.sleeperSingle),
  saveSleeperLeague: vi.fn(async (_u: string, id: string) => {
    store.sleeperSingle = id;
  }),
  readSleeperConnection: vi.fn(async () => store.sleeperConn),
  readMyTeam: vi.fn(async (_u: string, p: string, l?: string) => store.myTeam.get(`${p}:${l}`) ?? null),
  saveMyTeam: vi.fn(async (_u: string, p: string, data: any, l?: string) => {
    store.myTeam.set(`${p}:${l}`, data);
  }),
  isCommissioner: vi.fn(async (_u: string, p: string, l: string) => store.commish.has(`${p}:${l}`)),
  setCommissioner: vi.fn(async (_u: string, p: string, l: string, v: boolean) => {
    if (v) store.commish.add(`${p}:${l}`);
    else store.commish.delete(`${p}:${l}`);
  }),
}));

vi.mock("@/lib/leagueRegistry", () => ({
  registerLeague: vi.fn(async (e: any) => {
    store.registry.set(`${e.platform}:${e.leagueId}`, e.userId);
  }),
  unregisterLeague: vi.fn(async (p: string, l: string) => {
    store.registry.delete(`${p}:${l}`);
  }),
}));

const yahooMeta = new Map<string, any>();
vi.mock("@/lib/yahoo", () => ({
  getYahooAuthedForUser: vi.fn(async () => ({
    yf: {
      league: {
        meta: async (key: string) => {
          if (!yahooMeta.has(key)) throw new Error(`no such league ${key}`);
          return yahooMeta.get(key);
        },
      },
    },
    access: "tok",
  })),
}));

const sleeperMeta = new Map<string, any>();
let sleeperUserLeagues: any[] = [];
vi.mock("@/lib/adapters/sleeper", () => ({
  fetchSleeperLeagueMeta: vi.fn(async (id: string) => {
    if (!sleeperMeta.has(id)) throw new Error(`no such league ${id}`);
    return sleeperMeta.get(id);
  }),
  fetchSleeperLeaguesForUser: vi.fn(async () => sleeperUserLeagues),
  fetchSleeperRosterIdForOwner: vi.fn(async () => "4"),
}));

import { runSeasonRollover } from "@/lib/seasonRollover";

// Unique ids per test: the module's in-memory probe-miss damper persists
// across tests in this file, so re-probing the same id would be skipped.
let n = 0;
const uniq = (s: string) => `${s}${++n}`;

beforeEach(() => {
  store.yahooLeagues = [];
  store.yahooSingle = null;
  store.sleeperLeagues = [];
  store.sleeperSingle = null;
  store.sleeperConn = null;
  store.myTeam.clear();
  store.commish.clear();
  store.registry.clear();
  yahooMeta.clear();
  sleeperMeta.clear();
  sleeperUserLeagues = [];
});

describe("runSeasonRollover: yahoo", () => {
  it("migrates a renewed league, My Team, commish flag, and legacy key", async () => {
    const oldLid = uniq("10");
    const newLid = uniq("10");
    const oldKey = `461.l.${oldLid}`;
    const newKey = `466.l.${newLid}`;
    store.yahooLeagues = [oldKey];
    store.yahooSingle = oldKey;
    store.myTeam.set(`yahoo:${oldKey}`, { teamKey: `${oldKey}.t.7`, teamName: "The Fam" });
    store.commish.add(`yahoo:${oldKey}`);
    yahooMeta.set(oldKey, { renewed: `466_${newLid}` });
    yahooMeta.set(newKey, { renewed: "" });

    const res = await runSeasonRollover("user_1");

    expect(res.migrated).toBe(1);
    expect(res.yahooLeagues).toEqual([newKey]);
    expect(store.yahooSingle).toBe(newKey);
    expect(store.myTeam.get(`yahoo:${newKey}`)).toEqual({
      teamKey: `${newKey}.t.7`,
      teamName: "The Fam",
    });
    expect(store.commish.has(`yahoo:${newKey}`)).toBe(true);
    expect(store.registry.has(`yahoo:${newKey}`)).toBe(true);
    expect(store.registry.has(`yahoo:${oldKey}`)).toBe(false);
  });

  it("does nothing when the league has not renewed", async () => {
    const oldKey = `461.l.${uniq("20")}`;
    store.yahooLeagues = [oldKey];
    yahooMeta.set(oldKey, { renewed: "" });

    const res = await runSeasonRollover("user_1");
    expect(res.migrated).toBe(0);
    expect(res.yahooLeagues).toEqual([oldKey]);
  });

  it("follows a two-season renewed chain", async () => {
    const a = uniq("30");
    const b = uniq("30");
    const c = uniq("30");
    store.yahooLeagues = [`449.l.${a}`];
    yahooMeta.set(`449.l.${a}`, { renewed: `461_${b}` });
    yahooMeta.set(`461.l.${b}`, { renewed: `466_${c}` });
    yahooMeta.set(`466.l.${c}`, {});

    const res = await runSeasonRollover("user_1");
    expect(res.yahooLeagues).toEqual([`466.l.${c}`]);
  });

  it("dedupes when the renewed league was already connected by hand", async () => {
    const oldLid = uniq("40");
    const newLid = uniq("40");
    const oldKey = `461.l.${oldLid}`;
    const newKey = `466.l.${newLid}`;
    store.yahooLeagues = [oldKey, newKey];
    store.myTeam.set(`yahoo:${oldKey}`, { teamKey: `${oldKey}.t.7`, teamName: "Old Pick" });
    store.myTeam.set(`yahoo:${newKey}`, { teamKey: `${newKey}.t.2`, teamName: "New Pick" });
    yahooMeta.set(oldKey, { renewed: `466_${newLid}` });
    yahooMeta.set(newKey, { renewed: "" });

    const res = await runSeasonRollover("user_1");
    expect(res.yahooLeagues).toEqual([newKey]);
    // The manual pick on the new league must not be clobbered.
    expect(store.myTeam.get(`yahoo:${newKey}`)).toEqual({
      teamKey: `${newKey}.t.2`,
      teamName: "New Pick",
    });
  });
});

describe("runSeasonRollover: sleeper", () => {
  it("migrates via previous_league_id and re-derives the roster id", async () => {
    const oldId = uniq("900");
    const newId = uniq("900");
    store.sleeperConn = { username: "kyle", sleeperId: "sl_1" };
    store.sleeperLeagues = [oldId];
    store.sleeperSingle = oldId;
    store.myTeam.set(`sleeper:${oldId}`, { teamKey: "9", teamName: "Blitzers" });
    sleeperMeta.set(oldId, { league_id: oldId, season: "2025" });
    sleeperUserLeagues = [{ league_id: newId, previous_league_id: oldId, season: "2026" }];

    const res = await runSeasonRollover("user_1");

    expect(res.migrated).toBe(1);
    expect(res.sleeperLeagues).toEqual([newId]);
    expect(store.sleeperSingle).toBe(newId);
    // Roster id comes from the new league's rosters (mocked owner match: "4").
    expect(store.myTeam.get(`sleeper:${newId}`)).toEqual({ teamKey: "4", teamName: "Blitzers" });
    expect(store.registry.has(`sleeper:${newId}`)).toBe(true);
    expect(store.registry.has(`sleeper:${oldId}`)).toBe(false);
  });

  it("does nothing when no successor league exists yet", async () => {
    const oldId = uniq("910");
    store.sleeperConn = { username: "kyle", sleeperId: "sl_1" };
    store.sleeperLeagues = [oldId];
    sleeperMeta.set(oldId, { league_id: oldId, season: "2025" });
    sleeperUserLeagues = [];

    const res = await runSeasonRollover("user_1");
    expect(res.migrated).toBe(0);
    expect(res.sleeperLeagues).toEqual([oldId]);
  });

  it("skips probing seasons that cannot exist yet", async () => {
    const oldId = uniq("920");
    store.sleeperConn = { username: "kyle", sleeperId: "sl_1" };
    store.sleeperLeagues = [oldId];
    sleeperMeta.set(oldId, { league_id: oldId, season: String(new Date().getFullYear()) });

    const { fetchSleeperLeaguesForUser } = await import("@/lib/adapters/sleeper");
    const before = vi.mocked(fetchSleeperLeaguesForUser).mock.calls.length;
    const res = await runSeasonRollover("user_1");
    expect(res.migrated).toBe(0);
    expect(vi.mocked(fetchSleeperLeaguesForUser).mock.calls.length).toBe(before);
  });
});
