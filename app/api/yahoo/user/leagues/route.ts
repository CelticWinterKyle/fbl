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
  
  console.log('=== RAW LEAGUE DATA ===');
  console.log(JSON.stringify(data, null, 2));
  
  try {
    // Navigate the Yahoo API response structure
    const fc = data?.fantasy_content;
    console.log('fantasy_content keys:', fc ? Object.keys(fc) : 'none');
    
    if (fc?.users?.[0]?.user) {
      const user = fc.users[0].user;
      console.log('user structure:', Array.isArray(user) ? `array with ${user.length} items` : typeof user);
      
      // Yahoo API often returns arrays with nested objects like [metadata, data]
      let userData = user;
      if (Array.isArray(user) && user.length > 1) {
        userData = user[1]; // The actual data is usually in the second element
        console.log('Using user[1], keys:', userData ? Object.keys(userData) : 'none');
      }
      
      if (userData?.games) {
        console.log('games structure:', Array.isArray(userData.games) ? `array with ${userData.games.length} items` : typeof userData.games);
        
        // Handle different possible structures
        let gamesArray = userData.games;
        if (userData.games?.[0]?.game) {
          gamesArray = userData.games[0].game;
        }
        
        console.log('Processing games array:', Array.isArray(gamesArray) ? gamesArray.length : 'not array');
        
        if (Array.isArray(gamesArray)) {
          gamesArray.forEach((game: any, index: number) => {
            console.log(`Game ${index}:`, Array.isArray(game) ? `array with ${game.length} items` : typeof game);
            
            let gameData = game;
            let gameKey = null;
            
            // Handle array format [metadata, data]
            if (Array.isArray(game)) {
              gameKey = game[0]?.game_key?.[0] || game[0]?.game_key;
              gameData = game[1];
              console.log(`Game ${index} key:`, gameKey, 'data keys:', gameData ? Object.keys(gameData) : 'none');
            } else {
              gameKey = game?.game_key;
              console.log(`Game ${index} key:`, gameKey, 'keys:', game ? Object.keys(game) : 'none');
            }
            
            if (gameData?.leagues) {
              console.log(`Game ${index} leagues structure:`, Array.isArray(gameData.leagues) ? `array with ${gameData.leagues.length} items` : typeof gameData.leagues);
              
              let leaguesArray = gameData.leagues;
              if (gameData.leagues?.[0]?.league) {
                leaguesArray = gameData.leagues[0].league;
              }
              
              if (Array.isArray(leaguesArray)) {
                leaguesArray.forEach((league: any, leagueIndex: number) => {
                  console.log(`League ${leagueIndex}:`, Array.isArray(league) ? `array with ${league.length} items` : typeof league);
                  
                  let leagueKey = null;
                  let leagueName = null;
                  
                  if (Array.isArray(league)) {
                    // Handle [metadata, data] format
                    leagueKey = league[0]?.league_key?.[0] || league[0]?.league_key;
                    leagueName = league[0]?.name?.[0] || league[0]?.name;
                  } else {
                    leagueKey = league?.league_key?.[0] || league?.league_key;
                    leagueName = league?.name?.[0] || league?.name;
                  }
                  
                  console.log(`League ${leagueIndex}:`, { leagueKey, leagueName, gameKey });
                  
                  if (leagueKey && gameKey) {
                    leagues.push({
                      league_key: leagueKey,
                      name: leagueName || `League ${leagueKey}`,
                      game_key: gameKey
                    });
                  }
                });
              }
            }
          });
        }
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
