// Public share page for a single matchup. Display-only: renders exactly what is
// in the URL (no user data is fetched), with an OG image generated from the same
// params so links unfurl as a score card.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function clean(v: string | string[] | undefined, fallback: string): string {
  const s = (Array.isArray(v) ? v[0] : v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, 60);
}

function readParams(searchParams: SearchParams) {
  return {
    teamA: clean(searchParams.teamA, "Team A"),
    teamB: clean(searchParams.teamB, "Team B"),
    scoreA: clean(searchParams.scoreA, "0.0"),
    scoreB: clean(searchParams.scoreB, "0.0"),
    league: clean(searchParams.league, "Fantasy Football"),
    week: clean(searchParams.week, ""),
  };
}

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const p = readParams(searchParams);
  const title = `${p.teamA} ${p.scoreA} vs ${p.teamB} ${p.scoreB}`;
  const description = p.week
    ? `${p.league}, Week ${p.week}. Track all your leagues in one place.`
    : `${p.league}. Track all your leagues in one place.`;
  const og = new URLSearchParams({
    teamA: p.teamA,
    teamB: p.teamB,
    scoreA: p.scoreA,
    scoreB: p.scoreB,
    league: p.league,
  });
  if (p.week) og.set("week", p.week);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/matchup?${og.toString()}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function ShareMatchupPage({ searchParams }: { searchParams: SearchParams }) {
  const p = readParams(searchParams);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 space-y-8">
      <div className="w-full max-w-2xl rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        {/* League + week header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/60">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase truncate">
            {p.league}
          </span>
          {p.week && (
            <span className="text-xs font-bold tracking-[0.15em] text-accent shrink-0 uppercase">
              Week {p.week}
            </span>
          )}
        </div>

        {/* Score hero */}
        <div className="px-6 py-10">
          <div className="flex items-center gap-3 sm:gap-8">
            <div className="flex-1 text-center min-w-0">
              <div className="font-semibold text-gray-200 text-sm mb-3 truncate px-1 leading-snug">
                {p.teamA}
              </div>
              <div
                className="font-display leading-none tabular-nums text-accent"
                style={{ fontSize: "clamp(3rem, 9vw, 5rem)" }}
              >
                {p.scoreA}
              </div>
            </div>
            <span className="text-pitch-500 text-xs font-bold tracking-widest shrink-0">VS</span>
            <div className="flex-1 text-center min-w-0">
              <div className="font-semibold text-gray-400 text-sm mb-3 truncate px-1 leading-snug">
                {p.teamB}
              </div>
              <div
                className="font-display leading-none tabular-nums text-gray-400"
                style={{ fontSize: "clamp(3rem, 9vw, 5rem)" }}
              >
                {p.scoreB}
              </div>
            </div>
          </div>
        </div>

        {/* Brand footer */}
        <div className="px-6 py-3 border-t border-pitch-700/60 text-center">
          <span className="text-[11px] font-bold tracking-[0.25em] text-gray-600 uppercase">
            League Blitz
          </span>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center space-y-4">
        <p className="text-gray-400 text-sm">Track all your leagues in one place.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm"
        >
          Get started free
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </main>
  );
}
