import { NextRequest, NextResponse } from "next/server";
import { readUserTokens } from "@/lib/userTokenStore";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";
import { getOAuthTokens } from "@/lib/oauthTempStorage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const redirectEnv = process.env.YAHOO_REDIRECT_URI || null;
  const provisional = NextResponse.next();
  const { userId, created } = getOrCreateUserId(req, provisional);
  
  // Try to read tokens - this will use fallback logic if needed
  const tokens = userId ? readUserTokens(userId) : null;
  
  // Additional fallback: check OAuth temp storage if no tokens found
  const oauthTokens = !tokens ? getOAuthTokens() : null;
  const finalTokens = tokens || oauthTokens;
  
  // Use a more reliable auth check that considers fallback tokens
  const authResult = userId ? await getYahooAuthedForUser(userId) : { reason: 'no_user' };
  const reason = authResult.reason;
  
  const userLeague = userId ? readUserLeague(userId) : null;
  
  // Debug logging
  console.log('[Yahoo Status Debug]', {
    userId: userId ? userId.slice(0,8) + '...' : 'none',
    userLeague,
    hasTokens: !!tokens,
    tokenDetails: tokens ? {
      hasAccess: !!tokens.access_token,
      hasRefresh: !!tokens.refresh_token,
      expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : 'none'
    } : null,
    reason,
    created,
    cookieValue: req.cookies.get('fbl_uid')?.value?.slice(0,8) + '...' || 'none'
  });
  
  const tokenReady = !!finalTokens?.access_token;
  const leagueReady = tokenReady && !!userLeague;
  
  
  const res = NextResponse.json({
    ok: tokenReady, // only true when we actually have a token now
    userId,
    reason: tokenReady ? (reason || null) : (reason || 'no_token'),
    hasClient: !!process.env.YAHOO_CLIENT_ID,
    hasSecret: !!process.env.YAHOO_CLIENT_SECRET,
    userLeague,
    leagueReady,
    tokenReady,
    redirectEnv,
    envFlags: {
      SKIP_YAHOO: process.env.SKIP_YAHOO || null,
      SKIP_YAHOO_DURING_BUILD: process.env.SKIP_YAHOO_DURING_BUILD || null,
      NEXT_PHASE: process.env.NEXT_PHASE || null,
    },
    tokenPreview: finalTokens?.access_token ? {
      access_token: finalTokens.access_token.slice(0,8) + '…',
      expires_at: finalTokens.expires_at || null,
      has_refresh: !!finalTokens.refresh_token,
    } : null,
  });
  
  // Prevent caching
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
