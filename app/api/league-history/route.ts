// ─── GET /api/league-history?platform=&leagueKey= ─────────────────────────────
// Champions by year for one of the caller's leagues (Trophy Case). The result
// is cached globally for 7 days per league; the underlying walks (Yahoo renew
// chain, Sleeper previous_league_id chain, ESPN season probes) only run on a
// cold cache.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCachedLeagueHistory } from "@/lib/leagueHistory";
import { readEspnConnections } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const platform = req.nextUrl.searchParams.get("platform") ?? "";
  const leagueKey = (req.nextUrl.searchParams.get("leagueKey") ?? "").slice(0, 64);
  if (!PLATFORMS.has(platform) || !leagueKey) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    let espnCreds;
    if (platform === "espn") {
      const conns = await readEspnConnections(userId);
      const conn = conns.find((c) => c.leagueId === leagueKey);
      if (!conn) {
        return NextResponse.json({ ok: false, error: "not_connected" }, { status: 403 });
      }
      espnCreds = { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken };
    }

    const history = await getCachedLeagueHistory(platform as "yahoo" | "sleeper" | "espn", leagueKey, {
      userId,
      espnCreds,
    });
    const res = NextResponse.json({ ok: true, champions: history.champions });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[league-history] failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: "Couldn't load league history right now." },
      { status: 502 }
    );
  }
}
