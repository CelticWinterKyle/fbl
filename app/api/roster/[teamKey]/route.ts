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
    return NextResponse.json({ ok: false, reason: 'no_user_id' }, { status: 400 });
  }

  const { yf, reason: authReason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    return NextResponse.json({ ok: false, reason: 'yahoo_auth_failed', authReason }, { status: 401 });
  }

  const teamKey = params.teamKey;
  if (!teamKey) {
    return NextResponse.json({ ok: false, reason: 'missing_team_key' }, { status: 400 });
  }

  try {
    const debug = req.nextUrl.searchParams.get('debug') === '1';
  let week = req.nextUrl.searchParams.get('week');
  // week stays string for Yahoo API
  let attempts: any[] = [];
  let rosterRaw: any = null;
  let playersRaw: any[] = [];
  let roster: any[] = [];
  let reason: string | undefined = undefined;

    // Attempt 1: with week param (if present)
    if (week) {
      rosterRaw = await yf.team.roster(teamKey, { week }).catch((e: any) => {
        if (debug) console.error('[Roster] Error fetching roster (week):', e?.message || e);
        return null;
      });
      attempts.push({ attempt: 'with_week', week, ok: !!rosterRaw });
      playersRaw = rosterRaw?.team?.[0]?.roster?.[0]?.players || rosterRaw?.players || [];
      roster = Array.isArray(playersRaw) ? playersRaw.map((p: any) => {
        const player = p.player?.[0] || p;
        const position = player?.selected_position?.[0]?.position || player?.position || 'BN';
        const name = player?.name?.full || player?.full_name || 'Unknown Player';
        const team = player?.editorial_team_abbr || '';
        const points = Number(player?.player_points?.total || 0);
        return { name, position, team, points };
      }) : [];
    }

    // Attempt 2: retry without week if empty
    if (!rosterRaw || roster.length === 0) {
      rosterRaw = await yf.team.roster(teamKey).catch((e: any) => {
        if (debug) console.error('[Roster] Error fetching roster (no week):', e?.message || e);
        return null;
      });
      attempts.push({ attempt: 'no_week', ok: !!rosterRaw });
      playersRaw = rosterRaw?.team?.[0]?.roster?.[0]?.players || rosterRaw?.players || [];
      roster = Array.isArray(playersRaw) ? playersRaw.map((p: any) => {
        const player = p.player?.[0] || p;
        const position = player?.selected_position?.[0]?.position || player?.position || 'BN';
        const name = player?.name?.full || player?.full_name || 'Unknown Player';
        const team = player?.editorial_team_abbr || '';
        const points = Number(player?.player_points?.total || 0);
        return { name, position, team, points };
      }) : [];
    }

    // Reason codes
    if (!rosterRaw) {
      reason = 'roster_fetch_failed';
    } else if (roster.length === 0) {
      // Check for pre-draft status
      const draftStatus = rosterRaw?.team?.[0]?.draft_status;
      if (draftStatus && draftStatus !== 'postdraft') {
        reason = 'predraft_or_empty';
      } else {
        reason = 'empty';
      }
    }

    if (debug) {
      console.log('[Roster] debug', { teamKey, week, attempts, playerCount: roster.length, reason });
    }

    const res = NextResponse.json({
      ok: true,
      teamKey,
      roster,
      empty: roster.length === 0,
      reason
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
      reason: 'server_error',
      message: error?.message || String(error)
    }, { status: 500 });
  }
}
