// POST /api/espn/relay
// Receives raw ESPN league JSON from the browser extension content script.

import { NextRequest, NextResponse } from "next/server";
import { readEspnConnections, saveEspnRelayData } from "@/lib/tokenStore/index";
import { verifyRelayToken } from "@/lib/relayAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = verifyRelayToken(req.headers.get("x-fbl-relay-token"));
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const leagueId: string = String(body.leagueId ?? "").trim();
  const season: number   = Number(body.season) || new Date().getFullYear();
  const data: unknown    = body.data;

  if (!leagueId || !data) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(leagueId)) {
    return NextResponse.json({ ok: false, error: "invalid_league_id" }, { status: 400 });
  }

  // Verify this userId has a connection for this league
  const conns = await readEspnConnections(userId);
  const match = conns.find((c) => c.leagueId === leagueId);
  if (!match) {
    return NextResponse.json({ ok: false, error: "no_matching_connection" }, { status: 403 });
  }

  await saveEspnRelayData(userId, { leagueId, season, raw: data, synced: Date.now() });

  return NextResponse.json({ ok: true });
}
