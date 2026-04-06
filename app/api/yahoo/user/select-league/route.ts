import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { saveUserLeague } from "@/lib/tokenStore/index";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const league_key = body.league_key || body.leagueKey;
  if (!league_key || typeof league_key !== "string") {
    return NextResponse.json({ ok: false, error: "missing_league_key" }, { status: 400 });
  }

  await saveUserLeague(userId, league_key);
  return NextResponse.json({ ok: true, league_key });
}
