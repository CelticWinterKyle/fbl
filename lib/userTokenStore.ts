import fs from "fs";
import path from "path";

export type UserTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};

function getTokenDir(): string {
  // Simple: use /tmp on serverless, current directory otherwise
  return process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME 
    ? "/tmp/yahoo-users" 
    : path.join(process.cwd(), "lib/yahoo-users");
}

function fileFor(userId: string): string {
  const dir = getTokenDir();
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${userId}.json`);
}

export function readUserTokens(userId: string): UserTokens | null {
  try {
    const file = fileFor(userId);
    if (!fs.existsSync(file)) return null;
    
    const content = fs.readFileSync(file, "utf8");
    return JSON.parse(content);
  } catch (e) {
    console.warn(`[Token] Failed to read tokens for ${userId.slice(0,8)}...`, e);
    return null;
  }
}

export async function saveUserTokens(userId: string, tokens: any): Promise<UserTokens | null> {
  try {
    // Add expiration timestamp if not present
    if (tokens.expires_in && !tokens.expires_at) {
      tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
    }
    
    const file = fileFor(userId);
    fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
    
    console.log(`[Token] Saved tokens for user ${userId.slice(0,8)}...`);
    return tokens;
  } catch (e) {
    console.error(`[Token] Failed to save tokens for ${userId.slice(0,8)}...`, e);
    return null;
  }
}

export async function getValidAccessTokenForUser(userId: string): Promise<string | null> {
  const tokens = readUserTokens(userId);
  if (!tokens?.access_token) {
    return null;
  }
  
  // Check if token is expired
  const now = Date.now();
  const expiresAt = tokens.expires_at || 0;
  const isExpired = expiresAt > 0 && now >= expiresAt;
  
  if (!isExpired) {
    return tokens.access_token;
  }
  
  // If expired and we have a refresh token, try to refresh
  if (tokens.refresh_token) {
    const newToken = await refreshAccessToken(userId, tokens);
    return newToken;
  }
  
  // No refresh token or refresh failed
  return null;
}

async function refreshAccessToken(userId: string, tokens: UserTokens): Promise<string | null> {
  try {
    const clientId = process.env.YAHOO_CLIENT_ID!;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET!;
    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token!,
    });

    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedCredentials}`,
      },
      body,
    });

    if (!response.ok) {
      console.error(`[Token] Refresh failed for user ${userId.slice(0,8)}...`);
      return null;
    }

    const newTokens = await response.json();
    
    // Update stored tokens
    await saveUserTokens(userId, newTokens);
    
    console.log(`[Token] Refreshed token for user ${userId.slice(0,8)}...`);
    return newTokens.access_token;
  } catch (e) {
    console.error(`[Token] Exception during refresh for user ${userId.slice(0,8)}...`, e);
    return null;
  }
}
