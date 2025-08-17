import { kv } from '@vercel/kv';

export type KVTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  [k: string]: any;
};

const TOKEN_KEY = 'yahoo_tokens_global';

export async function readTokensKV(): Promise<KVTokens> {
  try {
    const tokens = await kv.get<KVTokens>(TOKEN_KEY);
    return tokens || {};
  } catch (error) {
    console.error('Failed to read tokens from KV:', error);
    return {};
  }
}

export async function saveTokensKV(t: KVTokens): Promise<KVTokens> {
  try {
    const prev = await readTokensKV();
    const merged: KVTokens = { ...prev, ...t };
    
    if (typeof t.expires_in === "number") {
      const buffer = 120;
      merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
    }
    
    await kv.set(TOKEN_KEY, merged);
    return merged;
  } catch (error) {
    console.error('Failed to save tokens to KV:', error);
    return t;
  }
}

// User-specific token storage
export async function readUserTokensKV(userId: string): Promise<KVTokens> {
  try {
    const tokens = await kv.get<KVTokens>(`yahoo_tokens_user_${userId}`);
    return tokens || {};
  } catch (error) {
    console.error(`Failed to read user tokens for ${userId}:`, error);
    return {};
  }
}

export async function saveUserTokensKV(userId: string, t: KVTokens): Promise<KVTokens> {
  try {
    const prev = await readUserTokensKV(userId);
    const merged: KVTokens = { ...prev, ...t };
    
    if (typeof t.expires_in === "number") {
      const buffer = 120;
      merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
    }
    
    await kv.set(`yahoo_tokens_user_${userId}`, merged);
    return merged;
  } catch (error) {
    console.error(`Failed to save user tokens for ${userId}:`, error);
    return t;
  }
}

// League selection storage
export async function saveUserLeagueKV(userId: string, leagueKey: string): Promise<void> {
  try {
    await kv.set(`user_league_${userId}`, leagueKey);
  } catch (error) {
    console.error(`Failed to save user league for ${userId}:`, error);
  }
}

export async function readUserLeagueKV(userId: string): Promise<string | null> {
  try {
    return await kv.get<string>(`user_league_${userId}`);
  } catch (error) {
    console.error(`Failed to read user league for ${userId}:`, error);
    return null;
  }
}
