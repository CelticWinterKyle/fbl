'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

type Player = {
  name: string;
  position: string;
  team: string | null;
  points: number;
  actual: number;
  projection: number;
  projectedPoints: number;
  status: string | null;
};

type RosterInsight = {
  weeklyOutlook: string | null;
  startSit: string[];
  injuryAlerts: string[];
  keyTakeaway: string | null;
  stackNote: string | null;
};

interface Props {
  platform: 'yahoo' | 'sleeper' | 'espn';
  leagueId: string;
  teamKey: string;
  teamName: string;
  week: number;
  starters: Player[];
  bench: Player[];
}

export default function AnalyzeRoster({ teamName, week, starters, bench }: Props) {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState<RosterInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function load() {
    if (open && data) { setOpen(false); return; }
    setOpen(true);
    if (data) return;

    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/analyze-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName, week, starters, bench }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error === 'rate_limited' ? 'Analyze limit reached (15/hr).' : (j.error ?? 'Analysis failed.'));
      setData(j.insight as RosterInsight);
    } catch (e: any) {
      setErr(e.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-pitch-700/40">
      {/* Trigger */}
      <button
        onClick={load}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold tracking-[0.15em] uppercase transition-colors hover:bg-pitch-800/40"
      >
        <span className="flex items-center gap-1.5 text-amber-400/80">
          <Sparkles className="w-3 h-3" />
          Analyze My Roster
        </span>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
          : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
        }
      </button>

      {/* Panel */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-pitch-700/30">
          {loading && (
            <div className="pt-3 text-sm text-gray-500 animate-pulse">Analyzing your roster…</div>
          )}
          {err && (
            <div className="pt-3 text-sm text-red-400/80">{err}</div>
          )}

          {data && (
            <div className="pt-3 space-y-3">
              {/* Key takeaway — most prominent */}
              {data.keyTakeaway && (
                <div className="rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-2.5">
                  <div className="text-[9px] font-bold tracking-[0.2em] text-amber-500 uppercase mb-1">Key Action</div>
                  <p className="text-sm text-amber-100/90">{data.keyTakeaway}</p>
                </div>
              )}

              {/* Weekly outlook */}
              {data.weeklyOutlook && (
                <RosterTile title="Weekly Outlook" icon="📊">
                  <p className="text-sm text-gray-300">{data.weeklyOutlook}</p>
                </RosterTile>
              )}

              {/* Start/Sit */}
              {data.startSit.length > 0 && (
                <RosterTile title="Start / Sit" icon="⚖️">
                  <ul className="space-y-1">
                    {data.startSit.map((s, i) => (
                      <li key={i} className="text-sm text-gray-300">• {s}</li>
                    ))}
                  </ul>
                </RosterTile>
              )}

              {/* Injury alerts */}
              {data.injuryAlerts.length > 0 && (
                <RosterTile title="Injury Alerts" icon="🚑">
                  <ul className="space-y-1">
                    {data.injuryAlerts.map((s, i) => (
                      <li key={i} className="text-sm text-red-300/80">• {s}</li>
                    ))}
                  </ul>
                </RosterTile>
              )}

              {/* Stack note */}
              {data.stackNote && (
                <RosterTile title="Stack" icon="🔗">
                  <p className="text-sm text-gray-300">{data.stackNote}</p>
                </RosterTile>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RosterTile({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-pitch-700/60 bg-pitch-800/60 px-3 py-2.5">
      <div className="text-[9px] font-bold tracking-[0.2em] text-gray-500 uppercase flex items-center gap-1.5 mb-1.5">
        <span>{icon}</span><span>{title}</span>
      </div>
      {children}
    </div>
  );
}
