// POST /api/espn/discovered-leagues — called by extension background worker
// GET  /api/espn/discovered-leagues — called by EspnConnectCard on mount

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readEspnDiscoveredLeagues,
  saveEspnDiscoveredLeagues,
  type EspnDiscoveredLeague,
} from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

/** POST — extension reports auto-detected leagues (auth via x-fbl-uid header) */
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-fbl-uid")?.trim() || null;
  if (!userId || userId.length < 8) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const leagues: EspnDiscoveredLeague[] = Array.isArray(body.leagues)
    ? body.leagues
        .filter((l: any) => l?.leagueId && l?.season)
        .map((l: any) => ({ leagueId: String(l.leagueId), season: Number(l.season) }))
    : [];

  if (leagues.length === 0) {
    return NextResponse.json({ ok: false, error: "no_leagues" }, { status: 400 });
  }

  // Merge with existing (don't remove leagues found before, just add new)
  const existing = await readEspnDiscoveredLeagues(userId);
  const merged = [...existing];
  for (const league of leagues) {
    if (!merged.some((e) => e.leagueId === league.leagueId)) {
      merged.push(league);
    }
  }
  await saveEspnDiscoveredLeagues(userId, merged);

  return NextResponse.json({ ok: true, count: merged.length });
}

/** GET — connect page fetches discovered leagues to show as "Add" options */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const leagues = await readEspnDiscoveredLeagues(userId);
  return NextResponse.json({ ok: true, leagues });
}
