import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readUserTokens,
  readUserLeague,
  readSleeperConnection,
  readSleeperLeague,
  readEspnConnection,
  readMyTeam,
} from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/connections
 *
 * Returns which platforms the user has connected and what leagues they've selected.
 * Used by the connect page and the dashboard to decide what to show.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [yahooTokens, yahooLeague, yahooMyTeam, sleeperConn, sleeperLeague, sleeperMyTeam, espnConn, espnMyTeam] =
    await Promise.all([
      readUserTokens(userId),
      readUserLeague(userId),
      readMyTeam(userId, "yahoo"),
      readSleeperConnection(userId),
      readSleeperLeague(userId),
      readMyTeam(userId, "sleeper"),
      readEspnConnection(userId),
      readMyTeam(userId, "espn"),
    ]);

  const connections = {
    yahoo: {
      connected: !!yahooTokens?.access_token,
      selectedLeague: yahooLeague ?? null,
      myTeam: yahooMyTeam ?? null,
    },
    sleeper: {
      connected: !!sleeperConn,
      username: sleeperConn?.username ?? null,
      sleeperId: sleeperConn?.sleeperId ?? null,
      selectedLeague: sleeperLeague ?? null,
      myTeam: sleeperMyTeam ?? null,
    },
    espn: {
      connected: !!espnConn,
      leagueId: espnConn?.leagueId ?? null,
      leagueName: espnConn?.leagueName ?? null,
      season: espnConn?.season ?? null,
      relay: espnConn?.relay ?? false,
      myTeam: espnMyTeam ?? null,
    },
  };

  const activePlatforms = Object.entries(connections)
    .filter(([, v]) => v.connected)
    .map(([k]) => k);

  const res = NextResponse.json({
    ok: true,
    connections,
    activePlatforms,
    hasAnyConnection: activePlatforms.length > 0,
  });
  return res;
}
