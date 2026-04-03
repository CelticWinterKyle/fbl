import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { readUserLeague } from "@/lib/tokenStore/index";
import { fetchLeagueData } from "@/lib/adapters/yahoo";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);

    if (!userId) {
      return NextResponse.json({ ok: false, error: "no_user_session" }, { status: 401 });
    }

    const userLeague = await readUserLeague(userId);
    if (!userLeague) {
      return NextResponse.json({ ok: false, error: "no_league_selected" }, { status: 400 });
    }

    const { yf, reason } = await getYahooAuthedForUser(userId);
    if (!yf) {
      return NextResponse.json({ ok: false, error: "yahoo_auth_failed", reason }, { status: 401 });
    }

    const data = await withCache(
      `league:yahoo:${userLeague}`,
      TTL.STANDINGS,
      () => fetchLeagueData(yf, userLeague)
    );

    const res = NextResponse.json({
      ok: true,
      leagueKey: userLeague,
      matchups: data.matchups,
      teams: data.teams,
      meta: data.meta,
      settings: data.settings,
      rosterPositions: data.rosterPositions,
    });

    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  } catch (error: any) {
    console.error("[League Data] Error:", error);
    return NextResponse.json(
      { ok: false, error: "server_error", message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
