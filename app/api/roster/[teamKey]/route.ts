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

    // Flatten a Yahoo player array-of-objects the same way parseRosterJson does,
    // so the debug output shows the exact flat keys the adapter would see.
    const flatten = (playerArray: any[]): any => {
      const pd: any = {};
      (playerArray || []).forEach((item: any) => {
        if (Array.isArray(item)) {
          item.forEach((sub: any) => { if (sub && typeof sub === "object") Object.assign(pd, sub); });
        } else if (item && typeof item === "object") {
          Object.assign(pd, item);
        }
      });
      return pd;
    };

    let firstPlayerKey: string | null = null;
    let firstPlayerRaw: any = null;
    let firstPlayerFlat: any = null;
    try {
      const j = JSON.parse(rosterResp.text);
      const playersData = j?.fantasy_content?.team?.[1]?.roster?.["0"]?.players;
      const k = Object.keys(playersData ?? {}).find((kk) => kk !== "count");
      const playerArray = k ? playersData[k]?.player : null;
      if (Array.isArray(playerArray)) {
        firstPlayerRaw = playerArray;
        firstPlayerFlat = flatten(playerArray);
        firstPlayerKey = firstPlayerFlat?.player_key ?? null;
      }
    } catch (e: any) {
      firstPlayerFlat = { parseError: String(e?.message || e) };
    }

    let projFlat: any = null;
    let projRaw: any = null;
    if (firstPlayerKey) {
      const projResp = await yahooFetch(
        guard.access,
        `players;player_keys=${encodeURIComponent(firstPlayerKey)}/stats;type=week;week=${week};is_projected=1`
      );
      try {
        const pj = JSON.parse(projResp.text);
        const entries = pj?.fantasy_content?.players ?? {};
        const ek = Object.keys(entries).find((kk) => kk !== "count");
        const entryPlayer = ek ? entries[ek]?.player : null;
        if (Array.isArray(entryPlayer)) {
          projRaw = entryPlayer;
          projFlat = flatten(entryPlayer);
        } else {
          projFlat = { status: projResp.status, unexpectedShape: entryPlayer ?? entries };
        }
      } catch (e: any) {
        projFlat = { status: projResp.status, parseError: String(e?.message || e), textSample: projResp.text.slice(0, 1000) };
      }
    }

    return NextResponse.json({
      ok: true,
      rosterStatus: rosterResp.status,
      firstPlayerKey,
      firstPlayerFlat,
      firstPlayerRaw,
      projFlat,
      projRaw,
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
