import fs from "fs";
import path from "path";

export type UserTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};

export function getTokenDir(): string {
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

export function readUserTokens(userId: string, req?: any): UserTokens | null {
  try {
    const file = fileFor(userId);
    if (!fs.existsSync(file)) {
      // Fallback: check cookie for tokens (for serverless environments)
      if (req && req.cookies) {
        try {
          const tokenCookie = req.cookies.get('fbl_tokens')?.value;
          if (tokenCookie) {
            const tokens = JSON.parse(Buffer.from(tokenCookie, 'base64').toString());
            console.log(`[Token] Found tokens in cookie for user ${userId.slice(0,8)}...`);
            // Save to file for future use
            fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
            return tokens;
          }
        } catch (e) {
          console.warn('[Token] Failed to read token cookie:', e);
        }
      }
      return null;
    }
    
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

export async function getValidAccessTokenForUser(userId: string, req?: any): Promise<string | null> {
  const tokens = readUserTokens(userId, req);
  if (!tokens?.access_token) {
    console.log(`[Token] No access token found for user ${userId.slice(0,8)}...`);
    return null;
  }
  
  // Check if token is expired (with 2 minute buffer for Vercel latency)
  const now = Date.now();
  const expiresAt = tokens.expires_at || 0;
  const bufferMs = 120_000; // 2 minutes
  const isExpired = expiresAt > 0 && now >= (expiresAt - bufferMs);
  
  if (!isExpired) {
    return tokens.access_token;
  }
  
  console.log(`[Token] Token expired for user ${userId.slice(0,8)}..., attempting refresh`);
  
  // If expired and we have a refresh token, try to refresh
  if (tokens.refresh_token) {
    const newToken = await refreshAccessToken(userId, tokens);
    if (newToken) {
      return newToken;
    }
  }
  
  // No refresh token or refresh failed
  console.log(`[Token] Cannot refresh token for user ${userId.slice(0,8)}...`);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedCredentials}`,
      },
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Token] Refresh failed for user ${userId.slice(0,8)}... Status: ${response.status}, Body: ${errorText}`);
      
      // If it's a 401/400, the refresh token is likely invalid
      if (response.status === 401 || response.status === 400) {
        // Clear the invalid tokens
        try {
          const file = fileFor(userId);
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`[Token] Cleared invalid tokens for user ${userId.slice(0,8)}...`);
          }
        } catch (e) {
          console.warn(`[Token] Failed to clear invalid tokens:`, e);
        }
      }
      
      return null;
    }

    const newTokens = await response.json();
    
    // Update stored tokens
    const savedTokens = await saveUserTokens(userId, newTokens);
    if (!savedTokens) {
      console.error(`[Token] Failed to save refreshed tokens for user ${userId.slice(0,8)}...`);
      return null;
    }
    
    console.log(`[Token] Successfully refreshed token for user ${userId.slice(0,8)}...`);
    return newTokens.access_token;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.error(`[Token] Refresh timeout for user ${userId.slice(0,8)}...`);
    } else {
      console.error(`[Token] Exception during refresh for user ${userId.slice(0,8)}...`, e.message);
    }
    return null;
  }
}
