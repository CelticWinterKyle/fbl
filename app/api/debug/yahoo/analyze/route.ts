import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
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
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    
    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!yf || !access) {
      return NextResponse.json({
        error: 'Authentication required',
        reason
      }, { status: 401 });
    }

    // Try multiple approaches to find leagues
    const tests = [
      'users;use_login=1/games?format=json',
      'users;use_login=1/games;game_codes=nfl?format=json', 
      'users;use_login=1/games;game_codes=nfl/leagues?format=json',
      'users;use_login=1/games/leagues?format=json',
      'users;use_login=1/teams?format=json'
    ];
    
    const results: any = {};
    
    for (const path of tests) {
      try {
        console.log(`=== TESTING: ${path} ===`);
        const data = await makeDirectYahooRequest(access, path);
        
        // Extract useful info
        const analysis = {
          success: true,
          dataSize: JSON.stringify(data).length,
          hasFantasyContent: !!data.fantasy_content,
          structure: analyzeStructure(data)
        };
        
        results[path] = analysis;
        console.log(`Success for ${path}:`, analysis);
        
      } catch (error) {
        results[path] = {
          success: false,
          error: String(error)
        };
        console.log(`Failed for ${path}:`, error);
      }
    }
    
    const res = NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tests: results
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
    
  } catch (error) {
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

function analyzeStructure(data: any, path = '', maxDepth = 3): any {
  if (maxDepth <= 0) return '...';
  
  if (Array.isArray(data)) {
    return {
      type: 'array',
      length: data.length,
      firstItem: data.length > 0 ? analyzeStructure(data[0], `${path}[0]`, maxDepth - 1) : null
    };
  }
  
  if (data && typeof data === 'object') {
    const keys = Object.keys(data);
    const result: any = {
      type: 'object',
      keys: keys.slice(0, 10) // Limit to first 10 keys
    };
    
    // Look for interesting keys
    const interestingKeys = ['games', 'leagues', 'teams', 'user', 'game_key', 'league_key', 'name'];
    for (const key of interestingKeys) {
      if (keys.includes(key)) {
        result[key] = analyzeStructure(data[key], `${path}.${key}`, maxDepth - 1);
      }
    }
    
    return result;
  }
  
  return {
    type: typeof data,
    value: typeof data === 'string' && data.length > 50 ? data.substring(0, 50) + '...' : data
  };
}
