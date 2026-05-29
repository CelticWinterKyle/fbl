'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { buildEspnBookmarklet } from '@/lib/espnBookmarklet';

// No-install ESPN connector for users who can't use the extension (Firefox,
// Safari, or anyone who'd rather not install anything). Generates a personalized
// bookmarklet the user drags to their bookmarks bar, then clicks on their ESPN
// league page. Desktop only (bookmarklets don't work on phones).
export default function EspnBookmarklet() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/espn/relay-token', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok || !j.token) { setState('error'); return; }
        // React refuses to render javascript: hrefs — set it on the DOM node
        // directly so the link stays draggable.
        if (linkRef.current) linkRef.current.setAttribute('href', buildEspnBookmarklet(j.token));
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <ol className="text-xs text-gray-500 space-y-1.5 list-decimal pl-4">
        <li>Drag the button below to your bookmarks bar.</li>
        <li>Go to your ESPN fantasy <span className="text-gray-300">league</span> page (the address should include <code className="text-gray-400">leagueId=</code>).</li>
        <li>Click the bookmark. Repeat on each league you want to add.</li>
      </ol>

      {state === 'error' ? (
        <p className="text-xs text-red-400">Couldn&apos;t generate your bookmarklet. Refresh the page and try again.</p>
      ) : (
        <a
          ref={linkRef}
          href="#"
          draggable
          onClick={(e) => e.preventDefault()}
          title="Drag me to your bookmarks bar"
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold tracking-wide transition-colors ${
            state === 'ready'
              ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15 cursor-grab'
              : 'border-pitch-700 bg-pitch-800 text-gray-600 cursor-wait'
          }`}
        >
          <ArrowUp className="w-4 h-4" aria-hidden="true" />
          {state === 'ready' ? 'Connect ESPN to FBL' : 'Preparing…'}
        </a>
      )}

      <p className="text-[11px] text-gray-600">
        Works in any desktop browser — no install. (On a phone? Set this up once on a computer and
        your leagues stay synced to your account everywhere.)
      </p>
    </div>
  );
}
