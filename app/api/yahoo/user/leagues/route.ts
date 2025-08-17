import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

function extractLeaguesFromData(data: any) {
  const leagues: Array<{ league_key: string; name: string; game_key: string }> = [];
  
  try {
    // Navigate the Yahoo API response structure
    const fc = data?.fantasy_content;
    if (fc?.users?.[0]?.user?.[1]?.games?.[0]?.game) {
      const games = fc.users[0].user[1].games[0].game;
      
      games.forEach((game: any) => {
        const gameKey = game?.[0]?.game_key?.[0] || game?.game_key;
        
        if (game?.[1]?.leagues?.[0]?.league) {
          const gameLeagues = game[1].leagues[0].league;
          
          gameLeagues.forEach((league: any) => {
            const leagueKey = league?.league_key?.[0] || league?.league_key;
            const leagueName = league?.name?.[0] || league?.name || `League ${leagueKey}`;
            
            if (leagueKey && gameKey) {
              leagues.push({
                league_key: leagueKey,
                name: leagueName,
                game_key: gameKey
              });
            }
          });
        }
      });
    }
  } catch (e) {
    console.error('Error extracting leagues:', e);
  }
  
  return leagues;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    
    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!yf || !access) {
      return NextResponse.json({
        ok: false,
        reason: reason || 'not_authenticated',
        error: 'Yahoo authentication required'
      }, { status: 401 });
    }

    // Try to get user's leagues using direct API call
    const paths = [
      'users;use_login=1/games;game_codes=nfl/leagues?format=json',
      'users;use_login=1/games/leagues?format=json'
    ];
    
    let leagueData = null;
    let usedPath = '';
    
    for (const path of paths) {
      try {
        console.log(`Trying leagues endpoint: ${path}`);
        leagueData = await makeDirectYahooRequest(access, path);
        usedPath = path;
        break;
      } catch (e) {
        console.log(`Failed with ${path}:`, e);
        continue;
      }
    }
    
    if (!leagueData) {
      return NextResponse.json({
        ok: false,
        reason: 'no_league_data',
        error: 'Unable to fetch league data from Yahoo API'
      }, { status: 400 });
    }
    
    const leagues = extractLeaguesFromData(leagueData);
    
    // Group leagues by game (NFL seasons)
    const games = leagues.reduce((acc: any[], league) => {
      let game = acc.find(g => g.game_key === league.game_key);
      if (!game) {
        game = { game_key: league.game_key, leagues: [] };
        acc.push(game);
      }
      game.leagues.push({
        league_key: league.league_key,
        name: league.name,
        league_id: league.league_key.split('.l.')[1]?.split('.')[0]
      });
      return acc;
    }, []);
    
    const response = {
      ok: true,
      games,
      total_leagues: leagues.length,
      debug_info: debug ? {
        used_path: usedPath,
        raw_leagues: leagues,
        raw_data_keys: Object.keys(leagueData || {})
      } : undefined
    };
    
    const res = NextResponse.json(response);
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
    
  } catch (error) {
    console.error('Leagues route error:', error);
    return NextResponse.json({
      ok: false,
      reason: 'route_error',
      error: String(error)
    }, { status: 500 });
  }
}
