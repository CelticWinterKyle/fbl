import { NextRequest, NextResponse } from "next/server";
import { getYahooAuthed } from "@/lib/yahoo";
import { readTokens } from "@/lib/tokenStore";
import { validateYahooEnvironment } from "@/lib/envCheck";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const debug = {
    timestamp: new Date().toISOString(),
    environment: validateYahooEnvironment(),
    tokens: (() => {
      const tokens = readTokens();
      return {
        hasAccessToken: !!tokens?.access_token,
        hasRefreshToken: !!tokens?.refresh_token,
        accessTokenPreview: tokens?.access_token ? 
          tokens.access_token.substring(0, 8) + '...' + tokens.access_token.substring(-4) : null,
        expiresAt: tokens?.expires_at,
        isExpired: tokens?.expires_at ? Date.now() > tokens.expires_at : null,
        timeToExpiry: tokens?.expires_at ? tokens.expires_at - Date.now() : null
      };
    })(),
    auth: await (async () => {
      try {
        const authResult = await getYahooAuthed();
        return {
          success: !!authResult.yf,
          reason: authResult.reason,
          hasYfInstance: !!authResult.yf,
          hasAccessToken: !!authResult.access
        };
      } catch (error) {
        return {
          success: false,
          error: String(error)
        };
      }
    })(),
    apiTest: await (async () => {
      try {
        const authResult = await getYahooAuthed();
        if (!authResult.yf) {
          return { skipped: true, reason: 'No auth available' };
        }
        
        const userInfo = await authResult.yf.api('user?format=json');
        return {
          success: true,
          userExists: !!userInfo,
          userKeys: userInfo ? Object.keys(userInfo) : []
        };
      } catch (error) {
        return {
          success: false,
          error: String(error)
        };
      }
    })()
  };

  return NextResponse.json(debug, { 
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
}
