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

  // Auto-open league picker after Yahoo OAuth redirect (?auth=success)
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">Y!</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Yahoo Fantasy</h3>
          <p className="text-xs text-gray-500">Connect via OAuth</p>
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
              Sign in with Yahoo to access your fantasy leagues.
            </p>
            <a
              href="/api/yahoo/login"
              className="block w-full text-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              Connect Yahoo Fantasy
            </a>
          </>
        ) : (
          <>
            {/* League row */}
            {selectedLeague ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  League: <span className="font-medium text-gray-900">{selectedLeague.split('.l.')[1] ?? selectedLeague}</span>
                </span>
                <button
                  onClick={openLeaguePicker}
                  className="text-purple-600 hover:text-purple-800 font-medium text-xs"
                >
                  Change
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No league selected yet.
              </p>
            )}

            {!selectedLeague && (
              <button
                onClick={openLeaguePicker}
                className="w-full text-center bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Select League
              </button>
            )}

            {/* League picker */}
            {showLeaguePicker && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {loadingLeagues ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">Loading leagues...</div>
                ) : leagues.length > 0 ? (
                  <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {leagues.map((l) => (
                      <button
                        key={l.league_key}
                        onClick={() => selectLeague(l.league_key)}
                        disabled={selecting}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        <span className="font-medium text-gray-900">{l.name}</span>
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
                    <span className="text-gray-700">
                      My Team: <span className="font-medium text-gray-900">{myTeam.teamName}</span>
                    </span>
                    <button
                      onClick={() => {
                        setShowTeamPicker(true);
                        if (teams.length === 0) loadTeams(selectedLeague);
                      }}
                      className="text-purple-600 hover:text-purple-800 font-medium text-xs"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  !showTeamPicker && (
                    <button
                      onClick={() => {
                        setShowTeamPicker(true);
                        if (teams.length === 0) loadTeams(selectedLeague);
                      }}
                      className="w-full text-center bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Pick My Team
                    </button>
                  )
                )}

                {/* Team picker */}
                {showTeamPicker && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Pick Your Team
                    </div>
                    {loadingTeams ? (
                      <div className="px-4 py-3 text-center text-sm text-gray-500">Loading teams...</div>
                    ) : teams.length > 0 ? (
                      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {teams.map((t) => (
                          <button
                            key={t.teamKey}
                            onClick={() => selectTeam(t.teamKey, t.teamName)}
                            disabled={selectingTeam}
                            className="w-full px-4 py-2.5 text-left hover:bg-purple-50 transition-colors disabled:opacity-50"
                          >
                            <div className="text-sm font-medium text-gray-900">{t.teamName}</div>
                            {t.ownerName && (
                              <div className="text-xs text-gray-500">{t.ownerName}</div>
                            )}
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
