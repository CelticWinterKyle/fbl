import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { teamKey: string } }) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'no_user_id' }, { status: 400 });
  }

  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    return NextResponse.json({ ok: false, error: 'yahoo_auth_failed', reason }, { status: 401 });
  }

  const teamKey = params.teamKey;
  if (!teamKey) {
    return NextResponse.json({ ok: false, error: 'missing_team_key' }, { status: 400 });
  }

  try {
    console.log(`[Roster] Fetching roster for team: ${teamKey}`);
    
    // Fetch team roster from Yahoo
    const rosterRaw = await yf.team.roster(teamKey, { week: 1 }).catch((e: any) => {
      console.error('[Roster] Error fetching roster:', e?.message || e);
      return null;
    });

    if (!rosterRaw) {
      return NextResponse.json({ 
        ok: false, 
        error: 'roster_fetch_failed',
        roster: []
      });
    }

    // Process roster data
    const playersRaw = rosterRaw?.team?.[0]?.roster?.[0]?.players || rosterRaw?.players || [];
    
    const roster = playersRaw.map((p: any) => {
      const player = p.player?.[0] || p;
      const position = player?.selected_position?.[0]?.position || player?.position || 'BN';
      const name = player?.name?.full || player?.full_name || 'Unknown Player';
      const team = player?.editorial_team_abbr || '';
      const points = Number(player?.player_points?.total || 0);
      
      return {
        name,
        position,
        team,
        points
      };
    });

    const res = NextResponse.json({
      ok: true,
      teamKey,
      roster
    });

    // Prevent caching
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');

    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;

  } catch (error: any) {
    console.error('[Roster] Error:', error);
    return NextResponse.json({
      ok: false,
      error: 'server_error',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}
