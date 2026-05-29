// POST /api/espn/relay-creds
// Receives ESPN credentials captured by the no-install bookmarklet running on
// fantasy.espn.com (the ONESITE token / SWID it can read from the page). Storing
// the keys — not just relayed data — lets the server refresh them on its own, so
// the league keeps working on the user's phone without re-running the bookmarklet.
//
// Auth is the signed relay token (same as /api/espn/relay), so this is reachable
// cross-origin from espn.com. The "/api/espn/relay(.*)" public matcher covers it.

import { NextRequest, NextResponse } from "next/server";
import {
  readEspnConnections,
  addEspnConnection,
  updateEspnConnectionCreds,
} from "@/lib/tokenStore/index";
import { verifyRelayToken } from "@/lib/relayAuth";

export const dynamic = "force-dynamic";

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
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const leagueId = String(body.leagueId ?? "").trim();
  const season = Number(body.season) || new Date().getFullYear();
  const espnToken = String(body.espnToken ?? "").trim() || undefined;
  const swid = String(body.swid ?? "").trim() || undefined;
  const espnS2 = String(body.espnS2 ?? "").trim() || undefined;
  const leagueName = String(body.leagueName ?? "").trim() || undefined;

  if (!leagueId) return json({ ok: false, error: "missing_league_id" }, 400);
  if (!/^[a-zA-Z0-9_.-]+$/.test(leagueId)) return json({ ok: false, error: "invalid_league_id" }, 400);
  if (!espnToken && !swid && !espnS2) return json({ ok: false, error: "no_credentials" }, 400);

  const conns = await readEspnConnections(userId);
  const existing = conns.find((c) => c.leagueId === leagueId);

  if (existing) {
    // Merge fresh keys into the existing connection (preserves leagueName/relay).
    await updateEspnConnectionCreds(userId, leagueId, { espnS2, swid, espnToken });
  } else {
    // One-click connect: the bookmarklet found a league we don't have yet.
    await addEspnConnection(userId, {
      leagueId,
      season,
      leagueName,
      espnS2,
      swid,
      espnToken,
      relay: true,
    });
  }

  return json({ ok: true, stored: { espnToken: !!espnToken, swid: !!swid, espnS2: !!espnS2 } });
}
