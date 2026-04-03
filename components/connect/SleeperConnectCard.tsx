'use client';

import { useState } from 'react';

interface Props {
  initialStatus?: {
    connected: boolean;
    username: string | null;
    sleeperId: string | null;
    selectedLeague: string | null;
  };
  onStatusChange?: () => void;
}

interface SleeperLeague {
  id: string;
  name: string;
  season: string;
  status: string;
  teamCount: number;
}

export default function SleeperConnectCard({ initialStatus, onStatusChange }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [username, setUsername] = useState(initialStatus?.username ?? '');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(initialStatus?.selectedLeague ?? null);
  const [inputUsername, setInputUsername] = useState('');
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLeaguePicker, setShowLeaguePicker] = useState(false);

  async function connect() {
    const trimmed = inputUsername.trim();
    if (!trimmed) return;
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch('/api/sleeper/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.message ?? j.error ?? 'Connection failed');
        return;
      }
      setConnected(true);
      setUsername(j.displayName || j.username);
      setInputUsername('');
      onStatusChange?.();
      // Auto-load leagues
      loadLeagues(j.username);
    } finally {
      setConnecting(false);
    }
  }

  async function loadLeagues(forUsername?: string) {
    setLoadingLeagues(true);
    try {
      const r = await fetch('/api/sleeper/leagues', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) {
        setLeagues(j.leagues ?? []);
        setShowLeaguePicker(true);
      }
    } finally {
      setLoadingLeagues(false);
    }
  }

  async function selectLeague(leagueId: string) {
    setSelecting(true);
    try {
      await fetch('/api/sleeper/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId }),
      });
      const league = leagues.find((l) => l.id === leagueId);
      setSelectedLeague(leagueId);
      setShowLeaguePicker(false);
      onStatusChange?.();
    } finally {
      setSelecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/sleeper/connect', { method: 'DELETE' });
      setConnected(false);
      setUsername('');
      setSelectedLeague(null);
      setLeagues([]);
      setShowLeaguePicker(false);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  const selectedLeagueName = leagues.find((l) => l.id === selectedLeague)?.name;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#01B86C] rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">SL</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Sleeper</h3>
          <p className="text-xs text-gray-500">Username lookup — no OAuth needed</p>
        </div>
        {connected && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            Connected
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-4">
        {!connected ? (
          <>
            <p className="text-sm text-gray-600">
              Enter your Sleeper username to connect your leagues.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputUsername}
                onChange={(e) => setInputUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                placeholder="Your Sleeper username"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={connect}
                disabled={connecting || !inputUsername.trim()}
                className="bg-[#01B86C] hover:bg-[#019a5b] text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Signed in as</span>
              <span className="font-semibold text-gray-900">{username}</span>
            </div>

            {selectedLeague ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  League:{' '}
                  <span className="font-medium text-gray-900">
                    {selectedLeagueName ?? selectedLeague}
                  </span>
                </span>
                <button
                  onClick={() => {
                    setShowLeaguePicker(true);
                    if (leagues.length === 0) loadLeagues();
                  }}
                  className="text-[#01B86C] hover:text-[#019a5b] font-medium text-xs"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => loadLeagues()}
                disabled={loadingLeagues}
                className="w-full text-center bg-green-50 hover:bg-green-100 text-green-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                {loadingLeagues ? 'Loading leagues...' : 'Select a League'}
              </button>
            )}

            {/* League picker */}
            {showLeaguePicker && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {loadingLeagues ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">
                    Loading your leagues...
                  </div>
                ) : leagues.length > 0 ? (
                  <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {leagues.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => selectLeague(l.id)}
                        disabled={selecting}
                        className="w-full px-4 py-2.5 text-left hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        <div className="text-sm font-medium text-gray-900">{l.name}</div>
                        <div className="text-xs text-gray-500">
                          {l.season} season · {l.teamCount} teams ·{' '}
                          <span className="capitalize">{l.status.replace(/_/g, ' ')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">
                    No leagues found for this season.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
