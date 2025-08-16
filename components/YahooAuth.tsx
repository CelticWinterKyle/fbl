"use client";
import { useEffect, useState, useRef } from "react";

type Status = {
  ok: boolean;
  userId?: string;
  reason?: string | null;
  tokenPreview?: { access_token: string } | null;
  userLeague?: string | null;
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
  const connected = !!status?.tokenPreview && status.reason !== 'no_token';

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
        if (allLeagues.length === 1 && !status?.userLeague) {
          // Auto select single league
          await pickLeague(allLeagues[0].league_key);
        }
      } else setError(j.error || 'Failed to load leagues');
    } catch(e:any) { setError(e?.message || 'Failed to load leagues'); }
    finally { setLoading(false); }
  }

  async function pickLeague(league_key: string) {
    setPicking(true);
    try {
      await fetch('/api/yahoo/user/select-league', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ league_key }) });
      await refresh();
    } finally { setPicking(false); }
  }

  async function disconnect() {
    await fetch('/api/yahoo/user/disconnect', { method: 'POST' });
    setGames([]);
    await refresh();
  }

  useEffect(() => { refresh(); }, []);

  // When connected (token present) and no league selected, auto load leagues once
  useEffect(() => {
    if (status && !status.userLeague && connected && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      loadLeagues();
    }
  }, [status, connected]);

  if (!status) return <button className="btn-gray" disabled>…</button>;

  if (!connected) {
    return <a className="btn-gray" href="/api/yahoo/login">Connect Yahoo</a>;
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
