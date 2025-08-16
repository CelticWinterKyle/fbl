import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { saveUserLeague } from "@/lib/userLeagueStore";

export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const league_key = body.league_key || body.leagueKey;
  if (!league_key || typeof league_key !== 'string') {
    return NextResponse.json({ ok:false, error: 'missing_league_key' }, { status:400 });
  }
  saveUserLeague(userId, league_key);
  const res = NextResponse.json({ ok:true, league_key });
  provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
  return res;
}
