"use client";
import { useEffect, useState, useRef } from "react";

type Status = {
  ok: boolean;
  userId?: string;
  reason?: string | null;
  tokenPreview?: { access_token: string } | null;
  userLeague?: string | null;
  tokenReady?: boolean; // new from status endpoint
  leagueReady?: boolean; // new from status endpoint
};

type LeagueGame = { game_key: string; leagues: { name: string; league_key: string; league_id?: string }[] };

export default function YahooAuth() {
  const [status, setStatus] = useState<Status | null>(null);
  const [games, setGames] = useState<LeagueGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Advanced (debug) manual league key entry (hidden normally)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualKey, setManualKey] = useState("");
  const [validating, setValidating] = useState(false);
  const autoLoadedRef = useRef(false);
  const connected = !!status?.tokenReady && status.reason !== 'no_token';
  const readyForLeaguePick = connected && !status?.userLeague;

  async function refresh() {
    const r = await fetch('/api/yahoo/status', { cache: 'no-store' });
    const j = await r.json();
    setStatus(j);
  }

  async function loadLeagues() {
    setLoading(true);
    try {
      setError(null);
      const r = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) {
        const got = j.games || [];
        setGames(got);
        // Flatten leagues
        const allLeagues = got.flatMap((g:any)=> (g.leagues||[]));
        // Removed auto-selection - always let user choose their league
        // if (allLeagues.length === 1 && !status?.userLeague) {
        //   // Auto select single league
        //   await pickLeague(allLeagues[0].league_key);
        // }
      } else {
        if (j.reason === 'not_authenticated' || j.error?.includes('authentication')) {
          // If auth failed, wait a moment and refresh status, then retry
          console.log('[YahooAuth] Auth failed, refreshing status and retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          await refresh();
          await new Promise(resolve => setTimeout(resolve, 500));
          // One retry attempt
          const retryR = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
          const retryJ = await retryR.json();
          if (retryJ.ok) {
            const got = retryJ.games || [];
            setGames(got);
          } else {
            setError(retryJ.error || 'Failed to load leagues after retry');
          }
        } else {
          setError(j.error || 'Failed to load leagues');
        }
      }
    } catch(e:any) { setError(e?.message || 'Failed to load leagues'); }
    finally { setLoading(false); }
  }

  async function pickLeague(league_key: string) {
    setPicking(true);
    try {
      // Optimistic local update so UI can react instantly
      setStatus(s => s ? { ...s, userLeague: league_key } : s);
      // Fire a global event so other components (dashboard) can immediately load data
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fbl:league-selected', { detail: { leagueKey: league_key } }));
      }
      await fetch('/api/yahoo/user/select-league', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ league_key }) });
      // Refresh to confirm server persisted league & pick up any derived flags
      await refresh();
    } finally { setPicking(false); }
  }

  async function disconnect() {
    await fetch('/api/yahoo/user/disconnect', { method: 'POST' });
    setGames([]);
    await refresh();
  }

  useEffect(() => { 
    refresh();
    
    // Check if we just returned from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      // Clear the URL parameter and force a status refresh
      window.history.replaceState({}, '', window.location.pathname);
      // Give a moment for tokens to be ready, then refresh multiple times
      setTimeout(() => refresh(), 500);
      setTimeout(() => refresh(), 1500);
      setTimeout(() => refresh(), 3000);
    }
  }, []);

  // Also refresh status periodically when not connected to catch OAuth completion
  useEffect(() => {
    if (!connected && !status?.tokenReady) {
      const interval = setInterval(() => {
        refresh();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [connected, status?.tokenReady]);

  // When connected (token present) and no league selected, auto load leagues once
  useEffect(() => {
    if (readyForLeaguePick && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      loadLeagues();
    }
  }, [readyForLeaguePick]);

  if (!status) return <button className="btn-gray" disabled>…</button>;

  if (!connected) {
    // Distinguish between "no token yet" and actual need to click connect
    if (status?.reason === 'no_token' || !status?.tokenReady) {
      return (
        <div className="flex flex-col gap-2">
          <a className="btn-gray" href="/api/yahoo/login">Connect Yahoo</a>
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-500">
              Debug: reason={status?.reason}, tokenReady={status?.tokenReady?.toString()}
            </div>
          )}
        </div>
      );
    }
    return <button className="btn-gray" disabled>Connecting…</button>;
  }

  const leagueLabel = status.userLeague ? `League: ${status.userLeague.split('.l.')[1]}` : 'Pick League';

  return (
    <div className="flex items-center gap-2">
  {!status.userLeague && (
        <button className="btn-gray" onClick={() => { loadLeagues(); }} disabled={loading}>{loading ? 'Loading…' : leagueLabel}</button>
      )}
      {status.userLeague && <span className="text-xs text-green-300">{leagueLabel}</span>}
  {(!status.userLeague && games.length > 0) && (
        <select className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600" onChange={e => { if (e.target.value) pickLeague(e.target.value); }} disabled={picking} defaultValue="">
          <option value="" disabled>{picking ? 'Saving…' : 'Select league'}</option>
          {games.flatMap(g => g.leagues.map(l => (
            <option key={l.league_key} value={l.league_key}>{l.name || l.league_key}</option>
          )))}
        </select>
      )}
  {(!status.userLeague && !games.length && !loading) && (
        <span className="text-xs text-yellow-300">No leagues found yet.</span>
      )}
  {(!status.userLeague && !games.length) && (
        <button className="btn-gray" onClick={()=>loadLeagues()} disabled={loading}>{loading? 'Loading…':'Retry'}</button>
      )}
      {process.env.NEXT_PUBLIC_SHOW_ADVANCED === '1' && (
        <button className="text-xs underline text-gray-400" type="button" onClick={()=>setShowAdvanced(s=>!s)}>{showAdvanced? 'Hide Adv':'Advanced'}</button>
      )}
      {showAdvanced && !status.userLeague && (
        <div className="flex items-center gap-1">
          <input className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600 w-40" placeholder="league key" value={manualKey} onChange={e=>setManualKey(e.target.value)} />
          <button className="btn-gray" disabled={!manualKey || validating} onClick={async ()=>{
            setValidating(true); setError(null);
            try {
              const r = await fetch('/api/yahoo/user/validate-league', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ league_key: manualKey }) });
              const j = await r.json();
              if (j.ok) { setManualKey(''); await refresh(); }
              else setError(j.error||'Failed');
            } catch(e:any){ setError(e?.message||'Failed'); }
            finally { setValidating(false); }
          }}>{validating? '…':'Save'}</button>
        </div>
      )}
      {error && <span className="text-xs text-red-400 max-w-[12rem] truncate" title={error}>Error</span>}
      <button className="btn-gray" onClick={disconnect}>Disconnect</button>
    </div>
  );
}
