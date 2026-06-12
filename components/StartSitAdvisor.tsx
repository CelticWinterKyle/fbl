"use client";
// Start/Sit advisor (docs/AI_COACH_PLAN.md #2): pick two of your players,
// get Coach's call with a calibrated lean. "Coin flip" is a real answer here,
// not a failure state. Lives collapsed on each My Team league card, next to
// the trade analyzer it shares its visual language with.

import { useState, useCallback } from "react";
import { ChevronDown, Scale, Sparkles } from "lucide-react";

type Player = { name: string; position: string; team: string | null };

type Verdict = {
  pick: string;
  lean: "strong" | "moderate" | "coin flip";
  summary: string;
  reasons: string[];
  players: string[];
};

const LEAN_STYLE: Record<Verdict["lean"], { label: string; cls: string }> = {
  strong: { label: "STRONG LEAN", cls: "border-accent-strong/50 bg-accent-strong/15 text-accent" },
  moderate: { label: "MODERATE LEAN", cls: "border-accent-strong/30 bg-accent-strong/10 text-accent-soft" },
  "coin flip": { label: "COIN FLIP", cls: "border-pitch-600 bg-pitch-800/60 text-gray-300" },
};

function playerLabel(p: Player): string {
  return `${p.name} (${p.position}${p.team ? ` · ${p.team}` : ""})`;
}

export default function StartSitAdvisor({
  platform,
  leagueId,
  teamKey,
  players,
}: {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  teamKey: string;
  players: Player[];
}) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Verdict | null>(null);

  const pick = useCallback((setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setResult(null);
    setError(null);
  }, []);

  const compare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-startsit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ platform, leagueKey: leagueId, teamKey, playerA: a, playerB: b }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "Couldn't make that call right now.");
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Couldn't make that call right now.");
    } finally {
      setBusy(false);
    }
  }, [platform, leagueId, teamKey, a, b]);

  const ready = a && b && a !== b && !busy;
  const sitting = result ? result.players.find((n) => n !== result.pick) ?? "" : "";

  return (
    <div className="border-t border-pitch-700/40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase hover:bg-pitch-800 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <Scale className="w-3.5 h-3.5" />
          Start or sit
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-pitch-700/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(
              [
                { label: "Start him...", value: a, onChange: pick(setA), exclude: b },
                { label: "...or him?", value: b, onChange: pick(setB), exclude: a },
              ] as const
            ).map((sel) => (
              <div key={sel.label}>
                <label className="block text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-1.5">
                  {sel.label}
                </label>
                <select
                  value={sel.value}
                  onChange={sel.onChange}
                  className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:border-accent-strong/60 focus:outline-none"
                >
                  <option value="">Pick a player...</option>
                  {players
                    .filter((p) => p.name !== sel.exclude)
                    .map((p) => (
                      <option key={p.name} value={p.name}>
                        {playerLabel(p)}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>

          <button
            onClick={compare}
            disabled={!ready}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold rounded-lg transition-colors tracking-wider text-sm disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
          >
            <Sparkles className="w-4 h-4" />
            {busy ? "Coach is thinking..." : "Get Coach's call"}
          </button>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {result && (
            <div className="rounded-xl border border-pitch-700 bg-pitch-950/60 p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex px-3 py-1 rounded-md border text-xs font-bold tracking-[0.15em] ${LEAN_STYLE[result.lean].cls}`}
                >
                  {LEAN_STYLE[result.lean].label}
                </span>
                <span className="text-sm font-semibold text-gray-100">
                  {result.lean === "coin flip" ? (
                    <>Either works. Coach leans <span className="text-accent">{result.pick}</span>.</>
                  ) : (
                    <>Start <span className="text-accent">{result.pick}</span>, sit {sitting}.</>
                  )}
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{result.summary}</p>
              <ul className="space-y-1.5 border-t border-pitch-700/50 pt-3">
                {result.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-gray-500 leading-relaxed">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
