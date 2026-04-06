'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Check } from 'lucide-react';

interface MyTeam { teamKey: string; teamName: string; }
interface LeagueEntry { league_key: string; name: string; }
interface AddedLeague { leagueKey: string; myTeam: MyTeam | null; leagueName?: string; }

interface Props {
  initialStatus?: {
    connected: boolean;
    leagues: { leagueKey: string; myTeam: MyTeam | null }[];
  };
  onStatusChange?: () => void;
}

export default function YahooConnectCard({ initialStatus, onStatusChange }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [addedLeagues, setAddedLeagues] = useState<AddedLeague[]>(
    initialStatus?.leagues?.map((l) => ({ leagueKey: l.leagueKey, myTeam: l.myTeam })) ?? []
  );

  const [availableLeagues, setAvailableLeagues] = useState<LeagueEntry[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // league_key being added
  const [removing, setRemoving] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Pending team pickers: leagues that were added but auto-detect failed
  const [pendingTeamPicker, setPendingTeamPicker] = useState<string | null>(null);
  const [teamPickerTeams, setTeamPickerTeams] = useState<{ teamKey: string; teamName: string; ownerName?: string }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectingTeam, setSelectingTeam] = useState(false);

  useEffect(() => {
    if (connected && addedLeagues.length === 0 && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'success') {
        window.history.replaceState({}, '', window.location.pathname);
        openPicker();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function openPicker() {
    setShowPicker(true);
    if (availableLeagues.length === 0) {
      setLoadingLeagues(true);
      try {
        const r = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
        const j = await r.json();
        if (j.ok) {
          const all: LeagueEntry[] = (j.games ?? []).flatMap((g: any) =>
            (g.leagues ?? []).map((l: any) => ({ league_key: l.league_key, name: l.name }))
          );
          setAvailableLeagues(all);
        }
      } finally {
        setLoadingLeagues(false);
      }
    }
  }

  async function addLeague(league_key: string, leagueName: string) {
    setAdding(league_key);
    try {
      const r = await fetch('/api/yahoo/user/select-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_key }),
      });
      const j = await r.json();
      if (!j.ok) return;

      const newEntry: AddedLeague = {
        leagueKey: league_key,
        leagueName,
        myTeam: j.myTeam ?? null,
      };
      setAddedLeagues((prev) => [...prev.filter((l) => l.leagueKey !== league_key), newEntry]);
      setShowPicker(false);
      onStatusChange?.();

      // If auto-detect failed, open the team picker for this league
      if (!j.myTeam) {
        setPendingTeamPicker(league_key);
        loadTeamPicker(league_key);
      }
    } finally {
      setAdding(null);
    }
  }

  async function removeLeague(league_key: string) {
    setRemoving(league_key);
    try {
      await fetch('/api/yahoo/user/select-league', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_key }),
      });
      setAddedLeagues((prev) => prev.filter((l) => l.leagueKey !== league_key));
      if (pendingTeamPicker === league_key) setPendingTeamPicker(null);
      onStatusChange?.();
    } finally {
      setRemoving(null);
    }
  }

  async function loadTeamPicker(leagueKey: string) {
    setLoadingTeams(true);
    try {
      const r = await fetch(
        `/api/user/league-teams?platform=yahoo&leagueId=${encodeURIComponent(leagueKey)}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (j.ok) setTeamPickerTeams(j.teams ?? []);
    } finally {
      setLoadingTeams(false);
    }
  }

  async function selectTeam(leagueKey: string, teamKey: string, teamName: string) {
    setSelectingTeam(true);
    try {
      await fetch('/api/user/my-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'yahoo', leagueId: leagueKey, teamKey, teamName }),
      });
      setAddedLeagues((prev) =>
        prev.map((l) => l.leagueKey === leagueKey ? { ...l, myTeam: { teamKey, teamName } } : l)
      );
      setPendingTeamPicker(null);
      setTeamPickerTeams([]);
      onStatusChange?.();
    } finally {
      setSelectingTeam(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/yahoo/user/disconnect', { method: 'POST' });
      setConnected(false);
      setAddedLeagues([]);
      setAvailableLeagues([]);
      setShowPicker(false);
      setPendingTeamPicker(null);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  const alreadyAdded = new Set(addedLeagues.map((l) => l.leagueKey));

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
            <p className="text-sm text-gray-400">Sign in with Yahoo to access your fantasy leagues.</p>
            <a
              href="/api/yahoo/login"
              className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm tracking-wide"
            >
              Connect Yahoo Fantasy
            </a>
          </>
        ) : (
          <>
            {/* Added leagues list */}
            {addedLeagues.length > 0 && (
              <div className="space-y-2">
                {addedLeagues.map((l) => (
                  <div
                    key={l.leagueKey}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-pitch-800 border border-pitch-700/60"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {l.leagueName ?? l.leagueKey.split('.l.')[1] ?? l.leagueKey}
                      </div>
                      {l.myTeam ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          <span className="text-xs text-emerald-400">{l.myTeam.teamName}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPendingTeamPicker(l.leagueKey); if (teamPickerTeams.length === 0) loadTeamPicker(l.leagueKey); }}
                          className="text-xs text-amber-400 hover:text-amber-300 mt-0.5 transition-colors"
                        >
                          Pick your team →
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => removeLeague(l.leagueKey)}
                      disabled={removing === l.leagueKey}
                      className="shrink-0 p-1 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Remove league"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Team picker (shown when auto-detect failed) */}
            {pendingTeamPicker && (
              <div className="border border-pitch-700 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-pitch-800 border-b border-pitch-700/60 text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
                  Which team is yours?
                </div>
                {loadingTeams ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">Loading teams...</div>
                ) : teamPickerTeams.length > 0 ? (
                  <div className="divide-y divide-pitch-700/40 max-h-48 overflow-y-auto">
                    {teamPickerTeams.map((t) => (
                      <button
                        key={t.teamKey}
                        onClick={() => selectTeam(pendingTeamPicker, t.teamKey, t.teamName)}
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

            {/* Add League button */}
            <button
              onClick={openPicker}
              className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add a league
            </button>

            {/* League picker dropdown */}
            {showPicker && (
              <div className="border border-pitch-700 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-pitch-800 border-b border-pitch-700/60 flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">Your Leagues</span>
                  <button onClick={() => setShowPicker(false)} className="text-gray-600 hover:text-gray-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {loadingLeagues ? (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">Loading leagues...</div>
                ) : availableLeagues.length > 0 ? (
                  <div className="divide-y divide-pitch-700/40 max-h-48 overflow-y-auto">
                    {availableLeagues.map((l) => {
                      const isAdded = alreadyAdded.has(l.league_key);
                      return (
                        <button
                          key={l.league_key}
                          onClick={() => !isAdded && addLeague(l.league_key, l.name)}
                          disabled={isAdded || adding === l.league_key}
                          className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors disabled:opacity-60 ${
                            isAdded ? 'cursor-default' : 'hover:bg-pitch-800'
                          }`}
                        >
                          <span className="text-sm font-semibold text-white">{l.name}</span>
                          {isAdded ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : adding === l.league_key ? (
                            <span className="text-xs text-gray-500">Adding...</span>
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">No leagues found.</div>
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
