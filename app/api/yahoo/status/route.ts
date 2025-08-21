import { NextRequest, NextResponse } from "next/server";
import { readUserTokens } from "@/lib/userTokenStore";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  // Simple: just check if user has tokens
  const tokens = readUserTokens(userId, req);
  const userLeague = readUserLeague(userId);
  
  const tokenReady = !!tokens?.access_token;
  const leagueReady = tokenReady && !!userLeague;
  
  const res = NextResponse.json({
    ok: tokenReady,
    userId,
    reason: tokenReady ? null : 'no_token',
    userLeague,
    leagueReady,
    tokenReady,
    tokenPreview: tokens?.access_token ? {
      access_token: tokens.access_token.slice(0,8) + '…',
      expires_at: tokens.expires_at || null,
      has_refresh: !!tokens.refresh_token,
    } : null,
  });
  
  // Prevent caching
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
