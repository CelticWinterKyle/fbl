"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { RefreshCw, ShieldAlert, CalendarOff } from "lucide-react";

// ─── Types (mirrors lib/odds.ts NormalizedGameOdds, the /api/odds payload) ────

type GameOdds = {
  gameId: string;
  kickoff: string;
  state: "pre" | "in" | "post";
  home: { name: string; abbrev: string; moneyline: number | null };
  away: { name: string; abbrev: string; moneyline: number | null };
  spread: { favorite: string | null; line: number | null; details: string | null };
  total: number | null;
  provider: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoneyline(n: number | null): string | null {
  if (n === null) return null;
  return n > 0 ? `+${n}` : String(n);
}

function spreadLabel(g: GameOdds): string {
  if (g.spread.details) return g.spread.details;
  if (g.spread.favorite && g.spread.line !== null) return `${g.spread.favorite} ${g.spread.line}`;
  return "-";
}

function totalLabel(g: GameOdds): string {
  return g.total !== null ? `O/U ${g.total}` : "-";
}

function moneylineLabel(g: GameOdds): string {
  const away = fmtMoneyline(g.away.moneyline);
  const home = fmtMoneyline(g.home.moneyline);
  if (!away && !home) return "-";
  return `${g.away.abbrev} ${away ?? "-"} / ${g.home.abbrev} ${home ?? "-"}`;
}

function hasAnyLine(g: GameOdds): boolean {
  return (
    g.spread.details !== null ||
    g.spread.line !== null ||
    g.total !== null ||
    g.home.moneyline !== null ||
    g.away.moneyline !== null
  );
}

function dayLabel(kickoff: string): string {
  const d = new Date(kickoff);
  if (!kickoff || Number.isNaN(d.getTime())) return "DATE TBD";
  return d
    .toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    .toUpperCase();
}

function timeLabel(kickoff: string): string {
  const d = new Date(kickoff);
  if (!kickoff || Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ─── Responsible-gambling footer (every odds surface) ─────────────────────────

function RgFooter({ source }: { source?: string | null }) {
  return (
    <p className="mt-8 text-xs text-gray-500 leading-relaxed border-t border-pitch-700 pt-4">
      {source ? `Lines via ${source}. ` : ""}
      Lines update periodically and vary by sportsbook and state. League Blitz is not a
      sportsbook and does not accept wagers. 21+. Gambling problem? Call or text 1-800-GAMBLER.
    </p>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OddsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse max-w-3xl mx-auto">
      <div className="h-9 w-36 bg-pitch-800 rounded" />
      <div className="h-4 w-72 bg-pitch-800 rounded mb-4" />
      <div className="h-3 w-32 bg-pitch-800 rounded" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between border border-pitch-700 bg-pitch-900 px-5 py-4">
          <div className="space-y-2">
            <div className="h-4 w-28 bg-pitch-800 rounded" />
            <div className="h-3 w-16 bg-pitch-800 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-20 bg-pitch-800 rounded-lg" />
            <div className="h-7 w-20 bg-pitch-800 rounded-lg" />
            <div className="h-7 w-28 bg-pitch-800 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OddsContent() {
  const [games, setGames] = useState<GameOdds[]>([]);
  const [source, setSource] = useState<string>("");
  const [acked, setAcked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch("/api/odds", { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Couldn't load lines right now.");
      setAcked(data.acked === true);
      setGames(Array.isArray(data.games) ? data.games : []);
      setSource(typeof data.source === "string" ? data.source : "");
    } catch (e: any) {
      setError(e?.message || "Couldn't load lines right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ack = useCallback(async () => {
    setAcked(true); // optimistic: the gate is presentational
    try {
      await fetch("/api/odds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ack: true }),
      });
    } catch {
      // Best-effort persistence; the user re-attests next visit if it failed.
    }
  }, []);

  // Group games by kickoff day (user's locale), kept in kickoff order.
  const groups = useMemo(() => {
    const sorted = [...games].sort((a, b) => {
      const am = Date.parse(a.kickoff);
      const bm = Date.parse(b.kickoff);
      return (Number.isFinite(am) ? am : Infinity) - (Number.isFinite(bm) ? bm : Infinity);
    });
    const map = new Map<string, GameOdds[]>();
    for (const g of sorted) {
      const label = dayLabel(g.kickoff);
      const list = map.get(label);
      if (list) list.push(g);
      else map.set(label, [g]);
    }
    return Array.from(map.entries());
  }, [games]);

  // ── Loading ──
  if (loading) return <OddsSkeleton />;

  // ── Error (with retry, before the gate: a failed load can't read ack) ──
  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center py-16 space-y-3">
          <p className="text-red-400">{error}</p>
          <button onClick={() => load()} className="text-sm text-accent hover:text-accent-soft underline min-h-[44px] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950 rounded-lg">
            Try again
          </button>
        </div>
        <RgFooter />
      </div>
    );
  }

  // ── 21+ gate (first open) ──
  if (!acked) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md border border-pitch-700 bg-pitch-900 px-6 py-8 sm:px-8 text-center">
          <ShieldAlert className="w-10 h-10 text-accent mx-auto" aria-hidden="true" />
          <h2 className="font-display text-3xl tracking-widest text-gray-200 mt-4">
            BEFORE YOU LOOK AT LINES
          </h2>
          <p className="text-gray-500 text-sm font-ui leading-relaxed mt-3">
            Betting lines are shown for information only. League Blitz is not a sportsbook
            and does not take bets. To view this tab you must be 21 or older.
          </p>
          <button
            onClick={ack}
            className="mt-6 w-full min-h-[44px] inline-flex items-center justify-center bg-accent-strong hover:bg-accent text-pitch-950 font-bold rounded-lg transition-colors font-ui tracking-wider text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
          >
            I am 21 or older
          </button>
          <Link
            href="/gameday"
            className="mt-1 min-h-[44px] inline-flex items-center justify-center px-3 text-sm text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950 rounded-lg"
          >
            Take me back
          </Link>
          <p className="text-xs text-gray-500 leading-relaxed mt-4 border-t border-pitch-700 pt-4">
            Lines update periodically and vary by sportsbook and state. League Blitz is not a
            sportsbook and does not accept wagers. 21+. Gambling problem? Call or text 1-800-GAMBLER.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-end gap-3">
          <h1 className="font-display text-5xl tracking-[0.08em] text-white leading-none">ODDS</h1>
          <span className="inline-flex items-center text-[10px] font-bold tracking-[0.15em] uppercase text-red-300 border border-red-400/30 rounded-md px-2 py-1 mb-0.5">
            21+
          </span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border border-pitch-700 bg-pitch-900 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-pitch-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
          title="Refresh lines"
          aria-label="Refresh lines"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="text-gray-500 text-sm mt-1.5 mb-5">
        Game lines for this week&apos;s NFL slate, shown for information only. League Blitz does not take bets.
      </p>

      {/* ── Off-season / no lines ── */}
      {games.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <CalendarOff className="w-8 h-8 text-gray-600 mx-auto" aria-hidden="true" />
          <p className="text-gray-400">No lines right now.</p>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            Game lines appear here once NFL games are on the board, typically the week of kickoff.
          </p>
        </div>
      ) : (
        /* ── Games, grouped by day ── */
        <div className="space-y-6">
          {groups.map(([day, dayGames]) => (
            <section key={day}>
              <h2 className="font-mono text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2.5">
                {day}
              </h2>
              <div className="space-y-2">
                {dayGames.map((g) => {
                  const showStatusTag = g.state !== "pre" && !hasAnyLine(g);
                  return (
                    <div
                      key={g.gameId}
                      className="flex items-center justify-between gap-3 flex-wrap border border-pitch-700 bg-pitch-900 px-5 py-3.5"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-bold tracking-wide text-gray-200">
                          {g.away.abbrev || g.away.name}
                          <span className="text-gray-500 font-semibold"> at </span>
                          {g.home.abbrev || g.home.name}
                        </span>
                        <span className="block font-mono text-[11px] text-gray-600 mt-0.5">
                          {timeLabel(g.kickoff)}
                        </span>
                      </div>
                      {showStatusTag ? (
                        <span
                          className={`font-mono text-[10px] font-bold tracking-[0.15em] uppercase border rounded-md px-2 py-1 ${
                            g.state === "in"
                              ? "text-green-400 border-green-400/30"
                              : "text-gray-500 border-pitch-700"
                          }`}
                        >
                          {g.state === "in" ? "Live" : "Final"}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-gray-400 border border-pitch-700 rounded-lg px-2.5 py-1.5">
                            {spreadLabel(g)}
                          </span>
                          <span className="font-mono text-xs text-gray-400 border border-pitch-700 rounded-lg px-2.5 py-1.5">
                            {totalLabel(g)}
                          </span>
                          <span className="font-mono text-xs text-gray-400 border border-pitch-700 rounded-lg px-2.5 py-1.5">
                            {moneylineLabel(g)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <RgFooter source={games.length > 0 ? source : null} />
    </div>
  );
}
