import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";

export async function GET(req: NextRequest) {
  const response = NextResponse.json({});
  const { userId, created } = getOrCreateUserId(req, response);
  const userLeague = userId ? readUserLeague(userId) : null;
  
  return NextResponse.json({
    ok: true,
    userId,
    created,
    userLeague,
    cookieValue: req.cookies.get('fbl_uid')?.value || null
  }, { headers: response.headers });
}
