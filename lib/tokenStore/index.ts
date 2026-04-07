import fs from "fs";
import path from "path";
import crypto from "crypto";

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
  if (!key) return value; // no SESSION_SECRET → store plaintext
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
  const { kv } = await import("@vercel/kv");
  return kv.get<T>(key);
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(key, value);
}

async function kvDel(key: string): Promise<void> {
  const { kv } = await import("@vercel/kv");
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
  if (typeof tokens.expires_in === "number" && !tokens.expires_at) {
    merged.expires_at = Date.now() + (tokens.expires_in - 120) * 1000;
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
    // Migrate: fall back to old single-connection key
    const single = await readEspnConnection(userId);
    return single ? [decryptConn(single)] : [];
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
  return { ...conn, espnS2: encryptField(conn.espnS2), swid: encryptField(conn.swid) };
}

function decryptConn(conn: EspnConnection): EspnConnection {
  return { ...conn, espnS2: decryptField(conn.espnS2), swid: decryptField(conn.swid) };
}

export async function addEspnConnection(userId: string, conn: EspnConnection): Promise<void> {
  const existing = await readEspnConnections(userId);
  const updated = [...existing.filter((c) => c.leagueId !== conn.leagueId), encryptConn(conn)];
  await saveEspnConnections(userId, updated);
}

export async function removeEspnConnection(userId: string, leagueId: string): Promise<void> {
  const existing = await readEspnConnections(userId);
  await saveEspnConnections(userId, existing.filter((c) => c.leagueId !== leagueId));
}

// ── Legacy single-connection shims (kept for internal fallback use) ────────────

export async function readEspnConnection(userId: string): Promise<EspnConnection | null> {
  try {
    if (isKvAvailable()) return await kvGet<EspnConnection>(`tokens:espn:${userId}`);
    const file = path.join(getUserDir(), `${userId}.espn.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function saveEspnConnection(userId: string, data: EspnConnection): Promise<void> {
  // Writes to both old single key and new array for full backward compat
  await addEspnConnection(userId, data);
  try {
    if (isKvAvailable()) {
      await kvSet(`tokens:espn:${userId}`, data);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.espn.json`),
        JSON.stringify(data, null, 2)
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

// ─── ESPN discovered leagues (auto-detected via extension) ───────────────────

export type EspnDiscoveredLeague = {
  leagueId: string;
  season: number;
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
}

export async function removeUserLeague(userId: string, leagueKey: string): Promise<void> {
  const existing = await readUserLeagues(userId);
  await saveUserLeagues(userId, existing.filter((k) => k !== leagueKey));
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
}

export async function removeSleeperLeague(userId: string, leagueId: string): Promise<void> {
  const existing = await readSleeperLeagues(userId);
  await saveSleeperLeagues(userId, existing.filter((id) => id !== leagueId));
}

// ─── Token validation + refresh ──────────────────────────────────────────────

export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const tokens = await readUserTokens(userId);
  if (!tokens?.access_token) return null;

  const now = Date.now();
  const bufferMs = 120_000;
  const isExpired = !!tokens.expires_at && now >= tokens.expires_at - bufferMs;

  if (!isExpired) return tokens.access_token;

  if (tokens.refresh_token) {
    return refreshAccessToken(userId, tokens);
  }
  return null;
}

export async function forceRefreshTokenForUser(userId: string): Promise<string | null> {
  const tokens = await readUserTokens(userId);
  if (!tokens?.refresh_token) return null;
  return refreshAccessToken(userId, tokens);
}

async function refreshAccessToken(userId: string, tokens: UserTokens): Promise<string | null> {
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
        await clearUserTokens(userId);
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

// ─── Onboarding state ─────────────────────────────────────────────────────────

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
