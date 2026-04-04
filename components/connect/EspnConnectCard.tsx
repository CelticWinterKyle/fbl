'use client';

import { useState, useEffect, useRef } from 'react';

interface MyTeam { teamKey: string; teamName: string; }
interface TeamEntry { teamKey: string; teamName: string; ownerName?: string; }

interface Props {
  initialStatus?: {
    connected: boolean;
    leagueId: string | null;
    leagueName: string | null;
    season: number | null;
    myTeam: MyTeam | null;
  };
  onStatusChange?: () => void;
  autoConnect?: {
    espnS2: string | null;
    swid: string | null;
    leagueId: string | null;
  } | null;
}

export default function EspnConnectCard({ initialStatus, onStatusChange, autoConnect }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [leagueName, setLeagueName] = useState<string | null>(initialStatus?.leagueName ?? null);
  const [leagueId, setLeagueId] = useState<string | null>(initialStatus?.leagueId ?? null);
  const [myTeam, setMyTeam] = useState<MyTeam | null>(initialStatus?.myTeam ?? null);

  const [inputLeagueId, setInputLeagueId] = useState('');
  const [inputEspnS2, setInputEspnS2] = useState('');
  const [inputSwid, setInputSwid] = useState('');
  const [showPrivateFields, setShowPrivateFields] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [selectingTeam, setSelectingTeam] = useState(false);

  // ── Auto-connect from extension ──────────────────────────────────────────
  const autoConnectFired = useRef(false);
  useEffect(() => {
    if (autoConnectFired.current || connected) return;
    const { espnS2, swid, leagueId: ac_leagueId } = autoConnect ?? {};
    if (!espnS2 || !swid || !ac_leagueId) {
      // Pre-fill what we have even if leagueId is missing
      if (espnS2) setInputEspnS2(espnS2);
      if (swid) setInputSwid(swid);
      if (espnS2 || swid) setShowPrivateFields(true);
      return;
    }
    autoConnectFired.current = true;
    setInputLeagueId(ac_leagueId);
    setInputEspnS2(espnS2);
    setInputSwid(swid);
    setShowPrivateFields(true);
    // Trigger connect automatically
    setConnecting(true);
    setError(null);
    fetch('/api/espn/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueId: ac_leagueId, espnS2, swid }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          if (j.error === 'private_league') {
            setError('League is private — cookies were provided but may be expired. Try reconnecting via ESPN.');
          } else {
            setError(j.message ?? j.error ?? 'Connection failed');
          }
          return;
        }
        const connectedId = j.leagueId ?? ac_leagueId;
        setConnected(true);
        setLeagueName(j.leagueName);
        setLeagueId(connectedId);
        setInputLeagueId('');
        setInputEspnS2('');
        setInputSwid('');
        setShowTeamPicker(true);
        loadTeams(connectedId);
        onStatusChange?.();
      })
      .catch((e) => setError(e?.message || 'Connection failed'))
      .finally(() => setConnecting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setError('This league is private. Expand "Private League Cookies" below and provide your espn_s2 and SWID cookies.');
          setShowPrivateFields(true);
        } else {
          setError(j.message ?? j.error ?? 'Connection failed');
        }
        return;
      }
      const connectedId = j.leagueId ?? id;
      setConnected(true);
      setLeagueName(j.leagueName);
      setLeagueId(connectedId);
      setInputLeagueId('');
      setInputEspnS2('');
      setInputSwid('');
      setShowTeamPicker(true);
      loadTeams(connectedId);
      onStatusChange?.();
    } finally {
      setConnecting(false);
    }
  }

  async function loadTeams(id: string) {
    setLoadingTeams(true);
    try {
      const r = await fetch(
        `/api/user/league-teams?platform=espn&leagueId=${encodeURIComponent(id)}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (j.ok) setTeams(j.teams ?? []);
    } finally {
      setLoadingTeams(false);
    }
  }

  async function selectTeam(teamKey: string, teamName: string) {
    setSelectingTeam(true);
    try {
      await fetch('/api/user/my-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'espn', teamKey, teamName }),
      });
      setMyTeam({ teamKey, teamName });
      setShowTeamPicker(false);
      onStatusChange?.();
    } finally {
      setSelectingTeam(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await Promise.all([
        fetch('/api/espn/connect', { method: 'DELETE' }),
        fetch('/api/user/my-team?platform=espn', { method: 'DELETE' }),
      ]);
      setConnected(false);
      setLeagueName(null);
      setLeagueId(null);
      setMyTeam(null);
      setTeams([]);
      setShowTeamPicker(false);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="bg-pitch-900 rounded-xl border border-pitch-700 shadow-lg shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-pitch-700/60 flex items-center gap-3">
        <div className="w-9 h-9 bg-[#E8002D] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[10px]">ESPN</span>
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">ESPN Fantasy</h3>
          <p className="text-xs text-gray-500">League ID required</p>
        </div>
        {connected && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-emerald-400 bg-emerald-900/30 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            CONNECTED
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-5 space-y-4">
        {!connected ? (
          <>
            {autoConnectFired.current && connecting ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                <svg className="h-3.5 w-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Connecting via FBL Extension…
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Enter your ESPN Fantasy league ID. For private leagues, you&apos;ll also need cookies from your browser.
              </p>
            )}

            <div>
              <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">League ID</label>
              <input
                type="text"
                value={inputLeagueId}
                onChange={(e) => setInputLeagueId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !showPrivateFields && connect()}
                placeholder="e.g. 12345678"
                className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
              />
            </div>

            {/* Private league section */}
            <div>
              <button
                type="button"
                onClick={() => setShowPrivateFields((v) => !v)}
                className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1.5 transition-colors"
              >
                <span className={`transition-transform text-[10px] ${showPrivateFields ? 'rotate-90' : ''}`}>▶</span>
                Private League Cookies (optional)
              </button>

              {showPrivateFields && (
                <div className="mt-3 space-y-3 pl-4 border-l-2 border-pitch-700">
                  <p className="text-xs text-gray-500">
                    Open ESPN Fantasy in your browser → DevTools → Application → Cookies → espn.com, and copy the{' '}
                    <code className="font-mono text-gray-300">espn_s2</code> and{' '}
                    <code className="font-mono text-gray-300">SWID</code> values.
                  </p>
                  <div>
                    <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">espn_s2</label>
                    <input
                      type="password"
                      value={inputEspnS2}
                      onChange={(e) => setInputEspnS2(e.target.value)}
                      placeholder="espn_s2 cookie value"
                      className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">SWID</label>
                    <input
                      type="text"
                      value={inputSwid}
                      onChange={(e) => setInputSwid(e.target.value)}
                      placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                      className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={connect}
              disabled={connecting || !inputLeagueId.trim()}
              className="w-full bg-[#E8002D] hover:bg-[#c4002a] text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 tracking-wide"
            >
              {connecting ? 'Connecting...' : 'Connect ESPN League'}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">League</span>
                <span className="font-semibold text-white">{leagueName ?? leagueId}</span>
              </div>
              {leagueId && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">ID</span>
                  <span className="text-gray-400 font-mono text-xs">{leagueId}</span>
                </div>
              )}
            </div>

            {/* My Team row */}
            {myTeam ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  My Team: <span className="font-semibold text-white">{myTeam.teamName}</span>
                </span>
                <button
                  onClick={() => { setShowTeamPicker(true); if (teams.length === 0 && leagueId) loadTeams(leagueId); }}
                  className="text-red-400 hover:text-red-300 font-semibold text-xs transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              !showTeamPicker && (
                <button
                  onClick={() => { setShowTeamPicker(true); if (leagueId) loadTeams(leagueId); }}
                  className="w-full text-center bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-700/30 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Pick My Team
                </button>
              )
            )}

            {/* Team picker */}
            {showTeamPicker && (
              <div className="border border-pitch-700 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-pitch-800 border-b border-pitch-700/60 text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
                  Pick Your Team
                </div>
                {loadingTeams ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">Loading teams...</div>
                ) : teams.length > 0 ? (
                  <div className="divide-y divide-pitch-700/40 max-h-48 overflow-y-auto">
                    {teams.map((t) => (
                      <button
                        key={t.teamKey}
                        onClick={() => selectTeam(t.teamKey, t.teamName)}
                        disabled={selectingTeam}
                        className="w-full px-4 py-2.5 text-left hover:bg-pitch-800 transition-colors disabled:opacity-50"
                      >
                        <div className="text-sm font-semibold text-white">{t.teamName}</div>
                        {t.ownerName && <div className="text-xs text-gray-500">{t.ownerName}</div>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">No teams found.</div>
                )}
              </div>
            )}

            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
