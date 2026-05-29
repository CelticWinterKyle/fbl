// POST /api/espn/relay
// Receives raw ESPN league JSON from the browser extension content script OR the
// no-install bookmarklet running on fantasy.espn.com.

import { NextRequest, NextResponse } from "next/server";
import { readEspnConnections, saveEspnRelayData } from "@/lib/tokenStore/index";
import { verifyRelayToken } from "@/lib/relayAuth";

export const dynamic = "force-dynamic";

// The bookmarklet posts cross-origin from espn.com. Auth is the signed relay
// token (not cookies), so a wildcard origin is safe — there are no credentials.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-fbl-relay-token",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const userId = verifyRelayToken(req.headers.get("x-fbl-relay-token"));
  if (!userId) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const leagueId: string = String(body.leagueId ?? "").trim();
  const season: number   = Number(body.season) || new Date().getFullYear();
  const data: unknown    = body.data;

  if (!leagueId || !data) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(leagueId)) {
    return json({ ok: false, error: "invalid_league_id" }, 400);
  }

  // Verify this userId has a connection for this league
  const conns = await readEspnConnections(userId);
  const match = conns.find((c) => c.leagueId === leagueId);
  if (!match) {
    return json({ ok: false, error: "no_matching_connection" }, 403);
  }

  await saveEspnRelayData(userId, { leagueId, season, raw: data, synced: Date.now() });

  return json({ ok: true });
}
