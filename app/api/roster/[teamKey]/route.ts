import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRosterForUser } from "@/lib/rosterData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  // debug=scoreboard: raw Yahoo league.scoreboard() output (authed, caller's
  // own league only). Checking whether the team_projected_points total is
  // computed from an embedded per-player breakdown we could surface, or is
  // team-summary-only. Temporary — delete once answered.
  if (req.nextUrl.searchParams.get("debug") === "scoreboard") {
    const leagueKey = req.nextUrl.searchParams.get("leagueKey");
    const week = req.nextUrl.searchParams.get("week");
    if (!leagueKey) {
      return NextResponse.json({ ok: false, error: "debug=scoreboard requires leagueKey" }, { status: 400 });
    }
    const { getYahooAuthedForUser } = await import("@/lib/yahoo");
    const guard = await getYahooAuthedForUser(userId);
    if (!guard.yf) return NextResponse.json({ ok: false, error: guard.reason });
    const raw = await (week ? guard.yf.league.scoreboard(leagueKey, week) : guard.yf.league.scoreboard(leagueKey))
      .catch((e: any) => ({ err: e?.description ?? e?.message ?? String(e) }));
    return NextResponse.json({ ok: true, raw });
  }

  const result = await getRosterForUser(userId, {
    platform: req.nextUrl.searchParams.get("platform"),
    teamKey: params.teamKey,
    leagueKey: req.nextUrl.searchParams.get("leagueKey") ?? undefined,
    requestedWeek: req.nextUrl.searchParams.get("week"),
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }

  const res = NextResponse.json(result);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
