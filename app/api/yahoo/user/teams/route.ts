import { NextResponse, NextRequest } from "next/server";
import { getUserTeams } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// No direct REST fetch needed; rely solely on SDK user.teams('nfl') which uses users;use_login=1

export async function GET(req: NextRequest) {
  const { userId, created } = getOrCreateUserId(req);
  const url = new URL(req.url);
  const gameParam = url.searchParams.get('game') || 'nfl'; // but we always pass 'nfl'
  const result = await getUserTeams('nfl');
  if (!result.ok) {
    const res = NextResponse.json({ ok: false, reason: result.reason });
    if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
    return res;
  }
  const res = NextResponse.json({
    ok: true,
    game_key: 'nfl',
    team_count: result.team_count,
    teams: result.teams,
    derived_league_keys: result.derived_league_keys,
    debug: {
      requested_game: gameParam,
      sdk_call: 'user.teams(\'nfl\')',
      path_hint: '/users;use_login=1/teams'
    }
  });
  if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
  return res;
}
