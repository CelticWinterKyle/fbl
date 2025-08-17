import { NextRequest, NextResponse } from "next/server";
import { readTokens } from "@/lib/tokenStore";
import { readUserTokens } from "@/lib/userTokenStore";
import { getOrCreateUserId } from "@/lib/userSession";

export async function GET(request: NextRequest) {
  const userContext = getOrCreateUserId(request);
  const userId = userContext.userId;
  
  // Check global tokens
  const globalTokens = readTokens();
  const hasGlobalTokens = !!(globalTokens.access_token);
  const globalExpiry = globalTokens.expires_at ? new Date(globalTokens.expires_at) : null;
  const globalValid = globalExpiry ? globalExpiry > new Date() : false;
  
  // Check user tokens
  const userTokens = readUserTokens(userId);
  const hasUserTokens = !!(userTokens?.access_token);
  const userExpiry = userTokens?.expires_at ? new Date(userTokens.expires_at) : null;
  const userValid = userExpiry ? userExpiry > new Date() : false;
  
  // Environment check
  const isVercel = process.env.VERCEL === '1';
  const storePath = process.env.YAHOO_TOKEN_DIR 
    ? process.env.YAHOO_TOKEN_DIR
    : process.cwd().startsWith("/var/task") || process.cwd().startsWith("/tmp")
    ? "/tmp"
    : "lib";
  
  return NextResponse.json({
    ok: true,
    environment: {
      isVercel,
      nodeEnv: process.env.NODE_ENV,
      storePath,
      hasYahooCredentials: !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      baseUrl: process.env.PUBLIC_BASE_URL,
    },
    storage: {
      global: {
        hasTokens: hasGlobalTokens,
        isValid: globalValid,
        expiresAt: globalExpiry?.toISOString(),
        tokenPrefix: globalTokens.access_token ? globalTokens.access_token.substring(0, 8) + "..." : null,
      },
      user: {
        userId,
        hasTokens: hasUserTokens,
        isValid: userValid,
        expiresAt: userExpiry?.toISOString(),
        tokenPrefix: userTokens?.access_token ? userTokens.access_token.substring(0, 8) + "..." : null,
      }
    },
    warnings: isVercel && storePath === "/tmp" ? [
      "Using /tmp storage on Vercel - tokens may be lost when functions restart",
      "Consider upgrading to Vercel KV for persistent storage"
    ] : []
  });
}
