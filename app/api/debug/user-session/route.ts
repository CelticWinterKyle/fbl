import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId, getUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";
import { readUserTokens } from "@/lib/userTokenStore";

export async function GET(request: NextRequest) {
  // Get existing user ID without creating a new one
  const existingUserId = getUserId(request);
  
  // Get or create user ID (this will create if none exists)
  const userContext = getOrCreateUserId(request);
  const userId = userContext.userId;
  const wasCreated = userContext.created;
  
  // Get user's selected league
  const userLeague = readUserLeague(userId);
  
  // Get user's tokens
  const userTokens = readUserTokens(userId);
  const hasTokens = !!(userTokens?.access_token);
  const tokenExpiry = userTokens?.expires_at ? new Date(userTokens.expires_at) : null;
  const tokenValid = tokenExpiry ? tokenExpiry > new Date() : false;
  
  return NextResponse.json({
    ok: true,
    session: {
      userId,
      existingUserId,
      wasCreated,
      hasExistingSession: !!existingUserId,
    },
    league: {
      selectedLeague: userLeague,
      hasSelection: !!userLeague,
    },
    tokens: {
      hasTokens,
      isValid: tokenValid,
      expiresAt: tokenExpiry?.toISOString(),
      tokenPrefix: userTokens?.access_token ? userTokens.access_token.substring(0, 8) + "..." : null,
    },
    environment: {
      isVercel: process.env.VERCEL === '1',
      nodeEnv: process.env.NODE_ENV,
      hasYahooCredentials: !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
      skipYahoo: process.env.SKIP_YAHOO === '1',
    }
  });
}