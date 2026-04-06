import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  readUserTokens,
  readUserLeagues,
  readSleeperConnection,
  readSleeperLeagues,
  readEspnConnections,
  readMyTeam,
} from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [yahooTokens, yahooLeagues, sleeperConn, sleeperLeagues, espnConns] =
    await Promise.all([
      readUserTokens(userId),
      readUserLeagues(userId),
      readSleeperConnection(userId),
      readSleeperLeagues(userId),
      readEspnConnections(userId),
    ]);

  // Fetch per-league myTeam for all platforms
  const [yahooMyTeams, sleeperMyTeams, espnLeagues] = await Promise.all([
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
    Promise.all(
      espnConns.map(async (c) => ({
        leagueId: c.leagueId,
        leagueName: c.leagueName ?? null,
        season: c.season,
        relay: c.relay ?? false,
        myTeam: await readMyTeam(userId, "espn", c.leagueId),
      }))
    ),
  ]);

  const connections = {
    yahoo: {
      connected: !!yahooTokens?.access_token,
      leagues: yahooMyTeams,
    },
    sleeper: {
      connected: !!sleeperConn,
      username: sleeperConn?.username ?? null,
      sleeperId: sleeperConn?.sleeperId ?? null,
      leagues: sleeperMyTeams,
    },
    espn: {
      connected: espnConns.length > 0,
      leagues: espnLeagues, // [{ leagueId, leagueName, season, relay, myTeam }]
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
