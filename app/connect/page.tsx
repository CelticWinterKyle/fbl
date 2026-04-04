export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { cookies } from 'next/headers';
import ConnectHub from './ConnectHub';
import {
  readUserTokens,
  readUserLeague,
  readSleeperConnection,
  readSleeperLeague,
  readEspnConnection,
  readMyTeam,
} from '@/lib/tokenStore/index';

/** Derive the userId from the fbl_uid cookie (same cookie set by getOrCreateUserId). */
function getUserIdFromCookies(): string | null {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get('fbl_uid')?.value;
    if (!raw || raw.length < 8) return null;
    return raw;
  } catch {
    return null;
  }
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams?: { espnS2?: string; swid?: string; leagueId?: string };
}) {
  const userId = getUserIdFromCookies();
  const espnAutoConnect = {
    espnS2:   searchParams?.espnS2   ?? null,
    swid:     searchParams?.swid     ?? null,
    leagueId: searchParams?.leagueId ?? null,
  };

  // Default state — will be accurate once userId is resolved client-side on first visit
  const defaultConnections = {
    yahoo: { connected: false, selectedLeague: null, myTeam: null },
    sleeper: { connected: false, username: null, sleeperId: null, selectedLeague: null, myTeam: null },
    espn: { connected: false, leagueId: null, leagueName: null, season: null, myTeam: null },
  };

  if (!userId) {
    return (
      <div className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <PageHeader />
          <ConnectHub connections={defaultConnections} espnAutoConnect={espnAutoConnect} />
        </div>
      </div>
    );
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
