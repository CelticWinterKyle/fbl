import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readUserTokens,
  readUserLeagues,
  readSleeperConnection,
  readSleeperLeagues,
  readEspnConnection,
  readMyTeam,
} from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [yahooTokens, yahooLeagues, sleeperConn, sleeperLeagues, espnConn, espnMyTeam] =
    await Promise.all([
      readUserTokens(userId),
      readUserLeagues(userId),
      readSleeperConnection(userId),
      readSleeperLeagues(userId),
      readEspnConnection(userId),
      readMyTeam(userId, "espn"),
    ]);

  // Fetch per-league myTeam for Yahoo and Sleeper
  const [yahooMyTeams, sleeperMyTeams] = await Promise.all([
    Promise.all(
      yahooLeagues.map(async (lk) => ({
        leagueKey: lk,
        myTeam: await readMyTeam(userId, "yahoo", lk),
      }))
    ),
    Promise.all(
      sleeperLeagues.map(async (lid) => ({
        leagueId: lid,
        myTeam: await readMyTeam(userId, "sleeper", lid),
      }))
    ),
  ]);

  const connections = {
    yahoo: {
      connected: !!yahooTokens?.access_token,
      leagues: yahooMyTeams, // [{ leagueKey, myTeam }]
    },
    sleeper: {
      connected: !!sleeperConn,
      username: sleeperConn?.username ?? null,
      sleeperId: sleeperConn?.sleeperId ?? null,
      leagues: sleeperMyTeams, // [{ leagueId, myTeam }]
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

  return NextResponse.json({
    ok: true,
    connections,
    activePlatforms,
    hasAnyConnection: activePlatforms.length > 0,
  });
}
