import { NextResponse, NextRequest } from "next/server";
import { getUserTeams } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ensure never cached
export const revalidate = 0;
export const fetchCache = "force-no-store";

type LeagueOut = { league_key: string };

export async function GET(req: NextRequest) {
  const { userId, created } = getOrCreateUserId(req);
  const url = new URL(req.url);
  const debugFlag = url.searchParams.get('debug') === '1';
  const teamsResult = await getUserTeams('nfl');
  if (!teamsResult.ok) {
    const res = NextResponse.json({ ok: false, reason: teamsResult.reason });
    if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
    return res;
  }
  const leagues = (teamsResult.derived_league_keys || []).map(lk => ({ league_key: lk }));
  const resPayload: any = { ok: true, game_key: 'nfl', leagues };
  if (debugFlag) {
    resPayload.debug = {
      source: 'user.teams(nfl)',
      team_count: teamsResult.team_count,
      derived_league_count: teamsResult.derived_league_keys?.length || 0,
      path_hint: '/users;use_login=1/teams'
    };
  }
  const res = NextResponse.json(resPayload);
  if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
  return res;
}
