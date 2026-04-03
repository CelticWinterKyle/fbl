'use client';

import { useState } from 'react';

interface Props {
  initialStatus?: {
    connected: boolean;
    leagueId: string | null;
    leagueName: string | null;
    season: number | null;
  };
  onStatusChange?: () => void;
}

export default function EspnConnectCard({ initialStatus, onStatusChange }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [leagueName, setLeagueName] = useState<string | null>(initialStatus?.leagueName ?? null);
  const [leagueId, setLeagueId] = useState<string | null>(initialStatus?.leagueId ?? null);

  const [inputLeagueId, setInputLeagueId] = useState('');
  const [inputEspnS2, setInputEspnS2] = useState('');
  const [inputSwid, setInputSwid] = useState('');
  const [showPrivateFields, setShowPrivateFields] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const id = inputLeagueId.trim();
    if (!id) return;
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch('/api/espn/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId: id,
          espnS2: inputEspnS2.trim() || undefined,
          swid: inputSwid.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        if (j.error === 'private_league') {
          setError(
            'This league is private. Expand "Private League Cookies" below and provide your espn_s2 and SWID cookies.'
          );
          setShowPrivateFields(true);
        } else {
          setError(j.message ?? j.error ?? 'Connection failed');
        }
        return;
      }
      setConnected(true);
      setLeagueName(j.leagueName);
      setLeagueId(j.leagueId);
      setInputLeagueId('');
      setInputEspnS2('');
      setInputSwid('');
      onStatusChange?.();
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/espn/connect', { method: 'DELETE' });
      setConnected(false);
      setLeagueName(null);
      setLeagueId(null);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#E8002D] rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">ESPN</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">ESPN Fantasy</h3>
          <p className="text-xs text-gray-500">League ID required</p>
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
              Enter your ESPN Fantasy league ID. For private leagues, you'll also need cookies from
              your browser.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">League ID</label>
              <input
                type="text"
                value={inputLeagueId}
                onChange={(e) => setInputLeagueId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !showPrivateFields && connect()}
                placeholder="e.g. 12345678"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {/* Private league section */}
            <div>
              <button
                type="button"
                onClick={() => setShowPrivateFields((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <span className={`transition-transform ${showPrivateFields ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                Private League Cookies (optional)
              </button>

              {showPrivateFields && (
                <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
                  <p className="text-xs text-gray-500">
                    To get these values: open ESPN Fantasy in your browser, open DevTools → Application
                    → Cookies → espn.com, and copy the <code className="font-mono">espn_s2</code> and{' '}
                    <code className="font-mono">SWID</code> values.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">espn_s2</label>
                    <input
                      type="password"
                      value={inputEspnS2}
                      onChange={(e) => setInputEspnS2(e.target.value)}
                      placeholder="espn_s2 cookie value"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">SWID</label>
                    <input
                      type="text"
                      value={inputSwid}
                      onChange={(e) => setInputSwid(e.target.value)}
                      placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={connect}
              disabled={connecting || !inputLeagueId.trim()}
              className="w-full bg-[#E8002D] hover:bg-[#c4002a] text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect ESPN League'}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">League</span>
                <span className="font-medium text-gray-900">{leagueName ?? leagueId}</span>
              </div>
              {leagueId && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">ID</span>
                  <span className="text-gray-500 font-mono text-xs">{leagueId}</span>
                </div>
              )}
            </div>

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
