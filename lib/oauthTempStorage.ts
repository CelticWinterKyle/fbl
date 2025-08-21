import fs from "fs";
import path from "path";

// Simple global token storage for OAuth flow
// This bypasses all the user ID complexity during the critical OAuth moment

function getGlobalTokenFile(): string {
  const dir = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task") 
    ? "/tmp" 
    : process.cwd();
  return path.join(dir, "yahoo-oauth-temp.json");
}

export function saveOAuthTokens(tokens: any) {
  const file = getGlobalTokenFile();
  const data = {
    tokens,
    timestamp: Date.now(),
    expires: Date.now() + (5 * 60 * 1000) // 5 minutes
  };
  fs.writeFileSync(file, JSON.stringify(data));
  console.log('[OAuth Temp] Saved tokens to global temp file');
}

export function getOAuthTokens(): any | null {
  try {
    const file = getGlobalTokenFile();
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    
    if (Date.now() > data.expires) {
      console.log('[OAuth Temp] Tokens expired, removing');
      fs.unlinkSync(file);
      return null;
    }
    
    console.log('[OAuth Temp] Retrieved tokens from global temp file');
    return data.tokens;
  } catch {
    return null;
  }
}

export function clearOAuthTokens() {
  try {
    const file = getGlobalTokenFile();
    fs.unlinkSync(file);
    console.log('[OAuth Temp] Cleared global temp tokens');
  } catch {}
}
