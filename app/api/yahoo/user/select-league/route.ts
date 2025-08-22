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
  
  // Save to file storage
  saveUserLeague(userId, league_key);
  
  // Also save to cookie for Vercel compatibility
  const res = NextResponse.json({ ok:true, league_key });
  res.cookies.set('fbl_league', league_key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });
  
  provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
  return res;
}
