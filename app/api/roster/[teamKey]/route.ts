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

  // debug=1: raw Yahoo roster+stats sample for shape debugging (authed,
  // caller's own team only). Temporary diagnostic surface — delete once the
  // projection/opponent/kickoff enrichment gap is fixed.
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const platform = req.nextUrl.searchParams.get("platform");
    const week = req.nextUrl.searchParams.get("week");
    if (platform !== "yahoo" || !week) {
      return NextResponse.json({ ok: false, error: "debug requires platform=yahoo&week=N" }, { status: 400 });
    }
    const { getYahooAuthedForUser } = await import("@/lib/yahoo");
    const { yahooFetch } = await import("@/lib/adapters/yahoo");
    const guard = await getYahooAuthedForUser(userId);
    if (!guard.access) return NextResponse.json({ ok: false, error: guard.reason });

    const rosterResp = await yahooFetch(
      guard.access,
      `team/${params.teamKey}/roster;week=${week}/players/stats;type=week;week=${week}`
    );

    let firstPlayerKey: string | null = null;
    try {
      const j = JSON.parse(rosterResp.text);
      const playersData = j?.fantasy_content?.team?.[1]?.roster?.["0"]?.players;
      const k = Object.keys(playersData ?? {}).find((k) => k !== "count");
      firstPlayerKey = k ? playersData[k]?.player?.[0]?.[0]?.player_key ?? null : null;
    } catch {}

    let projResp: { status: number; ok: boolean; text: string } | null = null;
    if (firstPlayerKey) {
      projResp = await yahooFetch(
        guard.access,
        `players;player_keys=${encodeURIComponent(firstPlayerKey)}/stats;type=week;week=${week};is_projected=1`
      );
    }

    return NextResponse.json({
      ok: true,
      roster: { status: rosterResp.status, sample: rosterResp.text.slice(0, 4000) },
      firstPlayerKey,
      projected: projResp ? { status: projResp.status, sample: projResp.text.slice(0, 4000) } : null,
    });
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
