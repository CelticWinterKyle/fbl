import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";

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

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

export async function GET(req: NextRequest) {
  if (process.env.DEBUG_ROUTES !== '1') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    
    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!yf || !access) {
      return NextResponse.json({
        error: 'Authentication required',
        reason
      }, { status: 401 });
    }

    // Get the raw data from Yahoo
    const rawData = await makeDirectYahooRequest(access, 'users;use_login=1/games;game_codes=nfl/leagues?format=json');
    
    const res = NextResponse.json({
      success: true,
      rawData,
      // Also include a simplified view of the structure
      structure: {
        fantasy_content: rawData.fantasy_content ? {
          keys: Object.keys(rawData.fantasy_content),
          users: rawData.fantasy_content.users ? `Array with ${rawData.fantasy_content.users.length} items` : null,
          user: rawData.fantasy_content.users?.[0]?.user ? 
            (Array.isArray(rawData.fantasy_content.users[0].user) ? 
              `Array with ${rawData.fantasy_content.users[0].user.length} items` : 
              'Object') : null
        } : null
      }
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    return res;
    
  } catch (error) {
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}
