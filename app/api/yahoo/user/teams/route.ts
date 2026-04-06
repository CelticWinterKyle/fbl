import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYahooAuthedForUser, leagueKeyFromTeamKey } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!yf || !access) {
      return NextResponse.json({ ok: false, reason }, { status: reason === "no_token" ? 401 : 400 });
    }

    // Fetch user's NFL teams via Yahoo Fantasy SDK
    const raw = await yf.user.game_teams("nfl").catch((e: any) => {
      console.error("[Teams] yf.user.game_teams failed:", e?.message || e);
      return null;
    });

    if (!raw) {
      return NextResponse.json({ ok: false, reason: "fetch_failed" }, { status: 502 });
    }

    const teamsArr: any[] = raw?.teams || raw?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.teams || [];
    const teams = teamsArr.map((t: any) => {
      const teamKey: string = t?.team_key || t?.team?.[0]?.team_key?.[0] || "";
      const name: string = t?.name || t?.team?.[0]?.name || "Unknown";
      return { team_key: teamKey, name, league_key: leagueKeyFromTeamKey(teamKey) };
    }).filter((t) => !!t.team_key);

    const derived_league_keys = [...new Set(teams.map((t) => t.league_key).filter(Boolean))] as string[];

    return NextResponse.json({ ok: true, teams, derived_league_keys });
  } catch (e: any) {
    console.error("[Teams] Route error:", e);
    return NextResponse.json({ ok: false, reason: "route_error", error: String(e) }, { status: 500 });
  }
}
