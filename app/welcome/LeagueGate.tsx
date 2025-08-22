'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Status = {
  ok: boolean;
  userId?: string;
  tokenReady?: boolean;
  userLeague?: string;
};

type LeagueGame = { 
  game_key: string; 
  leagues: { name: string; league_key: string; league_id?: string }[] 
};

export default function LeagueGate() {
  const [status, setStatus] = useState<Status | null>(null);
  const [games, setGames] = useState<LeagueGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checking, setChecking] = useState(true);

  async function checkStatus() {
    try {
      const r = await fetch('/api/yahoo/status', { cache: 'no-store' });
      const j = await r.json();
      console.log('[LeagueGate] Status:', j);
      setStatus(j);
      return j;
    } catch (error) {
      console.error('[LeagueGate] Status check failed:', error);
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function loadLeagues() {
    if (loading) return;
    setLoading(true);
    try {
      console.log('[LeagueGate] Loading leagues...');
      const r = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
      const j = await r.json();
      console.log('[LeagueGate] Leagues response:', j);
      if (j.ok) {
        const got = j.games || [];
        setGames(got);
      }
    } catch (error) {
      console.error('[LeagueGate] Failed to load leagues:', error);
    } finally {
      setLoading(false);
    }
  }

  async function selectLeague(league_key: string) {
    setSelecting(true);
    try {
      await fetch('/api/yahoo/user/select-league', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ league_key }) 
      });
      // Refresh status to get updated league
      await checkStatus();
      // Fire event for header component
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fbl:league-selected', { detail: { leagueKey: league_key } }));
      }
    } finally {
      setSelecting(false);
    }
  }

  useEffect(() => {
    checkStatus();
    
    // Listen for league selection events from header
    const onSelect = () => { checkStatus(); };
    window.addEventListener('fbl:league-selected', onSelect);
    return () => { window.removeEventListener('fbl:league-selected', onSelect); };
  }, []);

  // Auto-load leagues when authenticated
  useEffect(() => {
    if (status?.tokenReady && !status?.userLeague && games.length === 0) {
      loadLeagues();
    }
  }, [status?.tokenReady, status?.userLeague, games.length]);

  if (checking) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-500 mt-2">Checking authentication status...</p>
      </div>
    );
  }

  // Not authenticated yet
  if (!status?.tokenReady) {
    return (
      <div className="max-w-2xl mx-auto text-center mt-8">
        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6">
          <div className="text-gray-600">
            <span className="inline-block w-6 h-6 bg-gray-300 rounded-full text-gray-600 text-sm leading-6 mr-2">1</span>
            Connect your Yahoo Fantasy Sports account above to continue
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but no league selected
  if (!status?.userLeague) {
    return (
      <div className="max-w-2xl mx-auto text-center mt-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="mb-6">
            <div className="flex items-center justify-center mb-4">
              <span className="inline-block w-6 h-6 bg-green-500 text-white rounded-full text-sm leading-6 mr-2">✓</span>
              <span className="text-green-600 font-medium">Connected to Yahoo!</span>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Select Your Fantasy League
            </h2>
            <p className="text-gray-600">
              Choose which league you'd like to use with Family Business League
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mr-3"></div>
              <span className="text-gray-600">Loading your leagues...</span>
            </div>
          ) : games.length > 0 ? (
            <div className="space-y-3">
              {games.flatMap(g => g.leagues).map(league => (
                <button
                  key={league.league_key}
                  onClick={() => selectLeague(league.league_key)}
                  disabled={selecting}
                  className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors disabled:opacity-50"
                >
                  <div className="font-medium text-gray-900">{league.name}</div>
                  <div className="text-sm text-gray-500">League ID: {league.league_key.split('.l.')[1]?.split('.')[0]}</div>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-gray-500 mb-4">No leagues found yet.</p>
              <button
                onClick={loadLeagues}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Retry'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // League selected - ready to go!
  return (
    <div className="max-w-2xl mx-auto text-center mt-8">
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="mb-6">
          <div className="flex items-center justify-center mb-4">
            <span className="inline-block w-6 h-6 bg-green-500 text-white rounded-full text-sm leading-6 mr-2">✓</span>
            <span className="text-green-600 font-medium">League Selected!</span>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            You're All Set!
          </h2>
          <p className="text-gray-600">
            Ready to explore your Family Business League dashboard
          </p>
        </div>

        <Link 
          href="/dashboard"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 text-lg"
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
}
