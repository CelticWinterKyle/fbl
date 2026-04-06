export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ConnectHub from './ConnectHub';
import {
  readUserTokens,
  readUserLeague,
  readSleeperConnection,
  readSleeperLeague,
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
    espnS2:     searchParams?.espnS2     ?? null,
    swid:       searchParams?.swid       ?? null,
    espnToken:  searchParams?.espnToken  ?? null,
    leagueId:   searchParams?.leagueId  ?? null,
  };

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
