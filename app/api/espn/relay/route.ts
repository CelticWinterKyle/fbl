// POST /api/espn/relay
// Receives raw ESPN league JSON from the browser extension content script.
// The extension fetches this data in the browser (where private league auth works),
// then posts it here for storage and serving to the dashboard.

import { NextRequest, NextResponse } from "next/server";
import { readEspnConnection, saveEspnRelayData } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: extension passes the fbl_uid cookie value as a header
  const userId = req.headers.get("x-fbl-uid")?.trim() || null;
  if (!userId || userId.length < 8) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const leagueId: string = String(body.leagueId ?? "").trim();
  const season: number   = Number(body.season) || new Date().getFullYear();
  const data: unknown    = body.data;

  if (!leagueId || !data) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Verify this userId actually has an ESPN connection for this league
  const conn = await readEspnConnection(userId);
  if (!conn || conn.leagueId !== leagueId) {
    return NextResponse.json({ ok: false, error: "no_matching_connection" }, { status: 403 });
  }

  await saveEspnRelayData(userId, {
    leagueId,
    season,
    raw: data,
    synced: Date.now(),
  });

  return NextResponse.json({ ok: true });
}
