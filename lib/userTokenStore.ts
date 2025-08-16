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
  try { return JSON.parse(fs.readFileSync(fileFor(userId), "utf8")); } catch { return null; }
}

export function saveUserTokens(userId: string, t: UserTokens): UserTokens {
  const prev = readUserTokens(userId) || {};
  const merged: UserTokens = { ...prev, ...t };
  if (typeof t.expires_in === "number") {
    const buffer = 120;
    merged.expires_at = Date.now() + Math.max(0, (t.expires_in - buffer)) * 1000;
  }
  fs.writeFileSync(fileFor(userId), JSON.stringify(merged, null, 2));
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

export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const tk = readUserTokens(userId);
  if (!tk?.access_token) return null;
  const now = Date.now();
  if (tk.expires_at && now < tk.expires_at) return tk.access_token!;
  if (!tk.refresh_token) return tk.access_token!;
  try {
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
    const data = await r.json().catch(() => ({} as any));
    if (r.ok && data?.access_token) {
      const merged = saveUserTokens(userId, { ...data, refresh_token: data.refresh_token || tk.refresh_token });
      return merged.access_token || null;
    }
  } catch {}
  return tk.access_token || null;
}
