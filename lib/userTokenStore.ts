import fs from "fs";
import path from "path";

export type UserTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  [k: string]: any;
};

// Use a writable directory. On serverless (Vercel) only /tmp is writable at runtime.
const ROOT = process.env.YAHOO_TOKEN_DIR || (process.cwd().startsWith("/var/task") ? "/tmp/yahoo-users" : path.join(process.cwd(), "lib", "yahoo-users"));

// In-memory cache as fallback for file system issues
const tokenCache = new Map<string, { tokens: UserTokens; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function ensureDir() {
  try {
    if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
  } catch (e) {
    // last resort fallback to /tmp
    if (!ROOT.startsWith("/tmp")) {
      const fallback = "/tmp/yahoo-users";
      if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
      (global as any).__YAHOO_USER_ROOT = fallback;
    }
  }
}

function fileFor(userId: string) {
  ensureDir();
  const base = (global as any).__YAHOO_USER_ROOT || ROOT;
  return path.join(base, `${userId}.json`);
}

export function readUserTokens(userId: string) {
  try { 
    const tokens = JSON.parse(fs.readFileSync(fileFor(userId), "utf8"));
    // Update cache with successful file read
    tokenCache.set(userId, { tokens, timestamp: Date.now() });
    return tokens;
  } catch (error) {
    console.warn(`[Token] File read failed for ${userId.slice(0,8)}..., checking cache:`, error);
    // Fallback to cache
    const cached = tokenCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Token] Using cached tokens for ${userId.slice(0,8)}...`);
      return cached.tokens;
    }
    console.error(`[Token] No valid tokens found for ${userId.slice(0,8)}... (file failed, cache miss/expired)`);
    return null;
  }
}

export function saveUserTokens(userId: string, t: UserTokens): UserTokens {
  const prev = readUserTokens(userId) || {};
  const merged: UserTokens = { ...prev, ...t };
  if (typeof t.expires_in === "number") {
    const buffer = 120;
    merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
  }
  
  // Always update cache first (immediate availability)
  tokenCache.set(userId, { tokens: merged, timestamp: Date.now() });
  
  try {
    fs.writeFileSync(fileFor(userId), JSON.stringify(merged, null, 2));
    console.log(`Successfully saved tokens for user ${userId.slice(0,8)}... (file + cache)`);
  } catch (error) {
    console.error(`Failed to save user tokens to file for ${userId}:`, error);
    console.log(`Tokens saved to cache only for ${userId.slice(0,8)}...`);
    // Don't throw - cache save succeeded
  }
  
  return merged;
}

function getRedirectUri(): string {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  if (process.env.PUBLIC_BASE_URL) {
    const base = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return `${base}/api/yahoo/callback`;
  }
  return "";
}

// Keep track of ongoing refresh operations to prevent duplicates
const refreshPromises = new Map<string, Promise<string | null>>();

export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const tk = readUserTokens(userId);
  if (!tk?.access_token) {
    console.log(`[Token] No access token found for user ${userId}`);
    return null;
  }
  
  const now = Date.now();
  const expiresAt = tk.expires_at || 0;
  const isExpired = expiresAt > 0 && now >= expiresAt;
  
  console.log(`[Token] User ${userId.slice(0,8)}... token status:`, {
    hasToken: !!tk.access_token,
    expiresAt: new Date(expiresAt).toISOString(),
    isExpired,
    hasRefreshToken: !!tk.refresh_token
  });
  
  // If token is valid, return it immediately
  if (!isExpired) {
    console.log(`[Token] Using valid token for user ${userId.slice(0,8)}...`);
    return tk.access_token!;
  }
  
  // If no refresh token, return existing (might still work)
  if (!tk.refresh_token) {
    console.warn(`[Token] No refresh token available for user ${userId.slice(0,8)}..., returning existing access token`);
    return tk.access_token!;
  }
  
  // Check if refresh is already in progress
  const refreshKey = userId;
  if (refreshPromises.has(refreshKey)) {
    console.log(`[Token] Refresh already in progress for user ${userId.slice(0,8)}..., waiting...`);
    return await refreshPromises.get(refreshKey)!;
  }
  
  // Start refresh operation
  const refreshPromise = performTokenRefresh(userId, tk);
  refreshPromises.set(refreshKey, refreshPromise);
  
  try {
    const result = await refreshPromise;
    return result;
  } finally {
    refreshPromises.delete(refreshKey);
  }
}

async function performTokenRefresh(userId: string, tk: UserTokens): Promise<string | null> {
  try {
    console.log(`[Token] Refreshing Yahoo access token for user ${userId.slice(0,8)}...`);
    
    // Create Basic Auth header as per Yahoo's OAuth 2.0 spec
    const clientId = process.env.YAHOO_CLIENT_ID!;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET!;
    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    const body = new URLSearchParams({
      redirect_uri: getRedirectUri(),
      grant_type: "refresh_token",
      refresh_token: tk.refresh_token!,
    });
    
    const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedCredentials}`
      },
      body,
    });
    
    if (!r.ok) {
      const errorText = await r.text();
      console.error(`[Token] Refresh failed for user ${userId.slice(0,8)}...: ${r.status} ${r.statusText} - ${errorText}`);
      
      // If refresh token is invalid, return null to force re-authentication
      if (r.status === 400) {
        console.warn(`[Token] Refresh token invalid for user ${userId.slice(0,8)}..., clearing stored tokens`);
        saveUserTokens(userId, { access_token: "", refresh_token: "", expires_at: 0 });
        return null;
      }
      
      // For other errors, return existing token as fallback
      console.warn(`[Token] Using fallback token for user ${userId.slice(0,8)}...`);
      return tk.access_token || null;
    }
    
    const data = await r.json().catch(() => ({} as any));
    if (data?.access_token) {
      console.log(`[Token] Successfully refreshed token for user ${userId.slice(0,8)}...`);
      const merged = saveUserTokens(userId, { 
        ...data, 
        refresh_token: data.refresh_token || tk.refresh_token 
      });
      return merged.access_token || null;
    } else {
      console.error(`[Token] Refresh response missing access_token for user ${userId.slice(0,8)}...:`, data);
      return tk.access_token || null;
    }
  } catch (error) {
    console.error(`[Token] Refresh error for user ${userId.slice(0,8)}...:`, error);
    return tk.access_token || null;
  }
}
