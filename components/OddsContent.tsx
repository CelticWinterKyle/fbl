"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { RefreshCw, ShieldAlert, CalendarOff } from "lucide-react";
import { playerNameKey } from "@/lib/playerName";

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

// Mirrors the /api/odds/props payload (lib/odds.ts NormalizedPlayerProps).
type PropLine = {
  market: string;
  label: string;
  value: string;
  price: number | null;
};

type MyPropPlayer = {
  name: string;
  position: string;
  nflTeam: string;
  /** How many of your leagues roster this player ("yours in N") */
  leagues: number;
  lines: PropLine[];
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
  const [myProps, setMyProps] = useState<MyPropPlayer[]>([]);

  // ── Player props for your rostered players (pure enhancement) ──
  // Quietly absent until ODDS_API_KEY is live and lines are on the board:
  // any failure or empty result just hides the section, never errors the page.
  const loadProps = useCallback(async () => {
    try {
      const [connRes, dataRes] = await Promise.all([
        fetch("/api/user/connections", { cache: "no-store" }),
        fetch("/api/leagues/data", { cache: "no-store" }),
      ]);
      const [connData, data] = await Promise.all([connRes.json(), dataRes.json()]);
      if (!connData?.ok || !connData.hasAnyConnection) return;
      const platforms: any[] = data?.ok ? (data.platforms ?? []) : [];

      // leagueId -> myTeam (per-league, multi-league aware). Mirrors Game Day.
      const myTeamMap: Record<string, { teamKey: string }> = {};
      for (const e of connData.connections?.yahoo?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueKey] = e.myTeam;
      }
      for (const e of connData.connections?.sleeper?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }
      for (const e of connData.connections?.espn?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }

      const tasks = platforms.flatMap((l) => {
        const mt = myTeamMap[l.leagueId];
        return mt
          ? [{ platform: l.platform, leagueKey: l.leagueId, teamKey: mt.teamKey }]
          : [];
      });
      if (tasks.length === 0) return;

      // Pull your roster in each league (batched, chunked at the API's cap).
      const BATCH_MAX = 24;
      const chunks: (typeof tasks)[] = [];
      for (let i = 0; i < tasks.length; i += BATCH_MAX) chunks.push(tasks.slice(i, i + BATCH_MAX));
      const rosterRows = (
        await Promise.all(
          chunks.map(async (chunk) => {
            try {
              const res = await fetch("/api/rosters/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ items: chunk }),
              });
              const j = await res.json();
              return j?.ok && Array.isArray(j.rosters) ? j.rosters : [];
            } catch {
              return [];
            }
          })
        )
      ).flat();

      // Your starters across leagues, counted per player ("yours in N").
      const byKey = new Map<
        string,
        { name: string; position: string; nflTeam: string; leagues: number }
      >();
      for (const row of rosterRows) {
        const starters: any[] = row?.roster?.starters ?? [];
        const seenInLeague = new Set<string>();
        for (const p of starters) {
          const nm = typeof p?.name === "string" ? p.name : "";
          if (!nm) continue;
          const key = playerNameKey(nm);
          if (!key || seenInLeague.has(key)) continue;
          seenInLeague.add(key);
          const cur = byKey.get(key);
          if (cur) cur.leagues += 1;
          else byKey.set(key, {
            name: nm,
            position: typeof p?.position === "string" ? p.position : "",
            nflTeam: typeof p?.team === "string" ? p.team : "",
            leagues: 1,
          });
        }
      }
      if (byKey.size === 0) return;

      const propsRes = await fetch("/api/odds/props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          names: Array.from(byKey.values(), (v) => v.name).slice(0, 400),
        }),
      });
      const propsData = await propsRes.json();
      if (!propsData?.ok || !Array.isArray(propsData.props)) return;

      const joined: MyPropPlayer[] = [];
      for (const pr of propsData.props) {
        const mine = byKey.get(pr.nameKey);
        if (!mine || !Array.isArray(pr.lines) || pr.lines.length === 0) continue;
        joined.push({
          name: mine.name,
          position: mine.position,
          nflTeam: mine.nflTeam,
          leagues: mine.leagues,
          lines: pr.lines.slice(0, 3),
        });
      }
      joined.sort((a, b) => b.leagues - a.leagues || a.name.localeCompare(b.name));
      setMyProps(joined);
    } catch {
      // Props are an enhancement; the page works without them.
    }
  }, []);

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

  // Props load once the gate is passed and the main payload is in.
  useEffect(() => {
    if (acked && !loading && !error) loadProps();
  }, [acked, loading, error, loadProps]);

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
          onClick={() => { load(true); loadProps(); }}
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

      {/* ── Your players this week (props, shown only when lines exist) ── */}
      {myProps.length > 0 && (
        <section className="mb-7">
          <h2 className="font-mono text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2.5">
            Your players this week
          </h2>
          <div className="space-y-2">
            {myProps.map((p) => (
              <div
                key={`${p.name}:${p.nflTeam}`}
                className="flex items-center justify-between gap-3 flex-wrap border border-pitch-700 border-l-[3px] border-l-green-400/60 bg-pitch-900 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="font-display text-xl tracking-wide text-white leading-tight">
                    {p.name}
                  </div>
                  <div className="text-[11px] font-bold tracking-wide uppercase text-gray-500 mt-0.5">
                    {[p.position, p.nflTeam, `yours in ${p.leagues}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {p.lines.map((l) => (
                    <div
                      key={l.market}
                      className="flex flex-col items-center gap-0.5 border border-pitch-700 bg-pitch-800 rounded-lg px-3 py-1.5 min-w-[88px]"
                    >
                      <span className="text-[9.5px] font-bold tracking-wider uppercase text-gray-500">
                        {l.label}
                      </span>
                      <span className="font-mono text-[13px] font-bold text-gray-300">{l.value}</span>
                      <span className="font-mono text-[11px] text-green-400">
                        {fmtMoneyline(l.price) ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
          {myProps.length > 0 && (
            <h2 className="font-mono text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase -mb-3">
              This week&apos;s game lines
            </h2>
          )}
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
