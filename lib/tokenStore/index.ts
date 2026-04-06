import fs from "fs";
import path from "path";

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

export async function saveEspnRelayData(userId: string, data: EspnRelayData): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`espn:relay:${userId}`, data);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.espn.relay.json`),
        JSON.stringify(data, null, 2)
      );
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save ESPN relay data for ${userId.slice(0, 8)}...`, e);
  }
}

export async function readEspnRelayData(userId: string): Promise<EspnRelayData | null> {
  try {
    if (isKvAvailable()) return await kvGet<EspnRelayData>(`espn:relay:${userId}`);
    const file = path.join(getUserDir(), `${userId}.espn.relay.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ─── My Team (per platform) ───────────────────────────────────────────────────

export type MyTeamData = {
  teamKey: string;
  teamName: string;
};

export async function saveMyTeam(userId: string, platform: string, data: MyTeamData): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvSet(`myteam:${platform}:${userId}`, data);
    } else {
      fs.writeFileSync(
        path.join(getUserDir(), `${userId}.myteam.${platform}.json`),
        JSON.stringify(data, null, 2)
      );
    }
  } catch (e) {
    console.error(`[TokenStore] Failed to save myTeam for ${userId.slice(0, 8)}...`, e);
  }
}

export async function readMyTeam(userId: string, platform: string): Promise<MyTeamData | null> {
  try {
    if (isKvAvailable()) return await kvGet<MyTeamData>(`myteam:${platform}:${userId}`);
    const file = path.join(getUserDir(), `${userId}.myteam.${platform}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function clearMyTeam(userId: string, platform: string): Promise<void> {
  try {
    if (isKvAvailable()) {
      await kvDel(`myteam:${platform}:${userId}`);
    } else {
      const file = path.join(getUserDir(), `${userId}.myteam.${platform}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch {}
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
