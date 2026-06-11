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
  ChevronDown,
} from "lucide-react";

// ─── Fictional data (no real people, no real leagues) ─────────────────────────

const MY_TEAM = "Thunder Lizards";

type DemoMatchup = {
  platform: "yahoo" | "sleeper" | "espn";
  league: string;
  week: number;
  opp: string;
  myPts: number;
  oppPts: number;
};

const MATCHUPS: DemoMatchup[] = [
  { platform: "yahoo", league: "The Gridiron Society", week: 11, opp: "Mahomes Alone", myPts: 112.4, oppPts: 87.1 },
  { platform: "espn", league: "Monday Knights", week: 11, opp: "Bye Week Energy", myPts: 96.8, oppPts: 101.2 },
  { platform: "sleeper", league: "Backyard Dynasty", week: 11, opp: "Praise Gridiron", myPts: 124.9, oppPts: 88.3 },
];

const LINEUP: { pos: string; me: string; mePts: number; opp: string; oppPts: number }[] = [
  { pos: "QB", me: "J. Daniels", mePts: 24.7, opp: "J. Goff", oppPts: 18.2 },
  { pos: "RB", me: "B. Hall", mePts: 17.3, opp: "K. Walker", oppPts: 9.8 },
  { pos: "RB", me: "J. Gibbs", mePts: 21.6, opp: "R. White", oppPts: 7.4 },
  { pos: "WR", me: "N. Collins", mePts: 14.9, opp: "G. Wilson", oppPts: 12.6 },
  { pos: "WR", me: "L. McConkey", mePts: 11.2, opp: "D. London", oppPts: 16.0 },
  { pos: "TE", me: "T. McBride", mePts: 9.8, opp: "S. LaPorta", oppPts: 6.1 },
  { pos: "FLEX", me: "J. Warren", mePts: 12.4, opp: "C. Ridley", oppPts: 8.9 },
];

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

const PLATFORM_LABEL: Record<DemoMatchup["platform"], string> = {
  yahoo: "Yahoo",
  sleeper: "Sleeper",
  espn: "ESPN",
};
const PLATFORM_DOT: Record<DemoMatchup["platform"], string> = {
  yahoo: "bg-purple-400",
  sleeper: "bg-emerald-400",
  espn: "bg-red-400",
};

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

      {/* ── Your Week strip ── */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 px-5 py-3.5 flex items-center gap-3 flex-wrap shadow-lg shadow-black/30">
        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">Your Week</span>
        <span className="font-display text-2xl leading-none tabular-nums text-accent">2-1</span>
        <span className="text-sm text-gray-400">across 3 leagues, 1 close game</span>
      </div>

      {/* ── Matchup hero cards ── */}
      <div className="space-y-5">
        {MATCHUPS.map((m, idx) => {
          const winning = m.myPts > m.oppPts;
          const statusLabel = winning ? "WINNING" : "LOSING";
          const statusClasses = winning
            ? "border-accent-strong/50 bg-accent-strong/15 text-accent"
            : "border-red-700/50 bg-red-900/20 text-red-400";
          const myScoreColor = winning ? "text-accent" : "text-red-400";
          const showLineup = idx === 0;

          return (
            <div
              key={m.platform}
              className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40"
            >
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[m.platform]}`} />
                  <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase shrink-0">
                    {PLATFORM_LABEL[m.platform]}
                  </span>
                  <span className="text-gray-600 shrink-0">·</span>
                  <span className="text-sm text-gray-400 truncate">{m.league}</span>
                </div>
                <span className="text-xs font-bold tracking-[0.15em] text-gray-600 shrink-0 uppercase">
                  Wk {m.week}
                </span>
              </div>

              <div className="px-6 py-8">
                <div className="flex items-center gap-3 sm:gap-8">
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[10px] font-bold tracking-[0.2em] text-accent-strong/80 mb-1.5 uppercase">
                      My Team
                    </div>
                    <div className="text-sm font-semibold text-gray-200 truncate">{MY_TEAM}</div>
                    <div className={`font-display text-6xl leading-none mt-2 tabular-nums ${myScoreColor}`}>
                      {m.myPts.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-center shrink-0">
                    <span className={`inline-flex px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-[0.15em] ${statusClasses}`}>
                      {statusLabel}
                    </span>
                    <div className="text-[11px] text-gray-600 mt-1.5">
                      by {Math.abs(m.myPts - m.oppPts).toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">VS</div>
                  </div>
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[10px] font-bold tracking-[0.2em] text-gray-600 mb-1.5 uppercase">
                      Opponent
                    </div>
                    <div className="text-sm font-semibold text-gray-400 truncate">{m.opp}</div>
                    <div className="font-display text-6xl leading-none mt-2 tabular-nums text-gray-600">
                      {m.oppPts.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              {showLineup ? (
                <div className="border-t border-pitch-700/60 px-6 py-5">
                  <div className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-3">
                    Lineups
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {LINEUP.map((row) => (
                        <tr key={row.pos + row.me} className="border-b border-pitch-800 last:border-0">
                          <td className="py-2 text-gray-300">{row.me}</td>
                          <td className="py-2 text-right font-mono text-xs text-accent tabular-nums">
                            {row.mePts.toFixed(1)}
                          </td>
                          <td className="py-2 text-center text-[10px] font-bold tracking-wider text-gray-600 uppercase w-14">
                            {row.pos}
                          </td>
                          <td className="py-2 text-left font-mono text-xs text-gray-500 tabular-nums">
                            {row.oppPts.toFixed(1)}
                          </td>
                          <td className="py-2 text-right text-gray-500">{row.opp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-t border-pitch-700/60 px-6 py-3 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.15em] text-gray-600 uppercase">
                    <ChevronDown className="w-3.5 h-3.5" /> See rosters &amp; analysis
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
