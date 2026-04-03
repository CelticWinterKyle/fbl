'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import YahooConnectCard from '@/components/connect/YahooConnectCard';
import SleeperConnectCard from '@/components/connect/SleeperConnectCard';
import EspnConnectCard from '@/components/connect/EspnConnectCard';

interface Connections {
  yahoo: { connected: boolean; selectedLeague: string | null };
  sleeper: { connected: boolean; username: string | null; sleeperId: string | null; selectedLeague: string | null };
  espn: { connected: boolean; leagueId: string | null; leagueName: string | null; season: number | null };
}

interface Props {
  connections: Connections;
}

export default function ConnectHub({ connections: initial }: Props) {
  const router = useRouter();
  const [connections, setConnections] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

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
      {/* Status banner */}
      {hasAny ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              {activePlatforms} platform{activePlatforms !== 1 ? 's' : ''} connected
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              Add more leagues below or head to the dashboard.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-5 rounded-lg text-sm transition-colors"
          >
            Go to Dashboard →
          </button>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-blue-800">Connect at least one platform to get started.</p>
          <p className="text-xs text-blue-600 mt-0.5">
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
        />
      </div>
    </div>
  );
}
