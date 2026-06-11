"use client";
// Trophy Case: champions by year for the selected league, pulled from real
// platform history (SEASON_FEATURES_PLAN.md #4). Self-fetching; hides itself
// for leagues with no recorded past (first-year leagues).

import { useState, useEffect } from "react";
import { Trophy, Crown } from "lucide-react";

type Champion = { season: number; teamName: string; ownerName: string | null };

export default function TrophyCase({
  platform,
  leagueKey,
}: {
  platform: "yahoo" | "sleeper" | "espn";
  leagueKey: string;
}) {
  const [champions, setChampions] = useState<Champion[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChampions(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/league-history?platform=${platform}&leagueKey=${encodeURIComponent(leagueKey)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!cancelled) setChampions(data?.ok && Array.isArray(data.champions) ? data.champions : []);
      } catch {
        if (!cancelled) setChampions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [platform, leagueKey]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden animate-pulse">
        <div className="px-6 py-4 border-b border-pitch-700/60">
          <div className="h-4 w-32 bg-pitch-800 rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-pitch-700/40 last:border-0">
            <div className="h-5 w-5 bg-pitch-800 rounded" />
            <div className="h-4 w-12 bg-pitch-800 rounded" />
            <div className="h-4 flex-1 bg-pitch-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!champions || champions.length === 0) return null;

  // Dynasty check: most titles in the case.
  const titleCounts = new Map<string, number>();
  for (const c of champions) {
    const key = c.ownerName ?? c.teamName;
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const [dynastyName, dynastyTitles] = [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
      <div className="px-6 py-4 border-b border-pitch-700/60 flex items-center gap-3 flex-wrap">
        <h2 className="font-bold text-xs tracking-[0.18em] uppercase text-gray-300">Trophy Case</h2>
        <span className="text-xs text-gray-600">· champions by year</span>
        {dynastyTitles > 1 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-accent border border-accent-strong/30 rounded-md px-2 py-1">
            <Crown className="w-3 h-3" aria-hidden="true" />
            {dynastyName} · {dynastyTitles} titles
          </span>
        )}
      </div>

      <div className="divide-y divide-pitch-700/40">
        {champions.map((c) => (
          <div key={c.season} className="flex items-center gap-4 px-6 py-3.5">
            <Trophy className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <span className="font-display text-xl leading-none text-gray-500 w-14 tabular-nums">
              {c.season}
            </span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-sm text-gray-100 truncate block">{c.teamName}</span>
              {c.ownerName && c.ownerName !== c.teamName && (
                <span className="text-xs text-gray-600">{c.ownerName}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
