'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import YahooConnectCard from '@/components/connect/YahooConnectCard';
import SleeperConnectCard from '@/components/connect/SleeperConnectCard';
import EspnConnectCard from '@/components/connect/EspnConnectCard';

interface MyTeam { teamKey: string; teamName: string; }

interface Connections {
  yahoo: { connected: boolean; leagues: { leagueKey: string; myTeam: MyTeam | null }[] };
  sleeper: { connected: boolean; username: string | null; sleeperId: string | null; leagues: { leagueId: string; myTeam: MyTeam | null }[] };
  espn: { connected: boolean; leagues: { leagueId: string; leagueName: string | null; season: number; relay: boolean; myTeam: MyTeam | null }[] };
}

interface EspnAutoConnect {
  espnS2: string | null;
  swid: string | null;
  espnToken: string | null;
  leagueId: string | null;
}

interface Props {
  connections: Connections;
  espnAutoConnect?: EspnAutoConnect;
}

type AuthBanner = {
  tone: 'amber' | 'red';
  message: string;
  /** Subtle technical suffix, e.g. the OAuth failure reason code. */
  reason?: string;
};

export default function ConnectHub({ connections: initial, espnAutoConnect }: Props) {
  const router = useRouter();
  const [connections, setConnections] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [authBanner, setAuthBanner] = useState<AuthBanner | null>(null);

  // Surface OAuth failures from the Yahoo callback redirect
  // (/connect?auth=error&reason=<code>). auth=success is handled by
  // YahooConnectCard, which auto-opens the league picker.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') !== 'error') return;
    const reason = params.get('reason') ?? 'unknown';
    if (reason === 'denied') {
      setAuthBanner({
        tone: 'amber',
        message: 'Yahoo connection cancelled. You can try again whenever you like.',
      });
    } else {
      setAuthBanner({
        tone: 'red',
        message: 'We could not finish connecting Yahoo. Please try again.',
        reason,
      });
    }
    // Strip the auth params so a refresh does not replay the banner.
    params.delete('auth');
    params.delete('reason');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  const handleStatusChange = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/user/connections', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setConnections(j.connections);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const activePlatforms = Object.entries(connections).filter(([, v]) => v.connected).length;
  const hasAny = activePlatforms > 0;

  return (
    <div className="space-y-8">
      {/* OAuth failure banner */}
      {authBanner && (
        <div
          className={`rounded-xl px-5 py-4 flex items-start justify-between gap-3 border ${
            authBanner.tone === 'amber'
              ? 'bg-amber-900/30 border-amber-700/50'
              : 'bg-red-900/30 border-red-700/50'
          }`}
        >
          <p className={`text-sm font-medium ${authBanner.tone === 'amber' ? 'text-amber-300' : 'text-red-300'}`}>
            {authBanner.message}
            {authBanner.reason && (
              <span className={authBanner.tone === 'amber' ? 'text-amber-500/70' : 'text-red-500/70'}>
                {' '}({authBanner.reason})
              </span>
            )}
          </p>
          <button
            onClick={() => setAuthBanner(null)}
            aria-label="Dismiss"
            className={`shrink-0 transition-colors ${
              authBanner.tone === 'amber' ? 'text-amber-500 hover:text-amber-300' : 'text-red-500 hover:text-red-300'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status banner */}
      {hasAny ? (
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-300">
              {activePlatforms} platform{activePlatforms !== 1 ? 's' : ''} connected
            </p>
            <p className="text-xs text-green-500 mt-0.5">
              Add more leagues below or head to Game Day.
            </p>
          </div>
          <button
            onClick={() => router.push('/gameday')}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">Game Day <ArrowRight className="w-4 h-4" /></span>
          </button>
        </div>
      ) : (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-blue-300">Connect at least one platform to get started.</p>
          <p className="text-xs text-blue-500 mt-0.5">
            You can connect multiple platforms and switch between leagues on the dashboard.
          </p>
        </div>
      )}

      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <YahooConnectCard
          initialStatus={connections.yahoo}
          onStatusChange={handleStatusChange}
        />
        <SleeperConnectCard
          initialStatus={connections.sleeper}
          onStatusChange={handleStatusChange}
        />
        <EspnConnectCard
          initialStatus={connections.espn}
          onStatusChange={handleStatusChange}
          autoConnect={espnAutoConnect}
        />
      </div>
    </div>
  );
}
