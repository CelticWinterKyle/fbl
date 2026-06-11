"use client";
// Theatrical live simulation for the public /demo page. Scores tick upward
// while you watch (small gains, occasional touchdowns, the ESPN matchup
// staging a comeback) so the dashboard FEELS like a real Sunday. Purely
// client-side and visual: no network calls, no real data. The page banner
// already discloses everything is fictional.

import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

type Platform = "yahoo" | "sleeper" | "espn";

type SimMatchup = {
  platform: Platform;
  league: string;
  week: number;
  opp: string;
  myPts: number;
  oppPts: number;
};

type LineupRow = { pos: string; me: string; mePts: number; opp: string; oppPts: number };

const START_MATCHUPS: SimMatchup[] = [
  { platform: "yahoo", league: "The Gridiron Society", week: 11, opp: "Mahomes Alone", myPts: 112.4, oppPts: 87.1 },
  { platform: "espn", league: "Monday Knights", week: 11, opp: "Bye Week Energy", myPts: 96.8, oppPts: 101.2 },
  { platform: "sleeper", league: "Backyard Dynasty", week: 11, opp: "Praise Gridiron", myPts: 124.9, oppPts: 88.3 },
];

const START_LINEUP: LineupRow[] = [
  { pos: "QB", me: "J. Daniels", mePts: 24.7, opp: "J. Goff", oppPts: 18.2 },
  { pos: "RB", me: "B. Hall", mePts: 17.3, opp: "K. Walker", oppPts: 9.8 },
  { pos: "RB", me: "J. Gibbs", mePts: 21.6, opp: "R. White", oppPts: 7.4 },
  { pos: "WR", me: "N. Collins", mePts: 14.9, opp: "G. Wilson", oppPts: 12.6 },
  { pos: "WR", me: "L. McConkey", mePts: 11.2, opp: "D. London", oppPts: 16.0 },
  { pos: "TE", me: "T. McBride", mePts: 9.8, opp: "S. LaPorta", oppPts: 6.1 },
  { pos: "FLEX", me: "J. Warren", mePts: 12.4, opp: "C. Ridley", oppPts: 8.9 },
];

const PLATFORM_LABEL: Record<Platform, string> = { yahoo: "Yahoo", sleeper: "Sleeper", espn: "ESPN" };
const PLATFORM_DOT: Record<Platform, string> = {
  yahoo: "bg-purple-400",
  sleeper: "bg-emerald-400",
  espn: "bg-red-400",
};

const TICK_MS = 3200;

/** A fantasy-plausible score gain: usually a catch/run, sometimes a TD. */
function gain(): number {
  const r = Math.random();
  if (r < 0.12) return 6 + Math.random() * 1.4; // touchdown
  if (r < 0.45) return 1.5 + Math.random() * 2; // chunk play
  return 0.3 + Math.random() * 1.1; // routine play
}

export default function DemoLiveSim() {
  const [matchups, setMatchups] = useState(START_MATCHUPS);
  const [lineup, setLineup] = useState(START_LINEUP);
  // "m{i}-my" | "m{i}-opp" -> flash until timestamp
  const [flash, setFlash] = useState<Record<string, number>>({});
  const tickRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current += 1;

      setMatchups((prev) => {
        const next = prev.map((m) => ({ ...m }));

        // Pick which matchup sees action this tick.
        const i = Math.floor(Math.random() * next.length);
        const m = next[i];

        // The ESPN game is the comeback story: while we're behind there,
        // most of its action goes our way. Everything else is a coin flip
        // tilted slightly toward the viewer (it's a demo, let them win).
        const behind = m.myPts < m.oppPts;
        const myChance = m.platform === "espn" && behind ? 0.8 : 0.6;
        const mine = Math.random() < myChance;

        const amount = gain();
        if (mine) m.myPts = Math.round((m.myPts + amount) * 10) / 10;
        else m.oppPts = Math.round((m.oppPts + amount) * 10) / 10;

        const key = `m${i}-${mine ? "my" : "opp"}`;
        setFlash((f) => ({ ...f, [key]: Date.now() + 900 }));

        // Keep the featured lineup table consistent with the Yahoo total:
        // attribute that gain to a random starter.
        if (i === 0 && mine) {
          setLineup((rows) => {
            const idx = Math.floor(Math.random() * rows.length);
            return rows.map((row, j) =>
              j === idx ? { ...row, mePts: Math.round((row.mePts + amount) * 10) / 10 } : row
            );
          });
        }

        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Expire flashes (cheap re-render keyed off matchup ticks).
  const now = Date.now();

  const wins = matchups.filter((m) => m.myPts > m.oppPts).length;
  const losses = matchups.filter((m) => m.myPts < m.oppPts).length;
  const close = matchups.filter((m) => Math.abs(m.myPts - m.oppPts) < 10).length;

  return (
    <>
      {/* ── Your Week strip (live) ── */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 px-5 py-3.5 flex items-center gap-3 flex-wrap shadow-lg shadow-black/30">
        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">Your Week</span>
        <span className="font-display text-2xl leading-none tabular-nums text-accent">
          {wins}-{losses}
        </span>
        <span className="text-sm text-gray-400">
          across {matchups.length} leagues{close > 0 && <>, {close} close {close === 1 ? "game" : "games"}</>}
        </span>
      </div>

      {/* ── Matchup hero cards (live) ── */}
      <div className="space-y-5">
        {matchups.map((m, idx) => {
          const winning = m.myPts > m.oppPts;
          const statusLabel = winning ? "WINNING" : "LOSING";
          const statusClasses = winning
            ? "border-accent-strong/50 bg-accent-strong/15 text-accent"
            : "border-red-700/50 bg-red-900/20 text-red-400";
          const myScoreColor = winning ? "text-accent" : "text-red-400";
          const myFlash = (flash[`m${idx}-my`] ?? 0) > now;
          const oppFlash = (flash[`m${idx}-opp`] ?? 0) > now;
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
                    <div className="text-sm font-semibold text-gray-200 truncate">Thunder Lizards</div>
                    <div
                      className={`font-display text-6xl leading-none mt-2 tabular-nums transition-transform duration-300 ${myScoreColor} ${
                        myFlash ? "scale-110" : "scale-100"
                      }`}
                    >
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
                    <div
                      className={`font-display text-6xl leading-none mt-2 tabular-nums text-gray-600 transition-transform duration-300 ${
                        oppFlash ? "scale-110" : "scale-100"
                      }`}
                    >
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
                      {lineup.map((row) => (
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
    </>
  );
}
