"use client";
// Cross-league waiver intel (SEASON_FEATURES_PLAN.md #7): the players the
// fantasy world is adding right now, tagged with availability in YOUR
// leagues. Lives at the bottom of My Team; hides itself when trending data
// is unavailable.

import { useState, useEffect } from "react";
import { Flame } from "lucide-react";

type Availability = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  available: boolean | null;
};

type TrendingRow = {
  id: string;
  name: string;
  position: string;
  team: string;
  adds: number;
  availability: Availability[];
};

const POS_COLOR: Record<string, string> = {
  QB: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  RB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  WR: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  TE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  K: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  DEF: "bg-red-500/15 text-red-400 border-red-500/30",
};

function fmtAdds(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function PickupsPanel({
  leagueNames,
}: {
  /** leagueId -> display name, from the leagues the page already loaded */
  leagueNames: Record<string, string>;
}) {
  const [rows, setRows] = useState<TrendingRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pickups", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setRows(data?.ok && Array.isArray(data.players) ? data.players : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden animate-pulse">
        <div className="px-6 py-4 border-b border-pitch-700/60">
          <div className="h-4 w-40 bg-pitch-800 rounded" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-pitch-700/40 last:border-0">
            <div className="h-4 w-10 bg-pitch-800 rounded" />
            <div className="h-4 flex-1 bg-pitch-800 rounded" />
            <div className="h-4 w-16 bg-pitch-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
      <div className="px-6 py-4 border-b border-pitch-700/60 flex items-center gap-3 flex-wrap">
        <h2 className="font-bold text-xs tracking-[0.18em] uppercase text-gray-300 inline-flex items-center gap-2">
          <Flame className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          Trending Pickups
        </h2>
        <span className="text-xs text-gray-600">· most added in the last 24 hours, across all of fantasy</span>
      </div>

      <div className="divide-y divide-pitch-700/40">
        {rows.map((p) => (
          <div key={p.id} className="px-6 py-3.5 flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center justify-center text-[10px] font-bold tracking-wider border rounded-md px-1.5 py-0.5 w-11 shrink-0 ${
                POS_COLOR[p.position] ?? POS_COLOR.K
              }`}
            >
              {p.position}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-gray-100">{p.name}</span>
              <span className="text-xs text-gray-600 ml-2">{p.team}</span>
            </div>
            <span className="font-mono text-xs text-accent shrink-0" title="Adds in the last 24 hours">
              +{fmtAdds(p.adds)} adds
            </span>
            <div className="flex items-center gap-1.5 flex-wrap basis-full sm:basis-auto">
              {p.availability.map((a) => {
                const name = leagueNames[a.leagueId] ?? a.leagueId;
                if (a.available === true) {
                  return (
                    <span key={a.leagueId} className="text-[10px] font-bold tracking-wider uppercase text-accent border border-accent-strong/40 rounded-md px-2 py-0.5">
                      Available · {name}
                    </span>
                  );
                }
                if (a.available === false) {
                  return (
                    <span key={a.leagueId} className="text-[10px] font-bold tracking-wider uppercase text-gray-600 border border-pitch-700 rounded-md px-2 py-0.5">
                      Taken · {name}
                    </span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-3 border-t border-pitch-700/50 text-[10px] text-gray-600 font-bold tracking-wider uppercase">
        Add/drop happens on the platform. Availability refreshes about every 30 minutes.
      </div>
    </div>
  );
}
