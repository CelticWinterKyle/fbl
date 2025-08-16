import { NextResponse } from "next/server";
import { getUserTeamsNFL } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const res = await getUserTeamsNFL();
  if (!res.ok) {
    return NextResponse.json(debug ? res : { ok: false, reason: res.reason }, { status: 400 });
  }
  return NextResponse.json(debug ? res : {
    ok: true,
    game_key: "nfl",
    team_count: res.teams.length,
    teams: res.teams,
    derived_league_keys: res.derived_league_keys,
  });
}
