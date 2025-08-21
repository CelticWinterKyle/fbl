import { NextRequest, NextResponse } from "next/server";
import { readUserTokens } from "@/lib/userTokenStore";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const redirectEnv = process.env.YAHOO_REDIRECT_URI || null;
  const provisional = NextResponse.next();
  const { userId, created } = getOrCreateUserId(req, provisional);
  
  // Try to read tokens - this will use fallback logic if needed
  const tokens = userId ? readUserTokens(userId) : null;
  
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
  
  const tokenReady = !!tokens?.access_token;
  const leagueReady = tokenReady && !!userLeague;
  
  // If we don't have tokens under this user ID but we just completed OAuth,
  // check if there are any recent tokens we can use
  if (!tokenReady && req.nextUrl.searchParams.get('_checkFallback') === '1') {
    // This is a fallback check - look for any recent tokens
    try {
      const fs = require('fs');
      const path = require('path');
      const getTokenDir = () => {
        if (process.env.YAHOO_TOKEN_DIR) return process.env.YAHOO_TOKEN_DIR;
        if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task")) {
          return "/tmp/yahoo-users";
        }
        return path.join(process.cwd(), "lib", "yahoo-users");
      };
      
      const dir = getTokenDir();
      const files = fs.readdirSync(dir);
      const tokenFiles = files.filter((f: string) => f.endsWith('.json') && !f.includes('.league.'));
      
      if (tokenFiles.length > 0) {
        // Check the most recent file
        const recentFile = tokenFiles[tokenFiles.length - 1];
        const content = fs.readFileSync(path.join(dir, recentFile), "utf8");
        const recentTokens = JSON.parse(content);
        
        if (recentTokens.access_token) {
          console.log(`[Status] Found fallback tokens for OAuth completion`);
          const res = NextResponse.json({
            ok: true,
            userId,
            reason: null,
            hasClient: !!process.env.YAHOO_CLIENT_ID,
            hasSecret: !!process.env.YAHOO_CLIENT_SECRET,
            userLeague,
            leagueReady: false,
            tokenReady: true,
            redirectEnv,
            envFlags: {
              SKIP_YAHOO: process.env.SKIP_YAHOO || null,
              SKIP_YAHOO_DURING_BUILD: process.env.SKIP_YAHOO_DURING_BUILD || null,
              NEXT_PHASE: process.env.NEXT_PHASE || null,
            },
            tokenPreview: {
              access_token: recentTokens.access_token.slice(0,8) + '…',
              expires_at: recentTokens.expires_at || null,
              has_refresh: !!recentTokens.refresh_token,
            },
          });
          
          res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.headers.set('Pragma', 'no-cache');
          res.headers.set('Expires', '0');
          
          provisional.cookies.getAll().forEach(c => res.cookies.set(c));
          return res;
        }
      }
    } catch (e) {
      console.log(`[Status] Fallback token check failed:`, e);
    }
  }
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
    tokenPreview: tokens?.access_token ? {
      access_token: tokens.access_token.slice(0,8) + '…',
      expires_at: tokens.expires_at || null,
      has_refresh: !!tokens.refresh_token,
    } : null,
  });
  
  // Prevent caching
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
