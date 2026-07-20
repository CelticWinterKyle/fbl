import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  registerLeague,
  unregisterLeague,
  registerEspnUser,
} from "@/lib/leagueRegistry";
import { recordConnection, markConnectionRemoved } from "@/lib/db";

// ─── Field-level encryption for sensitive credentials ────────────────────────
// AES-256-GCM encryption using SESSION_SECRET as the key source.
// Encrypted values are prefixed with "enc:" to allow transparent migration.

const ENC_PREFIX = "enc:";
let _encKey: Buffer | null = null;

function getEncKey(): Buffer | null {
  if (_encKey) return _encKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  _encKey = crypto.scryptSync(secret, "fbl-espn-v1", 32) as Buffer;
  return _encKey;
}

function encryptField(value: string | undefined): string | undefined {
  if (!value) return value;
  const key = getEncKey();
  if (!key) {
    // Fail closed in prod: never silently downgrade credential storage to
    // plaintext. Dev without SESSION_SECRET keeps working (file storage only).
    if (process.env.VERCEL && process.env.NODE_ENV === "production") {
      throw new Error("[TokenStore] SESSION_SECRET missing in production; refusing to store credentials unencrypted");
    }
    return value;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptField(value: string | undefined): string | undefined {
  if (!value || !value.startsWith(ENC_PREFIX)) return value; // plaintext or undefined
  const key = getEncKey();
  if (!key) return undefined;
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    return undefined;
  }
}

export type UserTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};

// ─── Environment detection ────────────────────────────────────────────────────

function isKvAvailable(): boolean {
  return !!process.env.KV_REST_API_URL;
}

// ─── KV helpers (lazy-imported to avoid errors in dev) ────────────────────────

async function kvGet<T>(key: string): Promise<T | null> {
  const { kv } = await import("@/lib/kv");
  return kv.get<T>(key);
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const { kv } = await import("@/lib/kv");
  await kv.set(key, value);
}

async function kvDel(key: string): Promise<void> {
  const { kv } = await import("@/lib/kv");
  await kv.del(key);
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function getUserDir(): string {
  return path.join(process.cwd(), "lib", "yahoo-users");
}

function tokenFile(userId: string): string {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${userId}.json`);
}

function leagueFile(userId: string): string {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${userId}.league.txt`);
}

// ─── Token CRUD ───────────────────────────────────────────────────────────────

export async function readUserTokens(userId: string): Promise<UserTokens | null> {
  try {
    if (isKvAvailable()) {
      return await kvGet<UserTokens>(`tokens:yahoo:${userId}`);
    }
    const file = tokenFile(userId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.warn(`[TokenStore] Failed to read tokens for ${userId.slice(0, 8)}...`, e);
    return null;
  }
}

export async function saveUserTokens(userId: string, tokens: UserTokens): Promise<void> {
  const merged: UserTokens = { ...tokens };
  // Yahoo sends expires_in (seconds). Coerce defensively — if it ever arrives as
  // a string we still derive expires_at, so proactive refresh keeps working.
  const expiresIn = Number(tokens.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0 && !tokens.expires_at) {
    merged.expires_at = Date.now() + (expiresIn - 120) * 1000;
  }
  try {
    if (isKvAvailable()) {
      await kvSet(`tokens:yahoo:${userId}`, merged);
    } else {
      fs.writeFileSync(tokenFile(userId), JSON.stringify(merged, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save tokens for ${userId.slice(0, 8)}...`, e);
  }
}

export async function clearUserTokens(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`tokens:yahoo:${userId}`);
    } else {
      const file = tokenFile(userId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (e) {
    console.warn(`[TokenStore] Failed to clear tokens for ${userId.slice(0, 8)}...`, e);
  }
}

// ─── League CRUD ──────────────────────────────────────────────────────────────

export async function readUserLeague(userId: string): Promise<string | null> {
  try {
    if (isKvAvailable()) {
      return await kvGet<string>(`league:${userId}`);
    }
    const file = leagueFile(userId);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch (e) {
    console.warn(`[TokenStore] Failed to read league for ${userId.slice(0, 8)}...`, e);
    return null;
  }
}

export async function saveUserLeague(userId: string, leagueKey: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`league:${userId}`, leagueKey);
    } else {
      fs.writeFileSync(leagueFile(userId), leagueKey);
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save league for ${userId.slice(0, 8)}...`, e);
  }
}

export async function deleteUserLeague(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`league:${userId}`);
    } else {
      const file = leagueFile(userId);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (e) {
    console.warn(`[TokenStore] Failed to delete league for ${userId.slice(0, 8)}...`, e);
  }
}

// ─── Sleeper connection ───────────────────────────────────────────────────────

export type SleeperConnection = {
  username: string;
  sleeperId: string; // Sleeper user_id
};

export async function readSleeperConnection(userId: string): Promise<SleeperConnection | null> {
  try {
    if (isKvAvailable()) return await kvGet<SleeperConnection>(`tokens:sleeper:${userId}`);
    const file = path.join(getUserDir(), `${userId}.sleeper.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function saveSleeperConnection(userId: string, data: SleeperConnection): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`tokens:sleeper:${userId}`, data);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.sleeper.json`),
        JSON.stringify(data, null, 2)
      );
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save Sleeper connection for ${userId.slice(0, 8)}...`, e);
  }
}

export async function clearSleeperConnection(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`tokens:sleeper:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.sleeper.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
}

export async function readSleeperLeague(userId: string): Promise<string | null> {
  try {
    if (isKvAvailable()) return await kvGet<string>(`league:sleeper:${userId}`);
    const file = path.join(getUserDir(), `${userId}.sleeper.league.txt`);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export async function saveSleeperLeague(userId: string, leagueId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`league:sleeper:${userId}`, leagueId);
    } else {
      fs.writeFileSync(path.join(getUserDir(), `${userId}.sleeper.league.txt`), leagueId);
    }
  } catch {}
}

export async function deleteSleeperLeague(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`league:sleeper:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.sleeper.league.txt`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
}

// ─── ESPN connection ──────────────────────────────────────────────────────────

export type EspnConnection = {
  leagueId: string;
  season: number;
  leagueName?: string;
  espnS2?: string;
  swid?: string;
  espnToken?: string; // ESPN-ONESITE.WEB-PROD.token (newer auth system)
  relay?: boolean;    // true = private league synced via browser extension
};

// ── Multi-league ESPN ─────────────────────────────────────────────────────────

export async function readEspnConnections(userId: string): Promise<EspnConnection[]> {
  try {
    let conns: EspnConnection[] | null = null;
    if (isKvAvailable()) {
      conns = await kvGet<EspnConnection[]>(`leagues:espn:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.leagues.espn.json`);
      if (fs.existsSync(file)) conns = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    if (conns && conns.length > 0) return conns.map(decryptConn);
    // Migrate: fall back to old single-connection key, and write it forward to
    // the multi-league key encrypted so the plaintext legacy copy stops being
    // the source of truth.
    const single = await readEspnConnection(userId);
    if (single) {
      await saveEspnConnections(userId, [encryptConn(single)]).catch(() => {});
      return [single];
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveEspnConnections(userId: string, conns: EspnConnection[]): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`leagues:espn:${userId}`, conns);
    } else {
      const dir = getUserDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${userId}.leagues.espn.json`), JSON.stringify(conns, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN connections for ${userId.slice(0, 8)}...`, e);
  }
}

function encryptConn(conn: EspnConnection): EspnConnection {
  // espnToken (the ONESITE token) holds the access+refresh tokens — encrypt it too,
  // not just espn_s2/swid. The "enc:" prefix makes this transparently back-compatible
  // with already-stored plaintext values (they re-encrypt on next write).
  return {
    ...conn,
    espnS2: encryptField(conn.espnS2),
    swid: encryptField(conn.swid),
    espnToken: encryptField(conn.espnToken),
  };
}

function decryptConn(conn: EspnConnection): EspnConnection {
  return {
    ...conn,
    espnS2: decryptField(conn.espnS2),
    swid: decryptField(conn.swid),
    espnToken: decryptField(conn.espnToken),
  };
}

export async function addEspnConnection(userId: string, conn: EspnConnection): Promise<void> {
  const existing = await readEspnConnections(userId);
  const updated = [...existing.filter((c) => c.leagueId !== conn.leagueId), encryptConn(conn)];
  await saveEspnConnections(userId, updated);
  await registerLeague({ platform: "espn", leagueId: conn.leagueId, userId, season: conn.season });
  await registerEspnUser(userId);
  void recordConnection({
    userId,
    platform: "espn",
    leagueId: conn.leagueId,
    leagueName: conn.leagueName,
    season: conn.season,
  }).catch(() => {});
}

export async function removeEspnConnection(userId: string, leagueId: string): Promise<void> {
  const existing = await readEspnConnections(userId);
  await saveEspnConnections(userId, existing.filter((c) => c.leagueId !== leagueId));
  await unregisterLeague("espn", leagueId);
  void markConnectionRemoved(userId, "espn", leagueId).catch(() => {});
}

/**
 * Merge fresh credentials into an existing ESPN connection (preserving
 * leagueName/relay/season). Used when the server refreshes the ONESITE token on
 * the read path so subsequent reads use the newly-minted espn_s2.
 */
export async function updateEspnConnectionCreds(
  userId: string,
  leagueId: string,
  creds: { espnS2?: string; swid?: string; espnToken?: string }
): Promise<void> {
  const existing = await readEspnConnections(userId);
  const match = existing.find((c) => c.leagueId === leagueId);
  if (!match) return;
  await addEspnConnection(userId, { ...match, ...creds });
}

/**
 * Season rollover self-heal: persist the new season once ESPN has
 * reactivated a league for it. Never moves the season backwards.
 */
export async function updateEspnConnectionSeason(
  userId: string,
  leagueId: string,
  season: number
): Promise<void> {
  if (!Number.isFinite(season) || season <= 0) return;
  const existing = await readEspnConnections(userId);
  const match = existing.find((c) => c.leagueId === leagueId);
  if (!match || match.season >= season) return;
  await addEspnConnection(userId, { ...match, season });
}

// ── Legacy single-connection shims (kept for internal fallback use) ────────────

export async function readEspnConnection(userId: string): Promise<EspnConnection | null> {
  try {
    let raw: EspnConnection | null = null;
    if (isKvAvailable()) {
      raw = await kvGet<EspnConnection>(`tokens:espn:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.espn.json`);
      if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    return raw ? decryptConn(raw) : null;
  } catch {
    return null;
  }
}

export async function saveEspnConnection(userId: string, data: EspnConnection): Promise<void> {
  // Writes to both old single key and new array for full backward compat.
  // Both copies are encrypted; the legacy key used to store plaintext.
  await addEspnConnection(userId, data);
  try {
    const encrypted = encryptConn(data);
    if (isKvAvailable()) {
      await kvSet(`tokens:espn:${userId}`, encrypted);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.espn.json`),
        JSON.stringify(encrypted, null, 2)
      );
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN connection for ${userId.slice(0, 8)}...`, e);
  }
}

export async function clearEspnConnection(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`tokens:espn:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.espn.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
}

// ─── ESPN relay cache (raw data synced by browser extension) ─────────────────

export type EspnRelayData = {
  leagueId: string;
  season: number;
  raw: unknown;    // raw ESPN API JSON response
  synced: number;  // unix ms timestamp
};

/** Strip any characters that could be used for path traversal or injection */
function safeLeagueId(leagueId: string): string {
  return leagueId.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function saveEspnRelayData(userId: string, data: EspnRelayData): Promise<void> {
  const key = `espn:relay:${userId}:${data.leagueId}`;
  const file = path.join(getUserDir(), `${userId}.espn.relay.${safeLeagueId(data.leagueId)}.json`);
  try {
    if (isKvAvailable()) {
      await kvSet(key, data);
    } else {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN relay data for ${userId.slice(0, 8)}...`, e);
  }
}

export async function readEspnRelayData(userId: string, leagueId: string): Promise<EspnRelayData | null> {
  try {
    if (isKvAvailable()) {
      // Try per-league key first, fall back to legacy single-league key
      const data = await kvGet<EspnRelayData>(`espn:relay:${userId}:${leagueId}`);
      if (data) return data;
      const legacy = await kvGet<EspnRelayData>(`espn:relay:${userId}`);
      return legacy?.leagueId === leagueId ? legacy : null;
    }
    const file = path.join(getUserDir(), `${userId}.espn.relay.${safeLeagueId(leagueId)}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    // Legacy fallback
    const legacyFile = path.join(getUserDir(), `${userId}.espn.relay.json`);
    if (fs.existsSync(legacyFile)) {
      const legacy = JSON.parse(fs.readFileSync(legacyFile, "utf8")) as EspnRelayData;
      return legacy?.leagueId === leagueId ? legacy : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── ESPN relay snapshot (pre-parsed league data, written on relay sync) ─────
// Much smaller than the raw blob, so the per-request read path stays cheap.
// The raw blob is still stored separately — the roster endpoint needs it.

export type EspnRelaySnapshot = {
  leagueId: string;
  season: number;
  parsed: unknown;  // parseEspnLeagueRaw() output for the current week
  synced: number;   // unix ms timestamp
};

export async function saveEspnRelaySnapshot(userId: string, data: EspnRelaySnapshot): Promise<void> {
  const key = `espn:relaysnap:${userId}:${data.leagueId}`;
  const file = path.join(getUserDir(), `${userId}.espn.relaysnap.${safeLeagueId(data.leagueId)}.json`);
  try {
    if (isKvAvailable()) {
      await kvSet(key, data);
    } else {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN relay snapshot for ${userId.slice(0, 8)}...`, e);
  }
}

export async function readEspnRelaySnapshot(userId: string, leagueId: string): Promise<EspnRelaySnapshot | null> {
  try {
    if (isKvAvailable()) {
      return await kvGet<EspnRelaySnapshot>(`espn:relaysnap:${userId}:${leagueId}`);
    }
    const file = path.join(getUserDir(), `${userId}.espn.relaysnap.${safeLeagueId(leagueId)}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    return null;
  } catch {
    return null;
  }
}

// ─── My Team (per platform, optionally per league) ───────────────────────────

export type MyTeamData = {
  teamKey: string;
  teamName: string;
};

// leagueId scopes the team to a specific league. Without it, falls back to
// platform-level key (kept for ESPN which has one league per connection).
export async function saveMyTeam(
  userId: string,
  platform: string,
  data: MyTeamData,
  leagueId?: string
): Promise<void> {
  const key = leagueId ? `myteam:${platform}:${leagueId}:${userId}` : `myteam:${platform}:${userId}`;
  const file = leagueId
    ? path.join(getUserDir(), `${userId}.myteam.${platform}.${leagueId}.json`)
    : path.join(getUserDir(), `${userId}.myteam.${platform}.json`);
  try {
    if (isKvAvailable()) {
      await kvSet(key, data);
    } else {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save myTeam for ${userId.slice(0, 8)}...`, e);
  }
}

export async function readMyTeam(
  userId: string,
  platform: string,
  leagueId?: string
): Promise<MyTeamData | null> {
  const key = leagueId ? `myteam:${platform}:${leagueId}:${userId}` : `myteam:${platform}:${userId}`;
  const file = leagueId
    ? path.join(getUserDir(), `${userId}.myteam.${platform}.${leagueId}.json`)
    : path.join(getUserDir(), `${userId}.myteam.${platform}.json`);
  try {
    if (isKvAvailable()) return await kvGet<MyTeamData>(key);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function clearMyTeam(userId: string, platform: string, leagueId?: string): Promise<void> {
  const key = leagueId ? `myteam:${platform}:${leagueId}:${userId}` : `myteam:${platform}:${userId}`;
  const file = leagueId
    ? path.join(getUserDir(), `${userId}.myteam.${platform}.${leagueId}.json`)
    : path.join(getUserDir(), `${userId}.myteam.${platform}.json`);
  try {
    if (isKvAvailable()) {
      await kvDel(key);
    } else {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
}

// ─── Commissioner flag (per platform + league) ────────────────────────────────

export async function setCommissioner(
  userId: string,
  platform: string,
  leagueId: string,
  value: boolean
): Promise<void> {
  const key = `commish:${platform}:${leagueId}:${userId}`;
  const file = path.join(getUserDir(), `${userId}.commish.${platform}.${safeLeagueId(leagueId)}.json`);
  try {
    if (isKvAvailable()) {
      if (value) await kvSet(key, true);
      else await kvDel(key);
    } else {
      if (value) fs.writeFileSync(file, "true");
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to set commissioner flag for ${userId.slice(0, 8)}...`, e);
  }
}

export async function isCommissioner(
  userId: string,
  platform: string,
  leagueId: string
): Promise<boolean> {
  const key = `commish:${platform}:${leagueId}:${userId}`;
  const file = path.join(getUserDir(), `${userId}.commish.${platform}.${safeLeagueId(leagueId)}.json`);
  try {
    if (isKvAvailable()) return (await kvGet<boolean>(key)) === true;
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

// ─── ESPN discovered leagues (auto-detected via extension) ───────────────────

export type EspnDiscoveredLeague = {
  leagueId: string;
  season: number;
  name?: string;
};

export async function readEspnDiscoveredLeagues(userId: string): Promise<EspnDiscoveredLeague[]> {
  try {
    if (isKvAvailable()) {
      return (await kvGet<EspnDiscoveredLeague[]>(`espn:discovered:${userId}`)) ?? [];
    }
    const file = path.join(getUserDir(), `${userId}.espn.discovered.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export async function saveEspnDiscoveredLeagues(userId: string, leagues: EspnDiscoveredLeague[]): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`espn:discovered:${userId}`, leagues);
    } else {
      const dir = getUserDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${userId}.espn.discovered.json`), JSON.stringify(leagues, null, 2));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN discovered leagues for ${userId.slice(0, 8)}...`, e);
  }
}

// ─── Multi-league (Yahoo) ─────────────────────────────────────────────────────

export async function readUserLeagues(userId: string): Promise<string[]> {
  try {
    let leagues: string[] | null = null;
    if (isKvAvailable()) {
      leagues = await kvGet<string[]>(`leagues:yahoo:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.leagues.yahoo.json`);
      if (fs.existsSync(file)) leagues = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    if (leagues && leagues.length > 0) return leagues;
    // Migrate: fall back to old single-league key
    const single = await readUserLeague(userId);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export async function saveUserLeagues(userId: string, leagues: string[]): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`leagues:yahoo:${userId}`, leagues);
    } else {
      const dir = getUserDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${userId}.leagues.yahoo.json`), JSON.stringify(leagues));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save Yahoo leagues for ${userId.slice(0, 8)}...`, e);
  }
}

export async function addUserLeague(userId: string, leagueKey: string): Promise<void> {
  const existing = await readUserLeagues(userId);
  if (!existing.includes(leagueKey)) {
    await saveUserLeagues(userId, [...existing, leagueKey]);
  }
  await registerLeague({ platform: "yahoo", leagueId: leagueKey, userId });
  void recordConnection({ userId, platform: "yahoo", leagueId: leagueKey }).catch(() => {});
}

export async function removeUserLeague(userId: string, leagueKey: string): Promise<void> {
  const existing = await readUserLeagues(userId);
  await saveUserLeagues(userId, existing.filter((k) => k !== leagueKey));
  await unregisterLeague("yahoo", leagueKey);
  void markConnectionRemoved(userId, "yahoo", leagueKey).catch(() => {});
}

// ─── Multi-league (Sleeper) ───────────────────────────────────────────────────

export async function readSleeperLeagues(userId: string): Promise<string[]> {
  try {
    let leagues: string[] | null = null;
    if (isKvAvailable()) {
      leagues = await kvGet<string[]>(`leagues:sleeper:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.leagues.sleeper.json`);
      if (fs.existsSync(file)) leagues = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    if (leagues && leagues.length > 0) return leagues;
    // Migrate: fall back to old single-league key
    const single = await readSleeperLeague(userId);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export async function saveSleeperLeagues(userId: string, leagues: string[]): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`leagues:sleeper:${userId}`, leagues);
    } else {
      const dir = getUserDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${userId}.leagues.sleeper.json`), JSON.stringify(leagues));
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save Sleeper leagues for ${userId.slice(0, 8)}...`, e);
  }
}

export async function addSleeperLeague(userId: string, leagueId: string): Promise<void> {
  const existing = await readSleeperLeagues(userId);
  if (!existing.includes(leagueId)) {
    await saveSleeperLeagues(userId, [...existing, leagueId]);
  }
  await registerLeague({ platform: "sleeper", leagueId, userId });
  void recordConnection({ userId, platform: "sleeper", leagueId }).catch(() => {});
}

export async function removeSleeperLeague(userId: string, leagueId: string): Promise<void> {
  const existing = await readSleeperLeagues(userId);
  await saveSleeperLeagues(userId, existing.filter((id) => id !== leagueId));
  await unregisterLeague("sleeper", leagueId);
  void markConnectionRemoved(userId, "sleeper", leagueId).catch(() => {});
}

// ─── Token validation + refresh ──────────────────────────────────────────────

export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const tokens = await readUserTokens(userId);
  if (!tokens?.access_token) return null;

  const now = Date.now();
  const bufferMs = 120_000;
  // A missing expires_at means we can't trust the token's freshness — treat it
  // as needing a refresh rather than "valid forever" (the old behavior, which
  // let stale tokens through until a request hard-failed with 401).
  const isExpired = !tokens.expires_at || now >= tokens.expires_at - bufferMs;

  if (!isExpired) return tokens.access_token;

  if (tokens.refresh_token) {
    const refreshed = await refreshAccessToken(userId, tokens);
    // If the refresh failed but we have no known expiry, fall back to the
    // existing access token as a best effort rather than returning nothing.
    return refreshed ?? (tokens.expires_at ? null : tokens.access_token);
  }
  return tokens.access_token;
}

export async function forceRefreshTokenForUser(userId: string): Promise<string | null> {
  const tokens = await readUserTokens(userId);
  if (!tokens?.refresh_token) return null;
  return refreshAccessToken(userId, tokens);
}

// Yahoo rotates refresh tokens, so two concurrent refreshes are destructive:
// the loser burns a stale refresh_token, gets invalid_grant, and (before this
// guard) wiped the winner's freshly-saved tokens. Dedupe in-process and take a
// short KV lock across serverless instances.
const refreshInFlight = new Map<string, Promise<string | null>>();

async function refreshAccessToken(userId: string, tokens: UserTokens): Promise<string | null> {
  const existing = refreshInFlight.get(userId);
  if (existing) return existing;
  const p = doRefreshAccessToken(userId, tokens).finally(() => refreshInFlight.delete(userId));
  refreshInFlight.set(userId, p);
  return p;
}

async function acquireRefreshLock(userId: string): Promise<boolean> {
  if (!isKvAvailable()) return true;
  try {
    const { kv } = await import("@/lib/kv");
    const res = await kv.set(`lock:yahoo-refresh:${userId}`, "1", { nx: true, ex: 30 });
    return res === "OK";
  } catch {
    return true; // lock infra failure: proceed unlocked rather than block auth
  }
}

async function releaseRefreshLock(userId: string): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    await kvDel(`lock:yahoo-refresh:${userId}`);
  } catch {}
}

async function doRefreshAccessToken(userId: string, tokens: UserTokens): Promise<string | null> {
  if (!(await acquireRefreshLock(userId))) {
    // Another instance is refreshing. Wait for it, then use what it saved.
    await new Promise((r) => setTimeout(r, 1500));
    const latest = await readUserTokens(userId);
    if (latest?.access_token && latest.expires_at && Date.now() < latest.expires_at - 60_000) {
      return latest.access_token;
    }
    return latest?.access_token ?? null;
  }
  try {
    return await performTokenRefresh(userId, tokens);
  } finally {
    await releaseRefreshLock(userId);
  }
}

async function performTokenRefresh(userId: string, tokens: UserTokens): Promise<string | null> {
  const credentials = Buffer.from(
    `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
  ).toString("base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token!,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[TokenStore] Refresh failed (${response.status}) for ${userId.slice(0, 8)}...: ${body}`);
      if (response.status === 400 || response.status === 401) {
        // Only clear if our refresh_token is still the stored one. A concurrent
        // refresh may have already rotated and saved fresh tokens; wiping here
        // would log the user out right after a successful refresh.
        const stored = await readUserTokens(userId);
        if (!stored?.refresh_token || stored.refresh_token === tokens.refresh_token) {
          await clearUserTokens(userId);
        } else if (stored.access_token) {
          return stored.access_token;
        }
      }
      return null;
    }

    const newTokens: UserTokens = await response.json();
    // Yahoo sometimes omits refresh_token in the response — preserve the old one
    if (!newTokens.refresh_token) newTokens.refresh_token = tokens.refresh_token;
    await saveUserTokens(userId, newTokens);
    console.log(`[TokenStore] Refreshed token for ${userId.slice(0, 8)}...`);
    return newTokens.access_token ?? null;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      console.error(`[TokenStore] Refresh timeout for ${userId.slice(0, 8)}...`);
    } else {
      console.error(`[TokenStore] Refresh error for ${userId.slice(0, 8)}...`, e.message);
    }
    return null;
  }
}

// ─── Theme (favorite NFL team accent) ─────────────────────────────────────────

export async function getUserTheme(userId: string): Promise<string | null> {
  try {
    if (isKvAvailable()) return (await kvGet<string>(`theme:${userId}`)) ?? null;
    const file = path.join(getUserDir(), `${userId}.theme.txt`);
    return fs.existsSync(file) ? (fs.readFileSync(file, "utf8").trim() || null) : null;
  } catch {
    return null;
  }
}

export async function setUserTheme(userId: string, teamId: string | null): Promise<void> {
  try {
    if (isKvAvailable()) {
      if (teamId) await kvSet(`theme:${userId}`, teamId);
      else await kvDel(`theme:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.theme.txt`);
      if (teamId) {
        const dir = getUserDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, teamId);
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to set theme for ${userId.slice(0, 8)}...`, e);
  }
}

// ─── Odds 21+ acknowledgement ─────────────────────────────────────────────────
// One-time self-attestation gate on the Odds tab (Phase A of the odds plan).

export async function setOddsAck(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`odds:ack:${userId}`, true);
    } else {
      const dir = getUserDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${userId}.oddsack.txt`), "true");
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to set odds ack for ${userId.slice(0, 8)}...`, e);
  }
}

export async function hasOddsAck(userId: string): Promise<boolean> {
  try {
    if (isKvAvailable()) return (await kvGet<boolean>(`odds:ack:${userId}`)) === true;
    return fs.existsSync(path.join(getUserDir(), `${userId}.oddsack.txt`));
  } catch {
    return false;
  }
}

// ─── Onboarding state ─────────────────────────────────────────────────────────

/** True if the user has connected at least one league on any platform. */
export async function hasAnyConnection(userId: string): Promise<boolean> {
  try {
    const [yahoo, sleeper, espn] = await Promise.all([
      readUserLeagues(userId),
      readSleeperLeagues(userId),
      readEspnConnections(userId),
    ]);
    return yahoo.length > 0 || sleeper.length > 0 || espn.length > 0;
  } catch {
    return false;
  }
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  try {
    if (isKvAvailable()) {
      const val = await kvGet<boolean>(`onboarding:${userId}`);
      return val === true;
    }
    const file = path.join(getUserDir(), `${userId}.onboarding.json`);
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

// ─── Account deletion ─────────────────────────────────────────────────────────

/**
 * Wipe every KV key (or dev file) we hold for a user. Called by the Clerk
 * user.deleted webhook. Reads the user's connections first so per-league keys
 * (relay blobs, snapshots, my-team picks) can be enumerated before the
 * connection lists themselves are deleted. Returns the number of keys removed.
 */
export async function wipeUserData(userId: string): Promise<number> {
  // 1. Enumerate league ids BEFORE deleting the connection lists.
  const [yahooLeagues, sleeperLeagues, espnConns, espnDiscovered] = await Promise.all([
    readUserLeagues(userId).catch(() => [] as string[]),
    readSleeperLeagues(userId).catch(() => [] as string[]),
    readEspnConnections(userId).catch(() => [] as EspnConnection[]),
    readEspnDiscoveredLeagues(userId).catch(() => [] as EspnDiscoveredLeague[]),
  ]);
  const espnLeagueIds = Array.from(
    new Set([...espnConns.map((c) => c.leagueId), ...espnDiscovered.map((d) => d.leagueId)])
  );

  // 2. Build the full key inventory.
  const keys = new Set<string>([
    // Yahoo
    `tokens:yahoo:${userId}`,
    `league:${userId}`,
    `leagues:yahoo:${userId}`,
    // Sleeper
    `tokens:sleeper:${userId}`,
    `league:sleeper:${userId}`,
    `leagues:sleeper:${userId}`,
    // ESPN
    `tokens:espn:${userId}`,
    `leagues:espn:${userId}`,
    `espn:discovered:${userId}`,
    `espn:relay:${userId}`, // legacy single-league relay blob
    // Misc per-user state
    `theme:${userId}`,
    `onboarding:${userId}`,
    `relaytok:ver:${userId}`,
    `odds:ack:${userId}`,
    `odds:lastopen:${userId}`,
  ]);
  for (const lid of espnLeagueIds) {
    keys.add(`espn:relay:${userId}:${lid}`);
    keys.add(`espn:relaysnap:${userId}:${lid}`);
  }
  // My-team picks: platform-level + per-league keys.
  const perPlatformLeagues: Array<[string, string[]]> = [
    ["yahoo", yahooLeagues],
    ["sleeper", sleeperLeagues],
    ["espn", espnLeagueIds],
  ];
  for (const [platform, leagueIds] of perPlatformLeagues) {
    keys.add(`myteam:${platform}:${userId}`);
    for (const lid of leagueIds) {
      keys.add(`myteam:${platform}:${lid}:${userId}`);
      keys.add(`commish:${platform}:${lid}:${userId}`);
    }
  }

  // 3. Delete everything.
  let removed = 0;
  if (isKvAvailable()) {
    for (const key of keys) {
      try {
        await kvDel(key);
        removed++;
      } catch (e) {
        console.error(`[TokenStore] wipeUserData failed to delete ${key}`, e);
      }
    }
  } else {
    // Dev file storage: every per-user file is named `${userId}.*` in the user dir.
    try {
      const dir = getUserDir();
      if (fs.existsSync(dir)) {
        for (const name of fs.readdirSync(dir)) {
          if (name.startsWith(`${userId}.`)) {
            try {
              fs.unlinkSync(path.join(dir, name));
              removed++;
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error(`[TokenStore] wipeUserData file cleanup failed for ${userId.slice(0, 8)}...`, e);
    }
  }
  return removed;
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`onboarding:${userId}`, true);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.onboarding.json`),
        "true"
      );
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to mark onboarding complete for ${userId.slice(0, 8)}...`, e);
  }
}

// ─── ESPN setup pending (phone user deferred the desktop-only setup) ─────────
// Set when a phone user opts to finish the ESPN sync later on a computer (or
// emails themselves the setup link). The dashboard shows a reminder banner
// until an ESPN league is connected or the user dismisses it.

export async function setEspnSetupPending(userId: string, pending: boolean): Promise<void> {
  try {
    if (isKvAvailable()) {
      if (pending) await kvSet(`espnpending:${userId}`, true);
      else await kvDel(`espnpending:${userId}`);
      return;
    }
    const file = path.join(getUserDir(), `${userId}.espnpending.txt`);
    if (pending) fs.writeFileSync(file, "true");
    else if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {
    console.error(`[TokenStore] Failed to set ESPN setup pending for ${userId.slice(0, 8)}...`, e);
  }
}

export async function isEspnSetupPending(userId: string): Promise<boolean> {
  try {
    if (isKvAvailable()) return !!(await kvGet<boolean>(`espnpending:${userId}`));
    return fs.existsSync(path.join(getUserDir(), `${userId}.espnpending.txt`));
  } catch {
    return false;
  }
}
