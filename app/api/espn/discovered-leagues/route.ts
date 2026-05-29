// POST /api/espn/discovered-leagues — called by extension background worker
// GET  /api/espn/discovered-leagues — called by EspnConnectCard on mount

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readEspnDiscoveredLeagues,
  saveEspnDiscoveredLeagues,
  type EspnDiscoveredLeague,
} from "@/lib/tokenStore/index";
import { verifyRelayToken } from "@/lib/relayAuth";

export const dynamic = "force-dynamic";

/** POST — extension reports auto-detected leagues (auth via signed relay token) */
export async function POST(req: NextRequest) {
  const userId = verifyRelayToken(req.headers.get("x-fbl-relay-token"));
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const leagues: EspnDiscoveredLeague[] = Array.isArray(body.leagues)
    ? body.leagues
        .filter((l: any) => l?.leagueId && l?.season)
        .map((l: any) => ({
          leagueId: String(l.leagueId),
          season: Number(l.season),
          name: l?.name ? String(l.name) : undefined,
        }))
    : [];

  if (leagues.length === 0) {
    return NextResponse.json({ ok: false, error: "no_leagues" }, { status: 400 });
  }

  // Merge with existing (keep prior finds; fill in names as they arrive)
  const existing = await readEspnDiscoveredLeagues(userId);
  const merged = [...existing];
  for (const league of leagues) {
    const found = merged.find((e) => e.leagueId === league.leagueId);
    if (!found) merged.push(league);
    else if (league.name && !found.name) found.name = league.name;
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
