import { NextRequest, NextResponse } from "next/server";
import { readUserTokens } from "@/lib/userTokenStore";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";

export async function GET(req: NextRequest) {
  const redirectEnv = process.env.YAHOO_REDIRECT_URI || null;
  const provisional = NextResponse.next();
  const { userId, created } = getOrCreateUserId(req, provisional);
  const tokens = userId ? readUserTokens(userId) : null;
  const { reason } = await getYahooAuthedForUser(userId || "");
  const userLeague = userId ? readUserLeague(userId) : null;
  
  // Debug logging
  console.log('[Yahoo Status Debug]', {
    userId: userId ? userId.slice(0,8) + '...' : 'none',
    userLeague,
    hasTokens: !!tokens,
    reason,
    created
  });
  
  const res = NextResponse.json({
    ok: true,
    userId,
    reason,
    hasClient: !!process.env.YAHOO_CLIENT_ID,
    hasSecret: !!process.env.YAHOO_CLIENT_SECRET,
  // Deprecated: global league env removed from main flow
  userLeague,
    redirectEnv,
    envFlags: {
      SKIP_YAHOO: process.env.SKIP_YAHOO || null,
      SKIP_YAHOO_DURING_BUILD: process.env.SKIP_YAHOO_DURING_BUILD || null,
      NEXT_PHASE: process.env.NEXT_PHASE || null,
    },
    tokenPreview: tokens?.access_token ? {
      access_token: tokens.access_token.slice(0,8) + '…',
      expires_at: tokens.expires_at || null,
      has_refresh: !!tokens.refresh_token,
    } : null,
  });
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
