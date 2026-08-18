import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  addEspnConnection,
  readEspnConnections,
  removeEspnConnection,
  updateAllEspnConnectionCreds,
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
  const leagueNameInput: string | undefined = String(body.leagueName ?? "").trim() || undefined;
  const seasonParam: number | undefined = body.season ? Number(body.season) : undefined;

  if (!leagueId) return NextResponse.json({ ok: false, error: "league_id_required" }, { status: 400 });
  if (!/^[a-zA-Z0-9_.-]+$/.test(leagueId)) {
    return NextResponse.json({ ok: false, error: "invalid_league_id" }, { status: 400 });
  }

  const season = seasonParam ?? currentNflSeason();

  // Renewal support: the league may already be connected, in which case this
  // request must not lose what the stored connection knows (its display name,
  // its relay flag). The 08-18 renewal turned "Amanda's Pigskin Princess
  // Court" into "League 26252232" this way.
  const existingConns = await readEspnConnections(userId).catch(() => []);
  const existingConn = existingConns.find((c) => c.leagueId === leagueId);

  // Credentials are stored per connection, but they all belong to one ESPN
  // account. A user renewing their login clicks the extension on ONE league
  // page; without this, that league gets the fresh login and their other
  // three keep the dead one. One read-modify-write for all of them: doing it
  // per-league in parallel was a lost-update race on the connections array.
  async function spreadCredsToSiblings() {
    try {
      await updateAllEspnConnectionCreds(userId!, {
        espnS2: resolvedS2,
        swid: resolvedSwid,
        espnToken,
      });
    } catch (e) {
      console.warn("[espn/connect] cred spread failed:", (e as any)?.message);
    }
  }

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

  // The exchange collects rich debug info (booleans, key names, HTTP status;
  // no secret values) and it used to go nowhere: the private-league fallback
  // returns ok:true without it, so when the 08-18 renewal delivered a fresh
  // token and validation STILL failed, the logs were empty. Always log the
  // shape of what we received and what the exchange made of it.
  console.log(
    "[espn/connect] creds:",
    JSON.stringify({
      leagueId,
      season,
      gotS2: !!espnS2,
      gotSwid: !!swid,
      gotToken: !!espnToken,
      resolvedS2: !!resolvedS2,
      resolvedSwid: !!resolvedSwid,
      resolvedAccessToken: !!resolvedAccessToken,
      exchange: exchangeDebug ?? null,
    })
  );

  try {
    const info = await validateEspnLeague(leagueId, season, {
      espnS2: resolvedS2,
      swid: resolvedSwid,
      espnToken,
      accessToken: resolvedAccessToken,
    });

    await addEspnConnection(userId, {
      ...existingConn,
      leagueId: info.id,
      season: info.season,
      leagueName: info.name,
      // Never let a click that carried FEWER credentials erase stored ones.
      // The extension popup cannot see espn_s2 (chrome.cookies misses it
      // where page scripts do not), so a popup renewal used to overwrite the
      // s2 a bookmarklet had just delivered. Observed live 2026-08-18.
      espnS2: resolvedS2 ?? existingConn?.espnS2,
      swid: resolvedSwid ?? existingConn?.swid,
      espnToken: espnToken ?? existingConn?.espnToken,
    });

    await spreadCredsToSiblings();
    return NextResponse.json({ ok: true, leagueId: info.id, leagueName: info.name, season: info.season });
  } catch (e: any) {
    const msg: string = e?.message || String(e);
    const isPrivate = msg.toLowerCase().includes("private");

    if (isPrivate) {
      const keptName = leagueNameInput ?? existingConn?.leagueName;
      await addEspnConnection(userId, {
        ...existingConn,
        leagueId,
        season: existingConn?.season ?? season,
        leagueName: keptName,
        espnS2: resolvedS2 ?? existingConn?.espnS2,
        swid: resolvedSwid ?? existingConn?.swid,
        espnToken: espnToken ?? existingConn?.espnToken,
        relay: true,
      });
      await spreadCredsToSiblings();
      return NextResponse.json({ ok: true, leagueId, leagueName: keptName ?? null, season, relay: true });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        message: msg,
        ...(process.env.DEBUG_ROUTES === "1" ? { _debug: exchangeDebug } : {}),
      },
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
  if (!/^[a-zA-Z0-9_.-]+$/.test(leagueId)) {
    return NextResponse.json({ ok: false, error: "invalid_league_id" }, { status: 400 });
  }

  await removeEspnConnection(userId, leagueId);
  return NextResponse.json({ ok: true });
}
