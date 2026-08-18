// ─── Active league / user registry ────────────────────────────────────────────
//
// A KV-backed registry of every connected league (and every user with an ESPN
// connection), so background crons can refresh snapshots and keep credentials
// alive without scanning the keyspace. Entries record a userId whose
// credentials can fetch the league (the most recent user to connect it).
//
// Registration happens inside tokenStore's add* functions, the single choke
// point for new connections, plus opportunistically on snapshot refreshes.
// Dev (no KV) is a no-op: there is no cron locally.

export type RegisteredLeague = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  userId: string; // a user whose creds can fetch this league
  season?: number; // espn only
  updatedAt: number;
};

import { YAHOO_RETENTION_S } from "@/lib/retention";

const LEAGUES_KEY = "registry:leagues";
const ESPN_USERS_KEY = "registry:espn-users";

function isKvAvailable(): boolean {
  return !!process.env.KV_REST_API_URL;
}

export async function registerLeague(entry: Omit<RegisteredLeague, "updatedAt">): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.hset(LEAGUES_KEY, {
      [`${entry.platform}:${entry.leagueId}`]: { ...entry, updatedAt: Date.now() },
    });
  } catch (e) {
    console.warn("[Registry] Failed to register league:", (e as any)?.message);
  }
}

export async function unregisterLeague(platform: string, leagueId: string): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.hdel(LEAGUES_KEY, `${platform}:${leagueId}`);
  } catch {}
}

/**
 * Registry entries live in one hash, so a per-key TTL is not available. Yahoo
 * entries are instead pruned on read once they pass the retention window
 * (agreement section 13), which keeps the registry self-cleaning without a
 * separate sweep. Active leagues are re-registered on connect and again by the
 * season rollover every August, so a live league never ages out.
 *
 * Sleeper and ESPN entries are untouched: this agreement does not cover them.
 */
export async function listRegisteredLeagues(): Promise<RegisteredLeague[]> {
  if (!isKvAvailable()) return [];
  try {
    const { kv } = await import("@/lib/kv");
    const all = await kv.hgetall<Record<string, RegisteredLeague>>(LEAGUES_KEY);
    if (!all) return [];

    const cutoff = Date.now() - YAHOO_RETENTION_S * 1000;
    const live: RegisteredLeague[] = [];
    const expired: string[] = [];

    for (const [field, entry] of Object.entries(all)) {
      if (entry?.platform === "yahoo" && Number(entry.updatedAt) < cutoff) {
        expired.push(field);
      } else {
        live.push(entry);
      }
    }

    if (expired.length > 0) {
      kv.hdel(LEAGUES_KEY, ...expired).catch(() => {});
      console.log(`[Registry] pruned ${expired.length} expired Yahoo entries`);
    }
    return live;
  } catch {
    return [];
  }
}

export async function registerEspnUser(userId: string): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.sadd(ESPN_USERS_KEY, userId);
  } catch {}
}

export async function listEspnUsers(): Promise<string[]> {
  if (!isKvAvailable()) return [];
  try {
    const { kv } = await import("@/lib/kv");
    return ((await kv.smembers(ESPN_USERS_KEY)) as string[]) ?? [];
  } catch {
    return [];
  }
}

// ─── Per-connection ESPN health (written by the keep-alive cron) ─────────────

export type EspnConnectionHealth = {
  ok: boolean;
  checkedAt: number;
  error?: string;
};

export async function saveEspnHealth(
  userId: string,
  leagueId: string,
  health: EspnConnectionHealth
): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.set(`espnhealth:${userId}:${leagueId}`, health, { ex: 7 * 24 * 3600 });
  } catch {}
}

export async function readEspnHealth(
  userId: string,
  leagueId: string
): Promise<EspnConnectionHealth | null> {
  if (!isKvAvailable()) return null;
  try {
    const { kv } = await import("@/lib/kv");
    return await kv.get<EspnConnectionHealth>(`espnhealth:${userId}:${leagueId}`);
  } catch {
    return null;
  }
}
