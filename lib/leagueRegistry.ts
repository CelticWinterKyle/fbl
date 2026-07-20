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

export async function listRegisteredLeagues(): Promise<RegisteredLeague[]> {
  if (!isKvAvailable()) return [];
  try {
    const { kv } = await import("@/lib/kv");
    const all = await kv.hgetall<Record<string, RegisteredLeague>>(LEAGUES_KEY);
    return all ? Object.values(all) : [];
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
