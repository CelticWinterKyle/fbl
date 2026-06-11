// Public share page for a weekly recap. Display-only: renders exactly what is
// in the URL (no user data is fetched), with an OG image from the same params
// so links unfurl as a record card.

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
    record: clean(searchParams.record, "0-0"),
    leagues: clean(searchParams.leagues, "1"),
    top: clean(searchParams.top, ""),
    topPts: clean(searchParams.topPts, ""),
    week: clean(searchParams.week, ""),
  };
}

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const p = readParams(searchParams);
  const title = `${p.record} across ${p.leagues} ${p.leagues === "1" ? "league" : "leagues"}`;
  const description = p.week
    ? `Week ${p.week} fantasy recap. Track all your leagues in one place.`
    : "Weekly fantasy recap. Track all your leagues in one place.";
  const og = new URLSearchParams({ record: p.record, leagues: p.leagues });
  if (p.top) og.set("top", p.top);
  if (p.topPts) og.set("topPts", p.topPts);
  if (p.week) og.set("week", p.week);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/week?${og.toString()}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function ShareWeekPage({ searchParams }: { searchParams: SearchParams }) {
  const p = readParams(searchParams);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 space-y-8">
      <div className="w-full max-w-xl rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/60">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase">My Week</span>
          {p.week && (
            <span className="text-xs font-bold tracking-[0.15em] text-accent shrink-0 uppercase">
              Week {p.week}
            </span>
          )}
        </div>

        <div className="px-6 py-12 text-center">
          <div
            className="font-display leading-none tabular-nums text-accent"
            style={{ fontSize: "clamp(4rem, 16vw, 8rem)" }}
          >
            {p.record}
          </div>
          <p className="text-gray-400 mt-3">
            across {p.leagues} {p.leagues === "1" ? "league" : "leagues"}
          </p>
          {p.top && (
            <p className="text-sm text-gray-300 mt-5">
              <span className="text-gray-500">Top player:</span>{" "}
              <span className="font-semibold">{p.top}</span>
              {p.topPts && <span className="text-accent font-bold"> {p.topPts} pts</span>}
            </p>
          )}
        </div>

        <div className="px-6 py-3 border-t border-pitch-700/60 text-center">
          <span className="text-[11px] font-bold tracking-[0.25em] text-gray-600 uppercase">
            League Blitz
          </span>
        </div>
      </div>

      <div className="text-center space-y-4">
        <p className="text-gray-400 text-sm">All your leagues, one dashboard.</p>
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
