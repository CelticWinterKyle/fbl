import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  saveEspnConnection,
  clearEspnConnection,
} from "@/lib/tokenStore/index";
import { validateEspnLeague, exchangeEspnOneSiteToken, currentNflSeason } from "@/lib/adapters/espn";

export const dynamic = "force-dynamic";

/** POST /api/espn/connect — validate league ID + save connection */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const leagueId: string | undefined = String(body.leagueId ?? "").trim() || undefined;
  const espnS2: string | undefined = String(body.espnS2 ?? "").trim() || undefined;
  const swid: string | undefined = String(body.swid ?? "").trim() || undefined;
  const espnToken: string | undefined = String(body.espnToken ?? "").trim() || undefined;
  const seasonParam: number | undefined = body.season ? Number(body.season) : undefined;

  if (!leagueId) {
    return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });
  }

  const season = seasonParam ?? currentNflSeason();

  // If user has the new ESPN-ONESITE token, decode it to extract swid + access_token
  // and optionally exchange refresh_token with Disney for legacy espn_s2.
  let resolvedS2 = espnS2;
  let resolvedSwid = swid;
  let resolvedAccessToken: string | undefined;
  let exchangeDebug: Record<string, unknown> | undefined;
  if (espnToken) {
    const exchanged = await exchangeEspnOneSiteToken(espnToken);
    exchangeDebug = exchanged?._debug;
    if (exchanged?.espnS2) resolvedS2 = exchanged.espnS2;
    if (exchanged?.swid && !resolvedSwid) resolvedSwid = exchanged.swid;
    if (exchanged?.accessToken) resolvedAccessToken = exchanged.accessToken;
  }

  try {
    const info = await validateEspnLeague(leagueId, season, {
      espnS2: resolvedS2,
      swid: resolvedSwid,
      espnToken,
      accessToken: resolvedAccessToken,
    });

    await saveEspnConnection(userId, {
      leagueId: info.id,
      season: info.season,
      leagueName: info.name,
      espnS2: resolvedS2,
      swid: resolvedSwid,
      espnToken,
    });

    const res = NextResponse.json({
      ok: true,
      leagueId: info.id,
      leagueName: info.name,
      season: info.season,
    });
    return res;
  } catch (e: any) {
    const msg: string = e?.message || String(e);
    const isPrivate = msg.toLowerCase().includes("private");

    if (isPrivate) {
      // Save partial connection so the browser extension relay can work.
      // The extension fetches ESPN data directly in the browser (where auth always works)
      // and POSTs to /api/espn/relay — we need this connection stored to accept that data.
      await saveEspnConnection(userId, {
        leagueId,
        season,
        espnS2: resolvedS2,
        swid: resolvedSwid,
        espnToken,
        relay: true,
      });

      const res = NextResponse.json({ ok: true, leagueId, leagueName: null, season, relay: true });
      return res;
    }

    return NextResponse.json(
      { ok: false, error: "validation_failed", message: msg, _debug: exchangeDebug },
      { status: 502 }
    );
  }
}

/** DELETE /api/espn/connect — disconnect ESPN */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await clearEspnConnection(userId);
  return NextResponse.json({ ok: true });
}
