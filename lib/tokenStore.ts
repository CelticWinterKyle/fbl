import fs from "fs";
import path from "path";

type Tokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  [k: string]: any;
};

const STORE = process.env.YAHOO_TOKEN_DIR 
  ? path.join(process.env.YAHOO_TOKEN_DIR, "yahoo-tokens.json")
  : process.cwd().startsWith("/var/task") || process.cwd().startsWith("/tmp")
  ? "/tmp/yahoo-tokens.json"
  : path.join(process.cwd(), "lib", "yahoo-tokens.json");

function getRedirectUri(): string {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  if (process.env.PUBLIC_BASE_URL) {
    const base = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return `${base}/api/yahoo/callback`;
  }
  return ""; // as last resort; refresh will probably fail but won't crash
}

export function readTokens(): Tokens {
  try { 
    // Ensure directory exists for the token file
    const dir = path.dirname(STORE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return JSON.parse(fs.readFileSync(STORE, "utf8")); 
  }
  catch { return {}; }
}

export function saveTokens(t: Tokens): Tokens {
  const prev = readTokens();
  const merged: Tokens = { ...prev, ...t };
  if (typeof t.expires_in === "number") {
    const buffer = 120;
    merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
  }
  
  try {
    // Ensure directory exists
    const dir = path.dirname(STORE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE, JSON.stringify(merged, null, 2));
  } catch (error) {
    console.error("Failed to save tokens:", error);
    // Don't throw, return what we have
  }
  
  return merged;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tk = readTokens();
  if (!tk?.access_token) return null;

  const now = Date.now();
  if (tk.expires_at && now < tk.expires_at) return tk.access_token!;

  if (!tk.refresh_token) {
    console.warn("No refresh token available, returning existing access token");
    return tk.access_token!;
  }

  try {
    console.log("Refreshing Yahoo access token...");
    const body = new URLSearchParams({
      client_id: process.env.YAHOO_CLIENT_ID!,
      client_secret: process.env.YAHOO_CLIENT_SECRET!,
      redirect_uri: getRedirectUri(),
      grant_type: "refresh_token",
      refresh_token: tk.refresh_token!,
    });

    const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!r.ok) {
      const errorText = await r.text();
      console.error(`Token refresh failed: ${r.status} ${r.statusText} - ${errorText}`);
      
      // If refresh token is invalid, return null to force re-authentication
      if (r.status === 400) {
        console.warn("Refresh token invalid, clearing stored tokens");
        saveTokens({ access_token: "", refresh_token: "", expires_at: 0 });
        return null;
      }
      
      // For other errors, return existing token as fallback
      return tk.access_token || null;
    }

    const data = await r.json().catch(() => ({} as any));
    if (data?.access_token) {
      console.log("Successfully refreshed Yahoo access token");
      const merged = saveTokens({
        ...data,
        refresh_token: data.refresh_token || tk.refresh_token,
      });
      return merged.access_token || null;
    } else {
      console.error("Token refresh response missing access_token:", data);
      return tk.access_token || null;
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    return tk.access_token || null;
  }
}
