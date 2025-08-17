import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { readUserLeague } from "@/lib/userLeagueStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'no_user_session' }, { status: 401 });
    }

    const userLeague = readUserLeague(userId);
    if (!userLeague) {
      return NextResponse.json({ ok: false, error: 'no_league_selected' }, { status: 400 });
    }

    const { yf, reason } = await getYahooAuthedForUser(userId);
    if (!yf) {
      return NextResponse.json({ ok: false, error: 'yahoo_auth_failed', reason }, { status: 401 });
    }

    console.log(`[League Data] Fetching data for league: ${userLeague}`);

    // Fetch all league data in parallel
    const [scoreRaw, metaRaw, standingsRaw, settingsRaw] = await Promise.all([
      yf.league.scoreboard(userLeague).catch((e: any) => {
        console.error('[League Data] Scoreboard error:', e);
        return null;
      }),
      yf.league.meta(userLeague).catch((e: any) => {
        console.error('[League Data] Meta error:', e);
        return null;
      }),
      yf.league.standings(userLeague).catch((e: any) => {
        console.error('[League Data] Standings error:', e);
        return null;
      }),
      yf.league.settings(userLeague).catch((e: any) => {
        console.error('[League Data] Settings error:', e);
        return null;
      })
    ]);

    console.log('[League Data] Raw responses:', {
      hasScore: !!scoreRaw,
      hasMeta: !!metaRaw,
      hasStandings: !!standingsRaw,
      hasSettings: !!settingsRaw
    });

    // Process scoreboard data
    const rawMatchups = scoreRaw?.matchups ?? scoreRaw?.scoreboard?.matchups ?? scoreRaw?.schedule?.matchups ?? [];
    const matchups = rawMatchups.map((m: any) => {
      const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
      const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
      
      const getTeamKey = (t: any) => t?.team_key || t?.team?.team_key || t?.team?.key || t?.key || null;
      const getTeamName = (t: any) => t?.name || t?.team_name || t?.team?.name || "Team";
      const getTeamPoints = (t: any) => Number(t?.points ?? t?.team_points?.total ?? 0);
      
      return {
        aN: getTeamName(a),
        aP: getTeamPoints(a),
        aK: getTeamKey(a),
        bN: getTeamName(b),
        bP: getTeamPoints(b),
        bK: getTeamKey(b)
      };
    });

    // Process standings data
    let teamsSource = standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];
    if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
      // Fallback: try to get teams from league.teams
      const teamsRaw = await yf.league.teams(userLeague).catch(() => null);
      teamsSource = teamsRaw?.teams ?? teamsRaw?.league?.teams ?? [];
    }
    
    const teams = teamsSource.map((t: any) => ({
      name: t.name || t.team_name || "Team",
      wins: Number(t.team_standings?.outcome_totals?.wins || 0),
      losses: Number(t.team_standings?.outcome_totals?.losses || 0),
      ties: Number(t.team_standings?.outcome_totals?.ties || 0),
      points: Number(t.team_points?.total || 0),
      owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner"
    }));

    // Process league metadata
    const leagueMeta = {
      name: metaRaw?.name || metaRaw?.league?.name || "League",
      week: Number(metaRaw?.current_week || 1),
      season: metaRaw?.season || new Date().getFullYear(),
      numTeams: metaRaw?.num_teams || teams.length
    };

    // Process settings
    const leagueSettings = {
      scoringType: settingsRaw?.scoring_type || settingsRaw?.settings?.scoring_type || "head",
      tradeDeadline: settingsRaw?.trade_deadline || settingsRaw?.settings?.trade_deadline || null,
      rosterPositions: settingsRaw?.roster_positions || settingsRaw?.settings?.roster_positions || []
    };

    console.log('[League Data] Processed data:', {
      matchupsCount: matchups.length,
      teamsCount: teams.length,
      leagueName: leagueMeta.name,
      currentWeek: leagueMeta.week
    });

    const res = NextResponse.json({
      ok: true,
      leagueKey: userLeague,
      matchups,
      teams,
      meta: leagueMeta,
      settings: leagueSettings
    });

    // Prevent caching
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');

    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;

  } catch (error: any) {
    console.error('[League Data] Error:', error);
    return NextResponse.json({
      ok: false,
      error: 'server_error',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}
