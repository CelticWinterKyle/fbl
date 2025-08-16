"use client";
import { useEffect, useState } from "react";

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
      if (j.ok) setGames(j.games || []); else setError(j.error || 'Failed to load leagues');
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

  if (!status) return <button className="btn-gray" disabled>…</button>;

  if (!connected) {
    return <a className="btn-gray" href="/api/yahoo/login">Connect Yahoo</a>;
  }

  const leagueLabel = status.userLeague ? `League: ${status.userLeague.split('.l.')[1]}` : 'Pick League';

  return (
    <div className="flex items-center gap-2">
      {!status.userLeague && (
        <button className="btn-gray" onClick={() => { if (!games.length) loadLeagues(); }} disabled={loading}>{loading ? 'Loading…' : leagueLabel}</button>
      )}
      {status.userLeague && <span className="text-xs text-green-300">{leagueLabel}</span>}
      {(!status.userLeague && games.length > 0) && (
        <select className="bg-gray-800 text-xs px-2 py-1 rounded border border-gray-600" onChange={e => { if (e.target.value) pickLeague(e.target.value); }} disabled={picking} defaultValue="">
          <option value="" disabled>{picking ? 'Saving…' : 'Select league'}</option>
          {games.flatMap(g => g.leagues.map(l => (
            <option key={l.league_key} value={l.league_key}>{l.name}</option>
          )))}
        </select>
      )}
      {error && !games.length && <span className="text-xs text-red-400 max-w-[12rem] truncate" title={error}>Error</span>}
      <button className="btn-gray" onClick={disconnect}>Disconnect</button>
    </div>
  );
}
