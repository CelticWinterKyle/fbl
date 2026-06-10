'use client';

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

interface Props {
  platform: 'yahoo' | 'sleeper' | 'espn';
  leagueId: string;
}

/**
 * Small, quiet toggle pill marking the user as commissioner of a league.
 * Loads its initial state once on mount and POSTs flips optimistically.
 */
export default function CommissionerToggle({ platform, leagueId }: Props) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/user/commissioner?platform=${platform}&leagueId=${encodeURIComponent(leagueId)}`,
      { cache: 'no-store' }
    )
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.ok) setOn(j.isCommissioner === true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [platform, leagueId]);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    try {
      const r = await fetch('/api/user/commissioner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, leagueId, value: next }),
      });
      const j = await r.json();
      if (!j.ok) setOn(!next); // revert on failure
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={on ? 'You are marked as commissioner of this league' : 'Mark yourself as commissioner of this league'}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900 ${
        on
          ? 'border-accent-strong/50 bg-accent-strong/15 text-accent'
          : 'border-pitch-600 text-gray-600 hover:text-gray-400 hover:border-pitch-500'
      }`}
    >
      <Shield className="w-2.5 h-2.5" />
      Commissioner
    </button>
  );
}
