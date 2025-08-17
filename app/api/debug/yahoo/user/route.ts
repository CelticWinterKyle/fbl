import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { readUserLeague } from "@/lib/userLeagueStore";
import { readUserTokens } from "@/lib/userTokenStore";

export const dynamic = "force-dynamic";

async function makeDirectYahooRequest(accessToken: string, path: string) {
  const baseUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
  const url = `${baseUrl}/${path}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FamilyBizFootball/1.0)'
    }
  });

  const responseData = {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: null as any
  };

  try {
    if (response.ok) {
      responseData.body = await response.json();
    } else {
      responseData.body = await response.text();
    }
  } catch (e) {
    responseData.body = 'Unable to parse response';
  }

  return responseData;
}

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    
    const debug = {
      timestamp: new Date().toISOString(),
      userId,
      userLeague: readUserLeague(userId),
      tokens: (() => {
        const tokens = readUserTokens(userId);
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
          const authResult = await getYahooAuthedForUser(userId);
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
      apiTests: await (async () => {
        try {
          const authResult = await getYahooAuthedForUser(userId);
          if (!authResult.yf || !authResult.access) {
            return { skipped: true, reason: 'No auth available' };
          }
          
          const tests = [
            'user?format=json',
            'users;use_login=1?format=json',
            'users;use_login=1/games?format=json',
            'users;use_login=1/games;game_codes=nfl?format=json',
            'users;use_login=1/games;game_codes=nfl/leagues?format=json',
            'users;use_login=1/games/leagues?format=json'
          ];
          
          const results: Record<string, any> = {};
          
          for (const test of tests) {
            try {
              console.log(`Testing endpoint: ${test}`);
              const result = await makeDirectYahooRequest(authResult.access, test);
              results[test] = {
                success: result.status === 200,
                status: result.status,
                statusText: result.statusText,
                bodyKeys: typeof result.body === 'object' && result.body ? Object.keys(result.body) : [],
                bodySize: JSON.stringify(result.body || {}).length,
                // Include actual data for leagues endpoints to help debug
                sampleData: test.includes('leagues') && result.status === 200 ? result.body : undefined
              };
            } catch (e) {
              results[test] = {
                success: false,
                error: String(e)
              };
            }
          }
          
          return results;
        } catch (error) {
          return {
            success: false,
            error: String(error)
          };
        }
      })()
    };

    const res = NextResponse.json(debug, { 
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
    
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
