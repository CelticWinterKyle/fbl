// ─── /demo ────────────────────────────────────────────────────────────────────
// Public, read-only sample of the product (SEASON_FEATURES_PLAN.md #2): a
// fictional user's Game Day across three platforms, plus rankings and the
// trophy case. Fully static: no auth, no fetches, every name invented. The
// point is letting July traffic SEE the product before the sign-up wall.

export const metadata = {
  title: "Demo | League Blitz",
  description:
    "See League Blitz in action: every fantasy league you play, Yahoo, Sleeper, and ESPN, live on one screen.",
};

import Link from "next/link";
import {
  Sparkles,
  Trophy,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import DemoLiveSim from "@/components/DemoLiveSim";

// ─── Fictional data (no real people, no real leagues) ─────────────────────────
// Matchup/lineup data lives in DemoLiveSim, which animates it client-side.

const RANKINGS = [
  { rank: 1, team: "Thunder Lizards", record: "8-2", pf: 1184.2, trend: "up" as const, award: "Top scorer wk 11" },
  { rank: 2, team: "Praise Gridiron", record: "7-3", pf: 1141.8, trend: "same" as const, award: null },
  { rank: 3, team: "Mahomes Alone", record: "6-4", pf: 1098.5, trend: "down" as const, award: null },
  { rank: 4, team: "Bye Week Energy", record: "6-4", pf: 1067.0, trend: "up" as const, award: "Lucky escape wk 10" },
];

const CHAMPIONS = [
  { year: 2025, team: "Praise Gridiron" },
  { year: 2024, team: "Thunder Lizards" },
  { year: 2023, team: "Mahomes Alone" },
  { year: 2022, team: "Thunder Lizards" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Sample banner ── */}
      <div className="rounded-xl border border-accent-strong/40 bg-accent-strong/10 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-accent tracking-wide uppercase">Sample league</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Everything below is fictional demo data. Your real leagues connect in about a minute.
          </p>
        </div>
        <Link
          href="/sign-up"
          className="bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2 px-5 rounded-lg text-sm tracking-wide transition-colors shrink-0"
        >
          <span className="inline-flex items-center gap-1.5">
            Connect your leagues free <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </div>

      {/* ── Game Day header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">GAME DAY</h1>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/30 border border-green-500/30 text-green-400 text-xs font-bold tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* ── AI summary sample ── */}
      <div className="rounded-xl border border-accent-strong/30 bg-accent-strong/10 px-5 py-4">
        <div className="flex gap-3">
          <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-gray-200">
            Big day so far: you are 2-1 across three leagues. The Gridiron Society is in hand
            behind Gibbs and Daniels, Backyard Dynasty is a blowout, and Monday Knights comes
            down to your FLEX against their kicker on the late slate. Projected finish: 3-0
            if Warren hits his usual workload.
          </p>
        </div>
      </div>

      {/* ── Your Week strip + matchup heroes (animated client-side) ── */}
      <DemoLiveSim />

      {/* ── Power rankings sample ── */}
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        <div className="px-6 py-3.5 border-b border-pitch-700/60 flex items-center justify-between">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase">
            Power Rankings
          </span>
          <span className="text-xs text-gray-600">The Gridiron Society</span>
        </div>
        <div className="px-6 py-2">
          {RANKINGS.map((r) => (
            <div key={r.rank} className="flex items-center gap-4 py-3 border-b border-pitch-800 last:border-0">
              <span className="font-display text-2xl text-gray-600 w-6 text-center">{r.rank}</span>
              {r.trend === "up" ? (
                <ArrowUp className="w-4 h-4 text-green-400 shrink-0" aria-label="Trending up" />
              ) : r.trend === "down" ? (
                <ArrowDown className="w-4 h-4 text-red-400 shrink-0" aria-label="Trending down" />
              ) : (
                <span className="w-4 shrink-0 text-center text-gray-600">-</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-200 truncate">{r.team}</div>
                <div className="text-xs text-gray-600">
                  {r.record} · {r.pf.toFixed(1)} PF
                </div>
              </div>
              {r.award && (
                <span className="text-[10px] font-bold tracking-wider uppercase text-accent border border-accent-strong/30 rounded-md px-2 py-1 shrink-0">
                  {r.award}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Trophy case sample ── */}
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        <div className="px-6 py-3.5 border-b border-pitch-700/60">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase">Trophy Case</span>
        </div>
        <ul className="px-6 py-3">
          {CHAMPIONS.map((c) => (
            <li key={c.year} className="flex items-center gap-3 py-2.5 border-b border-pitch-800 last:border-0 text-sm">
              <Trophy className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
              <span className="font-bold text-gray-300">{c.year}</span>
              <span className="text-gray-400">{c.team}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Final CTA ── */}
      <div className="rounded-2xl border border-accent-strong/30 bg-accent-strong/5 px-6 py-10 text-center">
        <h2 className="font-display text-4xl tracking-[0.08em] text-white">
          THIS, BUT WITH YOUR LEAGUES
        </h2>
        <p className="text-gray-400 mt-3 max-w-md mx-auto text-sm">
          Connect Yahoo, Sleeper, and ESPN once. Live scores, rankings, AI analysis, and
          game-day notifications, free.
        </p>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-2 mt-6 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-3 px-8 rounded-lg tracking-wide transition-colors"
        >
          Get started free <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
