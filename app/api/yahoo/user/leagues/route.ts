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

function extractLeaguesFromData(data: any, showAll: boolean = false) {
  const leagues: Array<{ league_key: string; name: string; game_key: string }> = [];
  
  console.log('=== RAW LEAGUE DATA ===');
  console.log(JSON.stringify(data, null, 2));
  
  try {
    // Navigate the Yahoo API response structure
    const fc = data?.fantasy_content;
    console.log('fantasy_content keys:', fc ? Object.keys(fc) : 'none');
    
    if (fc?.users?.["0"]?.user) {
      const user = fc.users["0"].user;
      console.log('user structure:', Array.isArray(user) ? `array with ${user.length} items` : typeof user);
      
      // Yahoo API returns arrays with nested objects like [metadata, data]
      let userData = user;
      if (Array.isArray(user) && user.length > 1) {
        userData = user[1]; // The actual data is usually in the second element
        console.log('Using user[1], keys:', userData ? Object.keys(userData) : 'none');
      }
      
      if (userData?.games) {
        console.log('games structure:', userData.games);
        
        // The games structure is an object with numbered keys
        const gameKeys = Object.keys(userData.games).filter(key => key !== 'count');
        console.log('Processing game keys:', gameKeys);
        
        gameKeys.forEach((gameIndex) => {
          const gameData = userData.games[gameIndex];
          console.log(`Game ${gameIndex}:`, gameData);
          
          if (gameData?.game && Array.isArray(gameData.game)) {
            const gameInfo = gameData.game[0]; // First element has game metadata
            const gameContent = gameData.game[1]; // Second element has leagues
            
            const gameKey = gameInfo?.game_key;
            const season = gameInfo?.season;
            const isGameOver = gameInfo?.is_game_over;
            const isOffseason = gameInfo?.is_offseason;
            
            console.log(`Game ${gameIndex} info:`, { gameKey, season, isGameOver, isOffseason });
            
            // Only include current season (2025) or active games
            const currentYear = new Date().getFullYear();
            const isCurrentSeason = season === String(currentYear);
            
            console.log(`Game ${gameIndex} filter:`, { currentYear, isCurrentSeason, showAll });
            
            // Filter to only current season leagues unless showAll is true
            if (!showAll && !isCurrentSeason) {
              console.log(`Skipping game ${gameIndex} - not current season (${season} vs ${currentYear})`);
              return;
            }
            
            console.log(`Including game ${gameIndex} - ${showAll ? 'showing all' : 'current season'}`);
            
            
            if (gameContent?.leagues) {
              console.log(`Game ${gameIndex} leagues structure:`, gameContent.leagues);
              
              // Leagues structure is also an object with numbered keys
              const leagueKeys = Object.keys(gameContent.leagues).filter(key => key !== 'count');
              console.log(`Game ${gameIndex} league keys:`, leagueKeys);
              
              leagueKeys.forEach((leagueIndex) => {
                const leagueData = gameContent.leagues[leagueIndex];
                console.log(`League ${leagueIndex}:`, leagueData);
                
                if (leagueData?.league && Array.isArray(leagueData.league)) {
                  const leagueInfo = leagueData.league[0];
                  
                  const leagueKey = leagueInfo?.league_key;
                  const leagueName = leagueInfo?.name;
                  
                  console.log(`League ${leagueIndex}:`, { leagueKey, leagueName, gameKey });
                  
                  if (leagueKey && gameKey && leagueName) {
                    leagues.push({
                      league_key: leagueKey,
                      name: leagueName,
                      game_key: gameKey
                    });
                  }
                }
              });
            }
          }
        });
      }
    }
  } catch (e) {
    console.error('Error extracting leagues:', e);
  }
  
  console.log('=== EXTRACTED LEAGUES ===');
  console.log(leagues);
  return leagues;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const showAll = url.searchParams.get("all") === "1"; // Show all years if ?all=1
  
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
    
    const leagues = extractLeaguesFromData(leagueData, showAll);
    
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
