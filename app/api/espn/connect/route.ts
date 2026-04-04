import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import {
  saveEspnConnection,
  clearEspnConnection,
} from "@/lib/tokenStore/index";
import { validateEspnLeague, exchangeEspnOneSiteToken, currentNflSeason } from "@/lib/adapters/espn";

export const dynamic = "force-dynamic";

/** POST /api/espn/connect — validate league ID + save connection */
export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
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

  // If user has the new ESPN-ONESITE token but not legacy creds, try to exchange it
  let resolvedS2 = espnS2;
  let resolvedSwid = swid;
  if ((!espnS2 || !swid) && espnToken) {
    const exchanged = await exchangeEspnOneSiteToken(espnToken);
    if (exchanged?.espnS2) resolvedS2 = exchanged.espnS2;
    if (exchanged?.swid) resolvedSwid = exchanged.swid;
  }

  try {
    const info = await validateEspnLeague(leagueId, season, {
      espnS2: resolvedS2,
      swid: resolvedSwid,
      espnToken,
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
    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  } catch (e: any) {
    const msg: string = e?.message || String(e);
    const isPrivate = msg.toLowerCase().includes("private");
    return NextResponse.json(
      {
        ok: false,
        error: isPrivate ? "private_league" : "validation_failed",
        message: msg,
      },
      { status: isPrivate ? 403 : 502 }
    );
  }
}

/** DELETE /api/espn/connect — disconnect ESPN */
export async function DELETE(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  await clearEspnConnection(userId);
  return NextResponse.json({ ok: true });
}
