'use client';

import { useState, useEffect } from 'react';

interface MyTeam { teamKey: string; teamName: string; }
interface LeagueEntry { league_key: string; name: string; }
interface TeamEntry { teamKey: string; teamName: string; ownerName?: string; }

interface Props {
  initialStatus?: {
    connected: boolean;
    selectedLeague: string | null;
    myTeam: MyTeam | null;
  };
  onStatusChange?: () => void;
}

export default function YahooConnectCard({ initialStatus, onStatusChange }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(initialStatus?.selectedLeague ?? null);
  const [myTeam, setMyTeam] = useState<MyTeam | null>(initialStatus?.myTeam ?? null);

  const [leagues, setLeagues] = useState<LeagueEntry[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showLeaguePicker, setShowLeaguePicker] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [selectingTeam, setSelectingTeam] = useState(false);

  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (connected && !selectedLeague && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'success') {
        window.history.replaceState({}, '', window.location.pathname);
        openLeaguePicker();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function loadLeagues() {
    setLoadingLeagues(true);
    try {
      const r = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) {
        const all: LeagueEntry[] = (j.games ?? []).flatMap((g: any) =>
          (g.leagues ?? []).map((l: any) => ({ league_key: l.league_key, name: l.name }))
        );
        setLeagues(all);
      }
    } finally {
      setLoadingLeagues(false);
    }
  }

  async function selectLeague(leagueKey: string) {
    setSelecting(true);
    try {
      await fetch('/api/yahoo/user/select-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_key: leagueKey }),
      });
      setSelectedLeague(leagueKey);
      setShowLeaguePicker(false);
      setMyTeam(null);
      setTeams([]);
      setShowTeamPicker(true);
      loadTeams(leagueKey);
      onStatusChange?.();
    } finally {
      setSelecting(false);
    }
  }

  async function loadTeams(leagueKey: string) {
    setLoadingTeams(true);
    try {
      const r = await fetch(
        `/api/user/league-teams?platform=yahoo&leagueId=${encodeURIComponent(leagueKey)}`,
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
        body: JSON.stringify({ platform: 'yahoo', teamKey, teamName }),
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
        fetch('/api/yahoo/user/disconnect', { method: 'POST' }),
        fetch('/api/user/my-team?platform=yahoo', { method: 'DELETE' }),
      ]);
      setConnected(false);
      setSelectedLeague(null);
      setMyTeam(null);
      setLeagues([]);
      setTeams([]);
      setShowLeaguePicker(false);
      setShowTeamPicker(false);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  function openLeaguePicker() {
    setShowLeaguePicker(true);
    if (leagues.length === 0) loadLeagues();
  }

  return (
    <div className="bg-pitch-900 rounded-xl border border-pitch-700 shadow-lg shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-pitch-700/60 flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">Y!</span>
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">Yahoo Fantasy</h3>
          <p className="text-xs text-gray-500">Connect via OAuth</p>
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
            <p className="text-sm text-gray-400">
              Sign in with Yahoo to access your fantasy leagues.
            </p>
            <a
              href="/api/yahoo/login"
              className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm tracking-wide"
            >
              Connect Yahoo Fantasy
            </a>
          </>
        ) : (
          <>
            {/* League row */}
            {selectedLeague ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  League: <span className="font-semibold text-white">{selectedLeague.split('.l.')[1] ?? selectedLeague}</span>
                </span>
                <button onClick={openLeaguePicker} className="text-purple-400 hover:text-purple-300 font-semibold text-xs transition-colors">
                  Change
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">
                No league selected yet.
              </p>
            )}

            {!selectedLeague && (
              <button
                onClick={openLeaguePicker}
                className="w-full text-center bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Select League
              </button>
            )}

            {/* League picker */}
            {showLeaguePicker && (
              <div className="border border-pitch-700 rounded-lg overflow-hidden">
                {loadingLeagues ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">Loading leagues...</div>
                ) : leagues.length > 0 ? (
                  <div className="divide-y divide-pitch-700/40 max-h-40 overflow-y-auto">
                    {leagues.map((l) => (
                      <button
                        key={l.league_key}
                        onClick={() => selectLeague(l.league_key)}
                        disabled={selecting}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-pitch-800 transition-colors disabled:opacity-50"
                      >
                        <span className="font-semibold text-white">{l.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">No leagues found.</div>
                )}
              </div>
            )}

            {/* Team row — only shown once a league is selected */}
            {selectedLeague && (
              <>
                {myTeam ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">
                      My Team: <span className="font-semibold text-white">{myTeam.teamName}</span>
                    </span>
                    <button
                      onClick={() => { setShowTeamPicker(true); if (teams.length === 0) loadTeams(selectedLeague); }}
                      className="text-purple-400 hover:text-purple-300 font-semibold text-xs transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  !showTeamPicker && (
                    <button
                      onClick={() => { setShowTeamPicker(true); if (teams.length === 0) loadTeams(selectedLeague); }}
                      className="w-full text-center bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
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
              </>
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
