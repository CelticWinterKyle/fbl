'use client';

import { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';

interface MyTeam { teamKey: string; teamName: string; }

interface AddedLeague {
  leagueId: string;
  leagueName?: string;
  myTeam: MyTeam | null;
}

interface SleeperLeague {
  id: string;
  name: string;
  season: string;
  status: string;
  teamCount: number;
}

interface Props {
  initialStatus?: {
    connected: boolean;
    username: string | null;
    sleeperId: string | null;
    leagues: { leagueId: string; myTeam: MyTeam | null }[];
  };
  onStatusChange?: () => void;
}

export default function SleeperConnectCard({ initialStatus, onStatusChange }: Props) {
  const [connected, setConnected] = useState(initialStatus?.connected ?? false);
  const [username, setUsername] = useState(initialStatus?.username ?? '');
  const [addedLeagues, setAddedLeagues] = useState<AddedLeague[]>(
    initialStatus?.leagues?.map((l) => ({ leagueId: l.leagueId, myTeam: l.myTeam })) ?? []
  );

  const [inputUsername, setInputUsername] = useState('');
  const [availableLeagues, setAvailableLeagues] = useState<SleeperLeague[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pending team pickers
  const [pendingTeamPicker, setPendingTeamPicker] = useState<string | null>(null);
  const [teamPickerTeams, setTeamPickerTeams] = useState<{ teamKey: string; teamName: string; ownerName?: string }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectingTeam, setSelectingTeam] = useState(false);

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
      if (!j.ok) { setError(j.message ?? j.error ?? 'Connection failed'); return; }
      setConnected(true);
      setUsername(j.displayName || j.username);
      setInputUsername('');
      onStatusChange?.();
      openPicker();
    } finally {
      setConnecting(false);
    }
  }

  async function openPicker() {
    setShowPicker(true);
    if (availableLeagues.length === 0) {
      setLoadingLeagues(true);
      try {
        const r = await fetch('/api/sleeper/leagues', { cache: 'no-store' });
        const j = await r.json();
        if (j.ok) setAvailableLeagues(j.leagues ?? []);
      } finally {
        setLoadingLeagues(false);
      }
    }
  }

  async function addLeague(leagueId: string, leagueName: string) {
    setAdding(leagueId);
    try {
      const r = await fetch('/api/sleeper/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId }),
      });
      const j = await r.json();
      if (!j.ok) return;

      const newEntry: AddedLeague = {
        leagueId,
        leagueName,
        myTeam: j.myTeam ?? null,
      };
      setAddedLeagues((prev) => [...prev.filter((l) => l.leagueId !== leagueId), newEntry]);
      setShowPicker(false);
      onStatusChange?.();

      if (!j.myTeam) {
        setPendingTeamPicker(leagueId);
        loadTeamPicker(leagueId);
      }
    } finally {
      setAdding(null);
    }
  }

  async function removeLeague(leagueId: string) {
    setRemoving(leagueId);
    try {
      await fetch('/api/sleeper/leagues', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId }),
      });
      setAddedLeagues((prev) => prev.filter((l) => l.leagueId !== leagueId));
      if (pendingTeamPicker === leagueId) setPendingTeamPicker(null);
      onStatusChange?.();
    } finally {
      setRemoving(null);
    }
  }

  async function loadTeamPicker(leagueId: string) {
    setLoadingTeams(true);
    try {
      const r = await fetch(
        `/api/user/league-teams?platform=sleeper&leagueId=${encodeURIComponent(leagueId)}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (j.ok) setTeamPickerTeams(j.teams ?? []);
    } finally {
      setLoadingTeams(false);
    }
  }

  async function selectTeam(leagueId: string, teamKey: string, teamName: string) {
    setSelectingTeam(true);
    try {
      await fetch('/api/user/my-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'sleeper', leagueId, teamKey, teamName }),
      });
      setAddedLeagues((prev) =>
        prev.map((l) => l.leagueId === leagueId ? { ...l, myTeam: { teamKey, teamName } } : l)
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
      await fetch('/api/sleeper/connect', { method: 'DELETE' });
      setConnected(false);
      setUsername('');
      setAddedLeagues([]);
      setAvailableLeagues([]);
      setShowPicker(false);
      setPendingTeamPicker(null);
      onStatusChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  const alreadyAdded = new Set(addedLeagues.map((l) => l.leagueId));

  return (
    <div className="bg-pitch-900 rounded-xl border border-pitch-700 shadow-lg shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-pitch-700/60 flex items-center gap-3">
        <div className="w-9 h-9 bg-[#01B86C] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-xs">SL</span>
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">Sleeper</h3>
          <p className="text-xs text-gray-500">Username lookup — no OAuth needed</p>
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
            <p className="text-sm text-gray-400">Enter your Sleeper username to connect your leagues.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputUsername}
                onChange={(e) => setInputUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                placeholder="Your Sleeper username"
                className="flex-1 bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
              <button
                onClick={connect}
                disabled={connecting || !inputUsername.trim()}
                className="bg-[#01B86C] hover:bg-[#019a5b] text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">{error}</p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Signed in as</span>
              <span className="font-bold text-white">{username}</span>
            </div>

            {/* Added leagues list */}
            {addedLeagues.length > 0 && (
              <div className="space-y-2">
                {addedLeagues.map((l) => (
                  <div
                    key={l.leagueId}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-pitch-800 border border-pitch-700/60"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {l.leagueName ?? l.leagueId}
                      </div>
                      {l.myTeam ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                          <span className="text-xs text-emerald-400">{l.myTeam.teamName}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setPendingTeamPicker(l.leagueId); if (teamPickerTeams.length === 0) loadTeamPicker(l.leagueId); }}
                          className="text-xs text-amber-400 hover:text-amber-300 mt-0.5 transition-colors"
                        >
                          Pick your team →
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => removeLeague(l.leagueId)}
                      disabled={removing === l.leagueId}
                      className="shrink-0 p-1 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Remove league"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Team picker */}
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
              className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add a league
            </button>

            {/* League picker */}
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
                      const isAdded = alreadyAdded.has(l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => !isAdded && addLeague(l.id, l.name)}
                          disabled={isAdded || adding === l.id}
                          className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors disabled:opacity-60 ${
                            isAdded ? 'cursor-default' : 'hover:bg-pitch-800'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-white">{l.name}</div>
                            <div className="text-xs text-gray-500">
                              {l.season} · {l.teamCount} teams · <span className="capitalize">{l.status.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                          {isAdded ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : adding === l.id ? (
                            <span className="text-xs text-gray-500">Adding...</span>
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-gray-500">No leagues found for this season.</div>
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
