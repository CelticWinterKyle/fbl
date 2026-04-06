import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  addEspnConnection,
  removeEspnConnection,
} from "@/lib/tokenStore/index";
import { validateEspnLeague, exchangeEspnOneSiteToken, currentNflSeason } from "@/lib/adapters/espn";

export const dynamic = "force-dynamic";

/** POST /api/espn/connect — validate league ID + add to connections array */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leagueId: string | undefined = String(body.leagueId ?? "").trim() || undefined;
  const espnS2: string | undefined = String(body.espnS2 ?? "").trim() || undefined;
  const swid: string | undefined = String(body.swid ?? "").trim() || undefined;
  const espnToken: string | undefined = String(body.espnToken ?? "").trim() || undefined;
  const seasonParam: number | undefined = body.season ? Number(body.season) : undefined;

  if (!leagueId) return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });

  const season = seasonParam ?? currentNflSeason();

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

    await addEspnConnection(userId, {
      leagueId: info.id,
      season: info.season,
      leagueName: info.name,
      espnS2: resolvedS2,
      swid: resolvedSwid,
      espnToken,
    });

    return NextResponse.json({ ok: true, leagueId: info.id, leagueName: info.name, season: info.season });
  } catch (e: any) {
    const msg: string = e?.message || String(e);
    const isPrivate = msg.toLowerCase().includes("private");

    if (isPrivate) {
      await addEspnConnection(userId, {
        leagueId,
        season,
        espnS2: resolvedS2,
        swid: resolvedSwid,
        espnToken,
        relay: true,
      });
      return NextResponse.json({ ok: true, leagueId, leagueName: null, season, relay: true });
    }

    return NextResponse.json(
      { ok: false, error: "validation_failed", message: msg, _debug: exchangeDebug },
      { status: 502 }
    );
  }
}

/** DELETE /api/espn/connect — remove a specific ESPN league (or all) */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leagueId: string | undefined = String(body.leagueId ?? "").trim() || undefined;

  if (!leagueId) return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });

  await removeEspnConnection(userId, leagueId);
  return NextResponse.json({ ok: true });
}
