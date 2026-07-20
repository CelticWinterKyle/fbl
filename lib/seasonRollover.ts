// Season rollover for Yahoo and Sleeper stored league ids (the ESPN
// equivalent lives in lib/leagueData.ts via espnSeasonsToTry).
//
// Yahoo league keys embed a per-season game id ("461.l.123" is the 2025
// league); when a commissioner renews, the OLD league's meta gains a
// `renewed` pointer ("466_123") naming the new season's key. Sleeper mints
// a fresh league_id every season, linked back via previous_league_id.
// Neither platform errors on the old id — both serve last season's data
// forever — so stored ids must be actively migrated or every connection
// made during the offseason shows stale data all season.
//
// Callers: /api/leagues/data (heals on dashboard load) and the nightly
// espn-keepalive cron (heals idle users). Probes are negative-cached for
// ~20h per league so the steady-state cost is at most one platform call
// per league per day until the league renews.

import { getYahooAuthedForUser } from "@/lib/yahoo";
import {
  readUserLeagues,
  saveUserLeagues,
  readUserLeague,
  saveUserLeague,
  readSleeperLeagues,
  saveSleeperLeagues,
  readSleeperLeague,
  saveSleeperLeague,
  readSleeperConnection,
  readMyTeam,
  saveMyTeam,
  isCommissioner,
  setCommissioner,
} from "@/lib/tokenStore/index";
import { registerLeague, unregisterLeague } from "@/lib/leagueRegistry";
import {
  fetchSleeperLeagueMeta,
  fetchSleeperLeaguesForUser,
  fetchSleeperRosterIdForOwner,
} from "@/lib/adapters/sleeper";

// ─── Pure helpers (unit tested) ───────────────────────────────────────────────

/** Yahoo's renewed/renew pointer "466_12345" -> league key "466.l.12345". */
export function renewedToLeagueKey(renewed: unknown): string | null {
  if (typeof renewed !== "string") return null;
  const m = /^(\d+)_(\d+)$/.exec(renewed.trim());
  if (!m) return null;
  return `${m[1]}.l.${m[2]}`;
}

/**
 * Re-home a Yahoo team key onto the renewed league, keeping the team id.
 * Yahoo preserves team ids for returning managers in renewed leagues; if a
 * manager's id did change, My Team simply prompts again on next visit.
 * "461.l.5.t.7" + "466.l.99" -> "466.l.99.t.7"
 */
export function swapYahooTeamKey(oldTeamKey: unknown, newLeagueKey: string): string | null {
  if (typeof oldTeamKey !== "string") return null;
  const m = /\.t\.(\d+)$/.exec(oldTeamKey.trim());
  if (!m) return null;
  return `${newLeagueKey}.t.${m[1]}`;
}

/** Find the league in `candidates` whose previous_league_id points at oldId. */
export function findSleeperSuccessor(
  candidates: Array<{ league_id?: string; previous_league_id?: string | null }> | null | undefined,
  oldId: string
): string | null {
  if (!Array.isArray(candidates)) return null;
  const hit = candidates.find((l) => l?.previous_league_id === oldId && l?.league_id);
  return hit?.league_id ?? null;
}

// ─── Probe damper (mirrors the ESPN probe-miss cache in lib/leagueData.ts) ────

const ROLLOVER_MISS_TTL_S = 20 * 3600; // just under daily so the cron retries
const missMem = new Map<string, number>(); // dev fallback: key -> expiresAtMs

function missKey(platform: string, leagueId: string): string {
  return `rollover:miss:${platform}:${leagueId}`;
}

async function probeMissedRecently(platform: string, leagueId: string): Promise<boolean> {
  const key = missKey(platform, leagueId);
  if (!process.env.KV_REST_API_URL) {
    const exp = missMem.get(key);
    return typeof exp === "number" && exp > Date.now();
  }
  try {
    const { kv } = await import("@/lib/kv");
    return (await kv.exists(key)) === 1;
  } catch {
    return false;
  }
}

async function recordProbeMiss(platform: string, leagueId: string): Promise<void> {
  const key = missKey(platform, leagueId);
  if (!process.env.KV_REST_API_URL) {
    missMem.set(key, Date.now() + ROLLOVER_MISS_TTL_S * 1000);
    return;
  }
  try {
    const { kv } = await import("@/lib/kv");
    await kv.set(key, 1, { ex: ROLLOVER_MISS_TTL_S });
  } catch {
    // Best-effort: worst case the probe repeats sooner.
  }
}

// ─── Shared store bookkeeping ─────────────────────────────────────────────────

async function migrateLeagueBookkeeping(
  userId: string,
  platform: "yahoo" | "sleeper",
  oldId: string,
  newId: string,
  newTeamKey: string | null
): Promise<void> {
  await registerLeague({ platform, leagueId: newId, userId });
  await unregisterLeague(platform, oldId);

  // Carry My Team over, but never clobber a pick the user already made on
  // the new league (they may have reconnected it by hand before we migrated).
  const [myTeam, existingNew] = await Promise.all([
    readMyTeam(userId, platform, oldId),
    readMyTeam(userId, platform, newId),
  ]);
  if (myTeam && !existingNew) {
    const teamKey = newTeamKey ?? (platform === "sleeper" ? myTeam.teamKey : null);
    if (teamKey) {
      await saveMyTeam(userId, platform, { ...myTeam, teamKey }, newId);
    }
    // No mapped team on the new league: leave it unset and let My Team
    // prompt again rather than pointing at a roster that may not be theirs.
  }

  if (await isCommissioner(userId, platform, oldId)) {
    await setCommissioner(userId, platform, newId, true);
  }
}

// ─── Yahoo ────────────────────────────────────────────────────────────────────

/** The SDK sometimes nests league meta under league[0] (mirrors lib/leagueHistory.ts). */
function normalizeYahooMeta(raw: any): any {
  return raw?.league?.[0] ?? raw ?? {};
}

const MAX_RENEW_HOPS = 3; // heals connections that skipped a whole season

async function migrateYahooForUser(
  userId: string,
  leagues: string[]
): Promise<Record<string, string>> {
  const migrated: Record<string, string> = {};
  if (leagues.length === 0) return migrated;

  let yf: any = null;
  let authed = false;

  for (const oldKey of leagues) {
    try {
      if (await probeMissedRecently("yahoo", oldKey)) continue;

      if (!authed) {
        authed = true;
        yf = (await getYahooAuthedForUser(userId)).yf;
      }
      if (!yf) return migrated;

      // Follow the renewed chain to the newest season this league has.
      let currentKey = oldKey;
      for (let hop = 0; hop < MAX_RENEW_HOPS; hop++) {
        const meta = normalizeYahooMeta(await yf.league.meta(currentKey));
        const nextKey = renewedToLeagueKey(meta?.renewed);
        if (!nextKey || nextKey === currentKey) break;
        currentKey = nextKey;
      }
      if (currentKey === oldKey) {
        await recordProbeMiss("yahoo", oldKey);
        continue;
      }

      migrated[oldKey] = currentKey;
    } catch (e) {
      console.warn(
        `[rollover] yahoo probe failed for ${oldKey}:`,
        String((e as any)?.message ?? e).slice(0, 120)
      );
      await recordProbeMiss("yahoo", oldKey);
    }
  }

  if (Object.keys(migrated).length === 0) return migrated;

  // Persist: swap keys in place, dedupe if the new key was already connected.
  const updated: string[] = [];
  for (const key of leagues) {
    const next = migrated[key] ?? key;
    if (!updated.includes(next)) updated.push(next);
  }
  await saveUserLeagues(userId, updated);

  const legacySingle = await readUserLeague(userId);
  if (legacySingle && migrated[legacySingle]) {
    await saveUserLeague(userId, migrated[legacySingle]);
  }

  for (const [oldKey, newKey] of Object.entries(migrated)) {
    const myTeam = await readMyTeam(userId, "yahoo", oldKey);
    const newTeamKey = myTeam ? swapYahooTeamKey(myTeam.teamKey, newKey) : null;
    await migrateLeagueBookkeeping(userId, "yahoo", oldKey, newKey, newTeamKey);
    console.log(`[rollover] yahoo ${oldKey} -> ${newKey} for ${userId.slice(0, 8)}...`);
  }
  return migrated;
}

// ─── Sleeper ──────────────────────────────────────────────────────────────────

async function migrateSleeperForUser(
  userId: string,
  leagues: string[]
): Promise<Record<string, string>> {
  const migrated: Record<string, string> = {};
  if (leagues.length === 0) return migrated;

  const conn = await readSleeperConnection(userId);
  if (!conn?.sleeperId) return migrated;

  // One user-leagues listing serves every stored league; cache per season.
  const candidatesBySeason = new Map<number, Awaited<ReturnType<typeof fetchSleeperLeaguesForUser>>>();

  for (const oldId of leagues) {
    try {
      if (await probeMissedRecently("sleeper", oldId)) continue;

      const meta = await fetchSleeperLeagueMeta(oldId);
      const storedSeason = Number(meta?.season);
      const targetSeason = storedSeason + 1;
      // Sleeper seasons are calendar years; a successor can't exist for a
      // year that hasn't started. (In-season this is a cheap daily no-op.)
      if (!Number.isFinite(storedSeason) || targetSeason > new Date().getFullYear()) {
        await recordProbeMiss("sleeper", oldId);
        continue;
      }

      let candidates = candidatesBySeason.get(targetSeason);
      if (!candidates) {
        candidates = await fetchSleeperLeaguesForUser(conn.sleeperId, targetSeason);
        candidatesBySeason.set(targetSeason, candidates);
      }

      const newId = findSleeperSuccessor(candidates, oldId);
      if (!newId) {
        await recordProbeMiss("sleeper", oldId);
        continue;
      }
      migrated[oldId] = newId;
    } catch (e) {
      console.warn(
        `[rollover] sleeper probe failed for ${oldId}:`,
        String((e as any)?.message ?? e).slice(0, 120)
      );
      await recordProbeMiss("sleeper", oldId);
    }
  }

  if (Object.keys(migrated).length === 0) return migrated;

  const updated: string[] = [];
  for (const id of leagues) {
    const next = migrated[id] ?? id;
    if (!updated.includes(next)) updated.push(next);
  }
  await saveSleeperLeagues(userId, updated);

  const legacySingle = await readSleeperLeague(userId);
  if (legacySingle && migrated[legacySingle]) {
    await saveSleeperLeague(userId, migrated[legacySingle]);
  }

  for (const [oldId, newId] of Object.entries(migrated)) {
    // Sleeper roster ids can change season to season, but owner ids don't:
    // re-derive My Team from the new league's rosters.
    let newTeamKey: string | null = null;
    try {
      newTeamKey = await fetchSleeperRosterIdForOwner(newId, conn.sleeperId);
    } catch {
      // Roster fetch hiccup: bookkeeping falls back to the old roster id.
    }
    await migrateLeagueBookkeeping(userId, "sleeper", oldId, newId, newTeamKey);
    console.log(`[rollover] sleeper ${oldId} -> ${newId} for ${userId.slice(0, 8)}...`);
  }
  return migrated;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export type RolloverResult = {
  yahooLeagues: string[];
  sleeperLeagues: string[];
  migrated: number;
};

/**
 * Migrate any of the user's Yahoo/Sleeper leagues that have renewed for a
 * new season. Pass pre-read league lists to skip re-reading; returns the
 * up-to-date lists either way. Never throws.
 */
export async function runSeasonRollover(
  userId: string,
  preRead?: { yahooLeagues?: string[]; sleeperLeagues?: string[] }
): Promise<RolloverResult> {
  const [yahooBefore, sleeperBefore] = await Promise.all([
    preRead?.yahooLeagues ?? readUserLeagues(userId),
    preRead?.sleeperLeagues ?? readSleeperLeagues(userId),
  ]);

  const [yahooMigrated, sleeperMigrated] = await Promise.all([
    migrateYahooForUser(userId, yahooBefore).catch(() => ({}) as Record<string, string>),
    migrateSleeperForUser(userId, sleeperBefore).catch(() => ({}) as Record<string, string>),
  ]);

  const migrated = Object.keys(yahooMigrated).length + Object.keys(sleeperMigrated).length;
  if (migrated === 0) {
    return { yahooLeagues: yahooBefore, sleeperLeagues: sleeperBefore, migrated: 0 };
  }

  const [yahooLeagues, sleeperLeagues] = await Promise.all([
    readUserLeagues(userId),
    readSleeperLeagues(userId),
  ]);
  return { yahooLeagues, sleeperLeagues, migrated };
}
