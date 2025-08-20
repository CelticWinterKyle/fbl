export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import YahooAuth from '@/components/YahooAuth';
import Link from 'next/link';

export default function WelcomePage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 text-center px-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Welcome to Family Business League</h1>
        <p className="text-gray-400 max-w-xl mx-auto">Connect your Yahoo account, pick your league, and then jump into your personalized dashboard with live matchups, standings, rosters, and AI insights.</p>
      </div>
      <div className="bg-gray-900/60 border border-gray-700 rounded-lg px-6 py-5 flex flex-col gap-4 w-full max-w-md shadow">
        <h2 className="text-lg font-semibold">Step 1: Connect Yahoo</h2>
        <YahooAuth />
        <p className="text-xs text-gray-500">After connecting, select your league below (if not auto-selected) and continue.</p>
      </div>
      <LeagueGate />
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';

function LeagueGate() {
  const [hasLeague, setHasLeague] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const r = await fetch('/api/yahoo/status', { cache:'no-store' });
        const j = await r.json();
        if (mounted) setHasLeague(!!j.userLeague && j.tokenReady);
      } finally { if (mounted) setChecking(false); }
    }
    check();
    const onSelect = (e:any) => { setHasLeague(true); };
    window.addEventListener('fbl:league-selected', onSelect);
    return () => { mounted = false; window.removeEventListener('fbl:league-selected', onSelect); };
  }, []);

  if (checking) return <div className="text-sm text-gray-500">Checking league...</div>;
  if (!hasLeague) return <div className="text-sm text-yellow-400">Step 2: Pick your league above to continue</div>;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm text-green-400">League selected. You're ready!</div>
      <Link href="/dashboard" className="btn-gray px-5 py-2">Go to Dashboard →</Link>
    </div>
  );
}
