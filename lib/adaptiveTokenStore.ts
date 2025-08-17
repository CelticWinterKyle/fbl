// Environment detection and storage adapter for production vs development
import fs from "fs";
import path from "path";

// Check if we're running on Vercel
export const isVercel = () => process.env.VERCEL === '1';

// Check if we're in production
export const isProduction = () => process.env.NODE_ENV === 'production';

// Storage adapter that works in both dev and production
export type StorageTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  [k: string]: any;
};

// File-based storage for development
function readTokensFile(): StorageTokens {
  const STORE = process.env.YAHOO_TOKEN_DIR 
    ? path.join(process.env.YAHOO_TOKEN_DIR, "yahoo-tokens.json")
    : process.cwd().startsWith("/var/task") || process.cwd().startsWith("/tmp")
    ? "/tmp/yahoo-tokens.json"
    : path.join(process.cwd(), "lib", "yahoo-tokens.json");

  try { 
    const dir = path.dirname(STORE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return JSON.parse(fs.readFileSync(STORE, "utf8")); 
  }
  catch { return {}; }
}

function saveTokensFile(t: StorageTokens): StorageTokens {
  const STORE = process.env.YAHOO_TOKEN_DIR 
    ? path.join(process.env.YAHOO_TOKEN_DIR, "yahoo-tokens.json")
    : process.cwd().startsWith("/var/task") || process.cwd().startsWith("/tmp")
    ? "/tmp/yahoo-tokens.json"
    : path.join(process.cwd(), "lib", "yahoo-tokens.json");

  const prev = readTokensFile();
  const merged: StorageTokens = { ...prev, ...t };
  if (typeof t.expires_in === "number") {
    const buffer = 120;
    merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
  }
  
  try {
    const dir = path.dirname(STORE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE, JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error('Failed to save tokens to file:', error);
  }
  return merged;
}

// KV storage for production (lazy loaded to avoid errors in dev)
async function getKV() {
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (error) {
    console.warn('KV not available, falling back to file storage');
    return null;
  }
}

async function readTokensKV(): Promise<StorageTokens> {
  const kv = await getKV();
  if (!kv) return {};
  
  try {
    const tokens = await kv.get<StorageTokens>('yahoo_tokens_global');
    return tokens || {};
  } catch (error) {
    console.error('Failed to read tokens from KV:', error);
    return {};
  }
}

async function saveTokensKV(t: StorageTokens): Promise<StorageTokens> {
  const kv = await getKV();
  if (!kv) return t;
  
  try {
    const prev = await readTokensKV();
    const merged: StorageTokens = { ...prev, ...t };
    
    if (typeof t.expires_in === "number") {
      const buffer = 120;
      merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
    }
    
    await kv.set('yahoo_tokens_global', merged);
    return merged;
  } catch (error) {
    console.error('Failed to save tokens to KV:', error);
    return t;
  }
}

// Unified interface that chooses storage based on environment
export async function readTokens(): Promise<StorageTokens> {
  if (isVercel()) {
    return await readTokensKV();
  } else {
    return readTokensFile();
  }
}

export async function saveTokens(t: StorageTokens): Promise<StorageTokens> {
  if (isVercel()) {
    return await saveTokensKV(t);
  } else {
    return saveTokensFile(t);
  }
}

// User-specific storage
export async function readUserTokens(userId: string): Promise<StorageTokens> {
  const kv = await getKV();
  if (!kv) {
    // Fallback to file storage for development
    try {
      const ROOT = process.env.YAHOO_TOKEN_DIR || path.join(process.cwd(), "lib", "yahoo-users");
      if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
      const filePath = path.join(ROOT, `${userId}.json`);
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return {};
    }
  }
  
  try {
    const tokens = await kv.get<StorageTokens>(`yahoo_tokens_user_${userId}`);
    return tokens || {};
  } catch (error) {
    console.error(`Failed to read user tokens for ${userId}:`, error);
    return {};
  }
}

export async function saveUserTokens(userId: string, t: StorageTokens): Promise<StorageTokens> {
  const kv = await getKV();
  if (!kv) {
    // Fallback to file storage for development
    const ROOT = process.env.YAHOO_TOKEN_DIR || path.join(process.cwd(), "lib", "yahoo-users");
    if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
    const filePath = path.join(ROOT, `${userId}.json`);
    
    const prev = await readUserTokens(userId);
    const merged: StorageTokens = { ...prev, ...t };
    if (typeof t.expires_in === "number") {
      const buffer = 120;
      merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
    }
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
    } catch (error) {
      console.error(`Failed to save user tokens for ${userId}:`, error);
    }
    return merged;
  }
  
  try {
    const prev = await readUserTokens(userId);
    const merged: StorageTokens = { ...prev, ...t };
    
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
export async function saveUserLeague(userId: string, leagueKey: string): Promise<void> {
  const kv = await getKV();
  if (!kv) {
    // Fallback to file storage for development
    const ROOT = process.env.YAHOO_TOKEN_DIR || path.join(process.cwd(), "lib", "yahoo-users");
    if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
    const filePath = path.join(ROOT, `${userId}_league.txt`);
    
    try {
      fs.writeFileSync(filePath, leagueKey);
    } catch (error) {
      console.error(`Failed to save user league for ${userId}:`, error);
    }
    return;
  }
  
  try {
    await kv.set(`user_league_${userId}`, leagueKey);
  } catch (error) {
    console.error(`Failed to save user league for ${userId}:`, error);
  }
}

export async function readUserLeague(userId: string): Promise<string | null> {
  const kv = await getKV();
  if (!kv) {
    // Fallback to file storage for development
    try {
      const ROOT = process.env.YAHOO_TOKEN_DIR || path.join(process.cwd(), "lib", "yahoo-users");
      const filePath = path.join(ROOT, `${userId}_league.txt`);
      return fs.readFileSync(filePath, "utf8").trim();
    } catch {
      return null;
    }
  }
  
  try {
    return await kv.get<string>(`user_league_${userId}`);
  } catch (error) {
    console.error(`Failed to read user league for ${userId}:`, error);
    return null;
  }
}
