export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ConnectHub from './ConnectHub';
import {
  readUserTokens,
  readUserLeagues,
  readSleeperConnection,
  readSleeperLeagues,
  readEspnConnection,
  readMyTeam,
} from '@/lib/tokenStore/index';

export default async function ConnectPage({
  searchParams,
}: {
  searchParams?: { espnS2?: string; swid?: string; espnToken?: string; leagueId?: string; auth?: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const espnAutoConnect = {
    espnS2:    searchParams?.espnS2    ?? null,
    swid:      searchParams?.swid      ?? null,
    espnToken: searchParams?.espnToken ?? null,
    leagueId:  searchParams?.leagueId  ?? null,
  };

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
  const [yahooLeagueData, sleeperLeagueData] = await Promise.all([
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
      leagues: yahooLeagueData,
    },
    sleeper: {
      connected: !!sleeperConn,
      username: sleeperConn?.username ?? null,
      sleeperId: sleeperConn?.sleeperId ?? null,
      leagues: sleeperLeagueData,
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

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <PageHeader />
        <ConnectHub connections={connections} espnAutoConnect={espnAutoConnect} />
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl tracking-[0.1em] text-white">CONNECT YOUR LEAGUES</h1>
      <p className="text-gray-500 mt-2 font-ui">
        Link your Yahoo, Sleeper, and ESPN fantasy leagues. We&apos;ll pull everything into one dashboard.
      </p>
    </div>
  );
}
