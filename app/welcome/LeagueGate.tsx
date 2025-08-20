'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LeagueGate() {
  const [hasLeague, setHasLeague] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const r = await fetch('/api/yahoo/status', { cache:'no-store' });
        const j = await r.json();
        // More lenient check - if we have a userLeague, that's good enough
        if (mounted) setHasLeague(!!j.userLeague);
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
