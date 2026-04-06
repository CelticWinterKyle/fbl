import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

  try {
    const fc = data?.fantasy_content;

    if (fc?.users?.["0"]?.user) {
      const user = fc.users["0"].user;

      let userData = user;
      if (Array.isArray(user) && user.length > 1) {
        userData = user[1];
      }

      if (userData?.games) {
        const gameKeys = Object.keys(userData.games).filter(key => key !== 'count');

        gameKeys.forEach((gameIndex) => {
          const gameData = userData.games[gameIndex];

          if (gameData?.game && Array.isArray(gameData.game)) {
            const gameInfo = gameData.game[0];
            const gameContent = gameData.game[1];

            const gameKey = gameInfo?.game_key;
            const season = gameInfo?.season;

            const currentYear = new Date().getFullYear();
            const isRecentSeason = season === String(currentYear) || season === String(currentYear - 1);

            if (!showAll && !isRecentSeason) return;

            if (gameContent?.leagues) {
              const leagueKeys = Object.keys(gameContent.leagues).filter(key => key !== 'count');

              leagueKeys.forEach((leagueIndex) => {
                const leagueData = gameContent.leagues[leagueIndex];

                if (leagueData?.league && Array.isArray(leagueData.league)) {
                  const leagueInfo = leagueData.league[0];
                  const leagueKey = leagueInfo?.league_key;
                  const leagueName = leagueInfo?.name;

                  if (leagueKey && gameKey && leagueName) {
                    leagues.push({ league_key: leagueKey, name: leagueName, game_key: gameKey });
                  }
                }
              });
            }
          }
        });
      }
    }
  } catch (e) {
    console.error('[Yahoo leagues] extraction error:', e);
  }

  return leagues;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const showAll = url.searchParams.get("all") === "1";

  try {
    const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!yf || !access) {
      return NextResponse.json({
        ok: false,
        reason: reason || 'not_authenticated',
        error: 'Yahoo authentication required',
      }, { status: 401 });
    }

    const paths = [
      'users;use_login=1/games;game_codes=nfl/leagues?format=json',
      'users;use_login=1/games/leagues?format=json'
    ];

    let leagueData = null;
    let usedPath = '';

    for (const path of paths) {
      try {
        leagueData = await makeDirectYahooRequest(access, path);
        usedPath = path;
        break;
      } catch (e) {
        console.error(`[Yahoo leagues] failed path ${path}:`, (e as any)?.message);
        continue;
      }
    }

    if (!leagueData) {
      return NextResponse.json({ ok: false, reason: 'no_league_data', error: 'Unable to fetch leagues from Yahoo' }, { status: 400 });
    }

    const leagues = extractLeaguesFromData(leagueData, showAll);

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
      debug_info: debug ? { used_path: usedPath, raw_leagues: leagues } : undefined
    };

    const res = NextResponse.json(response);
    return res;

  } catch (error) {
    console.error('[Yahoo leagues] route error:', error);
    return NextResponse.json({ ok: false, reason: 'route_error', error: String(error) }, { status: 500 });
  }
}
