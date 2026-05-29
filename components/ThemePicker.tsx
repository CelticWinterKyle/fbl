'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { NFL_TEAMS, accentVarsForTeam } from '@/lib/teamThemes';

// Lets the user theme the app's accent color to their favorite NFL team.
// Applies instantly (sets the --accent CSS vars on <html>) and persists to their
// account. The dark base + fonts are untouched — only the accent changes.
export default function ThemePicker({ currentTeam }: { currentTeam: string | null }) {
  const [team, setTeam] = useState<string | null>(currentTeam);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function apply(id: string | null) {
    setTeam(id);
    setOpen(false);
    // Instant visual switch.
    const el = document.documentElement;
    const vars = accentVarsForTeam(id);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    } else {
      el.style.removeProperty('--accent');
      el.style.removeProperty('--accent-soft');
      el.style.removeProperty('--accent-strong');
    }
    // Persist (cross-device).
    fetch('/api/user/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: id }),
    }).catch(() => {});
  }

  const selected = NFL_TEAMS.find((t) => t.id === team);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose team theme"
        aria-expanded={open}
        title="Team theme"
        className="flex items-center gap-1.5 rounded-lg border border-pitch-700 bg-pitch-900 px-2 py-1.5 hover:bg-pitch-800 transition-colors"
      >
        <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: 'rgb(var(--accent))' }} />
        <svg className="w-3 h-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 max-h-80 overflow-y-auto rounded-xl border border-pitch-700 bg-pitch-900 shadow-2xl shadow-black/50 z-50 py-1.5">
          <p className="px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">Team Theme</p>
          <button
            onClick={() => apply(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-pitch-800 transition-colors ${!team ? 'text-white' : 'text-gray-400'}`}
          >
            <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: '#fbbf24' }} />
            Default (Amber)
            {!team && <Check className="ml-auto w-4 h-4 text-accent" />}
          </button>
          {NFL_TEAMS.map((t) => (
            <button
              key={t.id}
              onClick={() => apply(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-pitch-800 transition-colors ${team === t.id ? 'text-white' : 'text-gray-400'}`}
            >
              <span className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: t.accent }} />
              <span className="truncate">{t.name}</span>
              {team === t.id && <Check className="ml-auto w-4 h-4 text-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
      {/* keep `selected` referenced for clarity / future label use */}
      <span className="sr-only">{selected?.name ?? 'Default theme'}</span>
    </div>
  );
}
