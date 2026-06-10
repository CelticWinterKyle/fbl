'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Check, ArrowRight } from 'lucide-react';
import CommissionerToggle from '@/components/connect/CommissionerToggle';
import EspnBookmarklet from '@/components/connect/EspnBookmarklet';

// Set this to the Chrome Web Store URL once the extension is published. While it's
// empty, the card shows a "coming soon" note instead of a dead install button.
const ESPN_EXTENSION_STORE_URL = '';

interface MyTeam { teamKey: string; teamName: string; }
interface TeamEntry { teamKey: string; teamName: string; ownerName?: string; }

interface AddedLeague {
  leagueId: string;
  leagueName: string | null;
  season: number;
  relay: boolean;
  myTeam: MyTeam | null;
}

interface Props {
  initialStatus?: {
    connected: boolean;
    leagues: AddedLeague[];
  };
  onStatusChange?: () => void;
  autoConnect?: {
    espnS2: string | null;
    swid: string | null;
    espnToken: string | null;
    leagueId: string | null;
  } | null;
}

export default function EspnConnectCard({ initialStatus, onStatusChange, autoConnect }: Props) {
  const [addedLeagues, setAddedLeagues] = useState<AddedLeague[]>(initialStatus?.leagues ?? []);
  const connected = addedLeagues.length > 0;

  const [showAddForm, setShowAddForm] = useState(false);
  const [inputLeagueId, setInputLeagueId] = useState('');
  const [inputEspnS2, setInputEspnS2] = useState('');
  const [inputSwid, setInputSwid] = useState('');
  const [showPrivateFields, setShowPrivateFields] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Team picker for non-relay leagues
  const [pendingTeamPicker, setPendingTeamPicker] = useState<string | null>(null);
  const [teamPickerTeams, setTeamPickerTeams] = useState<TeamEntry[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [selectingTeam, setSelectingTeam] = useState(false);

  // Discovered leagues (auto-detected by extension)
  const [discoveredLeagues, setDiscoveredLeagues] = useState<{ leagueId: string; season: number; name?: string }[]>([]);

  // Whether the FBL browser extension is installed (it announces itself via a DOM
  // marker + postMessage from fbl-sync.js).
  const [extensionPresent, setExtensionPresent] = useState(false);
  const [showBookmarklet, setShowBookmarklet] = useState(false);

  const refreshDiscovered = useCallback(() => {
    fetch('/api/espn/discovered-leagues', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setDiscoveredLeagues(j.leagues ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshDiscovered();
    // Re-check when the user returns from the ESPN tab (where the extension just
    // discovered their leagues) so they appear automatically — no manual refresh.
    const onFocus = () => refreshDiscovered();
    window.addEventListener('focus', onFocus);
    // Also poll for the first ~90s after load, so leagues surface even without a
    // focus event after the extension reports them.
    const poll = setInterval(refreshDiscovered, 4000);
    const stop = setTimeout(() => clearInterval(poll), 90000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(poll); clearTimeout(stop); };
  }, [refreshDiscovered]);

  useEffect(() => {
    const check = () => {
      if (document.documentElement.getAttribute('data-fbl-extension')) {
        setExtensionPresent(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.source === 'fbl-extension' && e.data?.type === 'FBL_EXTENSION_PRESENT') {
        setExtensionPresent(true);
      }
    };
    window.addEventListener('message', onMsg);
    // The content script loads at document_idle, possibly after us — poll briefly.
    const poll = setInterval(() => { if (check()) clearInterval(poll); }, 500);
    const stop = setTimeout(() => clearInterval(poll), 5000);
    return () => { window.removeEventListener('message', onMsg); clearInterval(poll); clearTimeout(stop); };
  }, []);

  // Auto-connect from extension
  const autoConnectFired = useRef(false);
  useEffect(() => {
    if (autoConnectFired.current) return;
    const { espnS2, swid, espnToken, leagueId: ac_leagueId } = autoConnect ?? {};
    const hasAuth = !!(espnS2 && swid) || !!espnToken;
    if (!hasAuth || !ac_leagueId) {
      if (espnS2) setInputEspnS2(espnS2);
      if (swid) setInputSwid(swid);
      if (espnS2 || swid) { setShowPrivateFields(true); setShowAddForm(true); }
      return;
    }
    // Already added this league — skip
    if (addedLeagues.some((l) => l.leagueId === ac_leagueId)) return;
    autoConnectFired.current = true;
    setConnecting(true);
    setError(null);
    fetch('/api/espn/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueId: ac_leagueId, espnS2, swid, espnToken }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.message ?? j.error ?? 'Connection failed'); return; }
        const newEntry: AddedLeague = {
          leagueId: j.leagueId ?? ac_leagueId,
          leagueName: j.leagueName ?? null,
          season: j.season,
          relay: j.relay ?? false,
          myTeam: null,
        };
        setAddedLeagues((prev) => [...prev.filter((l) => l.leagueId !== newEntry.leagueId), newEntry]);
        if (!j.relay) { setPendingTeamPicker(newEntry.leagueId); loadTeamPicker(newEntry.leagueId); }
        else { triggerResync(); pollForAutoTeam(newEntry.leagueId); }
        onStatusChange?.();
      })
      .catch((e) => setError(e?.message || 'Connection failed'))
      .finally(() => setConnecting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addLeagueById(leagueId: string, leagueName?: string) {
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch('/api/espn/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, leagueName }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.message ?? j.error ?? 'Connection failed'); return; }
      const newEntry: AddedLeague = {
        leagueId: j.leagueId ?? leagueId,
        leagueName: j.leagueName ?? leagueName ?? null,
        season: j.season,
        relay: j.relay ?? false,
        myTeam: null,
      };
      setAddedLeagues((prev) => [...prev.filter((l) => l.leagueId !== newEntry.leagueId), newEntry]);
      if (!j.relay) { setPendingTeamPicker(newEntry.leagueId); loadTeamPicker(newEntry.leagueId); }
      else { triggerResync(); pollForAutoTeam(newEntry.leagueId); }
      onStatusChange?.();
    } finally {
      setConnecting(false);
    }
  }

  async function addLeague() {
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
      if (!j.ok) { setError(j.message ?? j.error ?? 'Connection failed'); return; }
      const newEntry: AddedLeague = {
        leagueId: j.leagueId ?? id,
        leagueName: j.leagueName ?? null,
        season: j.season,
        relay: j.relay ?? false,
        myTeam: null,
      };
      setAddedLeagues((prev) => [...prev.filter((l) => l.leagueId !== newEntry.leagueId), newEntry]);
      setInputLeagueId('');
      setInputEspnS2('');
      setInputSwid('');
      setShowAddForm(false);
      setError(null);
      if (!j.relay) { setPendingTeamPicker(newEntry.leagueId); loadTeamPicker(newEntry.leagueId); }
      else { triggerResync(); pollForAutoTeam(newEntry.leagueId); }
      onStatusChange?.();
    } finally {
      setConnecting(false);
    }
  }

  async function removeLeague(leagueId: string) {
    setRemoving(leagueId);
    try {
      await fetch('/api/espn/connect', {
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
        `/api/user/league-teams?platform=espn&leagueId=${encodeURIComponent(leagueId)}`,
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
        body: JSON.stringify({ platform: 'espn', leagueId, teamKey, teamName }),
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

  // Ask the extension to immediately re-sync (so a just-added league's data —
  // and thus its auto-detected team — lands without waiting for a page reload).
  function triggerResync() {
    try { window.postMessage({ source: 'fbl-app', type: 'FBL_RESYNC' }, '*'); } catch {}
  }

  // Poll connections for the server-auto-detected team and fill it into the UI,
  // so the user never has to pick it manually for relay leagues.
  function pollForAutoTeam(leagueId: string) {
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const r = await fetch('/api/user/connections', { cache: 'no-store' });
        const j = await r.json();
        const entry = j?.connections?.espn?.leagues?.find((l: any) => l.leagueId === leagueId);
        if (entry?.myTeam) {
          setAddedLeagues((prev) => prev.map((l) => l.leagueId === leagueId ? { ...l, myTeam: entry.myTeam } : l));
          if (pendingTeamPicker === leagueId) setPendingTeamPicker(null);
          clearInterval(iv);
        }
      } catch {}
      if (tries >= 12) clearInterval(iv); // give up after ~36s; manual pick remains
    }, 3000);
  }

  // On load, kick auto-detection for any already-added relay leagues missing a team.
  useEffect(() => {
    const needTeam = addedLeagues.filter((l) => l.relay && !l.myTeam);
    if (needTeam.length > 0) {
      triggerResync();
      needTeam.forEach((l) => pollForAutoTeam(l.leagueId));
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-pitch-900 rounded-xl border border-pitch-700 shadow-lg shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-pitch-700/60 flex items-center gap-3">
        <div className="w-9 h-9 bg-[#E8002D] rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[10px]">ESPN</span>
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">ESPN Fantasy</h3>
          <p className="text-xs text-gray-500">{extensionPresent ? 'Auto-detected, no ID needed' : 'Set up once, synced everywhere'}</p>
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
        {/* Extension status / install prompt — the one-click path for private leagues */}
        {extensionPresent ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-300/90">
              FBL extension active: private leagues sync automatically.
            </span>
          </div>
        ) : (
          <div className="px-3 py-3 rounded-lg bg-pitch-800 border border-pitch-700/60 space-y-1.5">
            <p className="text-sm font-semibold text-gray-200">Sync once, see your leagues everywhere</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              No extension needed: use the one-click sync below. Set it up once on a
              computer and your leagues stay synced everywhere, even on your phone.
              Public leagues just need the league ID below.
            </p>
            {ESPN_EXTENSION_STORE_URL ? (
              <a
                href={ESPN_EXTENSION_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-1 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span className="inline-flex items-center gap-1">Get the FBL extension <ArrowRight className="w-3 h-3" /></span>
              </a>
            ) : (
              <p className="text-[11px] text-gray-600 mt-1">Prefer an install? Browser extension coming soon.</p>
            )}

            {/* Primary no-install path: works on any desktop browser */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowBookmarklet((v) => !v)}
                aria-expanded={showBookmarklet}
                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
              >
                <span className={`text-[10px] transition-transform ${showBookmarklet ? 'rotate-90' : ''}`}>▶</span>
                Set up one-click sync
              </button>
              {showBookmarklet && (
                <div className="mt-3 pl-3 border-l-2 border-pitch-700">
                  <EspnBookmarklet />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guided steps: extension is on but we haven't detected leagues yet */}
        {extensionPresent
          && addedLeagues.length === 0
          && discoveredLeagues.filter((d) => !addedLeagues.some((l) => l.leagueId === d.leagueId)).length === 0 && (
          <div className="rounded-lg border border-pitch-700 bg-pitch-800/50 p-4 space-y-3">
            <p className="text-sm font-semibold text-white">Let&apos;s find your ESPN leagues</p>
            <ol className="space-y-2 text-xs text-gray-400">
              <li className="flex gap-2"><span className="text-accent font-bold shrink-0">1.</span> Open ESPN Fantasy (make sure you&apos;re logged in).</li>
              <li className="flex gap-2"><span className="text-accent font-bold shrink-0">2.</span> Click into each league you want to add. That&apos;s how we pull it in.</li>
              <li className="flex gap-2"><span className="text-accent font-bold shrink-0">3.</span> Come back to this page and your leagues show up below automatically.</li>
            </ol>
            <div className="flex items-center gap-3 pt-1 flex-wrap">
              <a
                href="https://www.espn.com/fantasy/football/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-[#E8002D] hover:bg-[#c4002a] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
              >
                <span className="inline-flex items-center gap-1.5">Open ESPN <ArrowRight className="w-3.5 h-3.5" /></span>
              </a>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-pulse" /> Watching for your leagues…
              </span>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Know your league ID? Add it manually instead
            </button>
          </div>
        )}

        {/* Discovered leagues (auto-detected by extension) */}
        {discoveredLeagues.filter((d) => !addedLeagues.some((l) => l.leagueId === d.leagueId)).length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">Detected from Extension</p>
            {discoveredLeagues
              .filter((d) => !addedLeagues.some((l) => l.leagueId === d.leagueId))
              .map((d) => (
                <div
                  key={d.leagueId}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-pitch-800 border border-blue-500/20"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-300 truncate">{d.name ?? `League ${d.leagueId}`}</div>
                    <div className="text-xs text-blue-400/70">{d.season} season</div>
                  </div>
                  <button
                    onClick={() => addLeagueById(d.leagueId, d.name)}
                    disabled={connecting}
                    className="shrink-0 flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-1 transition-colors disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              ))}
          </div>
        )}

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
                    {l.leagueName ?? `League ${l.leagueId}`}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {l.relay && (
                      <span className="text-xs text-blue-400/80">Syncing via FBL Extension</span>
                    )}
                    {l.myTeam ? (
                      <div className="flex items-center gap-1">
                        <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-400">{l.myTeam.teamName}</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPendingTeamPicker(l.leagueId); if (teamPickerTeams.length === 0) loadTeamPicker(l.leagueId); }}
                        className="text-xs text-accent hover:text-accent-soft transition-colors"
                      >
                        <span className="inline-flex items-center gap-1">Pick your team <ArrowRight className="w-3 h-3" /></span>
                      </button>
                    )}
                  </div>
                </div>
                <CommissionerToggle platform="espn" leagueId={l.leagueId} />
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
            ) : addedLeagues.find(l => l.leagueId === pendingTeamPicker)?.relay ? (
              <div className="px-4 py-4 space-y-2 text-center">
                <p className="text-sm text-gray-400">Teams not synced yet.</p>
                <p className="text-xs text-gray-600">
                  Open your{' '}
                  <a
                    href={`https://fantasy.espn.com/football/team?leagueId=${pendingTeamPicker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    ESPN league page
                  </a>
                  {' '}with the extension active, then click Retry.
                </p>
                <button
                  onClick={() => loadTeamPicker(pendingTeamPicker)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <span className="inline-flex items-center gap-1">Retry <ArrowRight className="w-3 h-3" /></span>
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-sm text-gray-500">No teams found.</div>
            )}
          </div>
        )}

        {/* Add league button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {connected ? 'Add another league' : 'Add an ESPN league'}
          </button>
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="space-y-3 border border-pitch-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">Add ESPN League</span>
              <button onClick={() => { setShowAddForm(false); setError(null); }} className="text-gray-600 hover:text-gray-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">League ID</label>
              <input
                type="text"
                value={inputLeagueId}
                onChange={(e) => setInputLeagueId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !showPrivateFields && addLeague()}
                placeholder="e.g. 12345678"
                className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
              />
              <p className="text-[11px] text-gray-600 mt-1.5">
                Find it in your ESPN league&apos;s web address: <span className="font-mono text-gray-500">…/league?leagueId=</span><span className="font-mono text-gray-400">12345678</span>
              </p>
            </div>

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
                    Open ESPN Fantasy → DevTools → Application → Cookies → espn.com, copy{' '}
                    <code className="font-mono text-gray-300">espn_s2</code> and{' '}
                    <code className="font-mono text-gray-300">SWID</code>.
                  </p>
                  <div>
                    <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">espn_s2</label>
                    <input
                      type="password"
                      value={inputEspnS2}
                      onChange={(e) => setInputEspnS2(e.target.value)}
                      placeholder="espn_s2 cookie value"
                      className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold tracking-wider text-gray-500 uppercase mb-1.5">SWID</label>
                    <input
                      type="text"
                      value={inputSwid}
                      onChange={(e) => setInputSwid(e.target.value)}
                      placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"
                      className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              onClick={addLeague}
              disabled={connecting || !inputLeagueId.trim()}
              className="w-full bg-[#E8002D] hover:bg-[#c4002a] text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm disabled:opacity-50 tracking-wide"
            >
              {connecting ? 'Connecting...' : 'Connect ESPN League'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
