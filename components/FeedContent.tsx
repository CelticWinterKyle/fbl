"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import LeagueErrorBanner, { type LeagueLoadError } from "@/components/LeagueErrorBanner";
import { fmtPts } from "@/lib/format";
import { isNflGameWindow } from "@/lib/gameWindow";
import { RefreshCw, Link as LinkIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MyTeam = { teamKey: string; teamName: string };

type PlatformMatchup = {
  id: string;
  teamA: { name: string; points: number; projectedPoints: number; key: string };
  teamB: { name: string; points: number; projectedPoints: number; key: string };
};

type PlatformLeagueData = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  leagueName: string;
  currentWeek: number;
  season: number;
  matchups: PlatformMatchup[];
  teams: unknown[];
  rosterPositions: { position: string; count: number }[];
};

type RosterPlayer = { name: string; position: string; team: string; points: number };

type Side = "you" | "opp";

type LeagueHit = {
  leagueName: string;
  platform: "yahoo" | "sleeper" | "espn";
  side: Side;
  points: number;
};

type FeedEntry = {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
  topPoints: number;
  leagues: LeagueHit[];
  hasYou: boolean;
  hasOpp: boolean;
};

type Filter = "all" | "mine" | "helping" | "against";

// A roster we need to pull, tagged with the league + side it belongs to.
type RosterTask = {
  leagueName: string;
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  teamKey: string;
  side: Side;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Filter; label: string }[] = [
  { id: "all",      label: "All leagues"   },
  { id: "mine",     label: "My players"    },
  { id: "helping",  label: "Helping me"    },
  { id: "against",  label: "Against me"    },
];

const REFRESH_MS = 45_000;
const WINDOW_CHECK_MS = 60_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

// Merge the same player across platforms by a punctuation-stripped name. Team
// abbreviations differ between platforms (and defenses are named inconsistently),
// so name alone is the most reliable cross-platform key for V1.
function playerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const POS_GROUP = (pos: string): "ball" | "fg" | "def" => {
  const p = pos.toUpperCase();
  if (p === "K") return "fg";
  if (p === "DEF" || p === "DST" || p === "D/ST" || p === "D") return "def";
  return "ball";
};

const POS_LABEL = (pos: string): string => {
  const p = pos.toUpperCase();
  if (p === "K") return "kicker";
  if (p === "DEF" || p === "DST" || p === "D/ST" || p === "D") return "defense";
  if (["QB", "RB", "WR", "TE"].includes(p)) return p;
  return "player";
};

// Per-entry context line. Uses commas/periods, never em dashes.
function noteFor(e: FeedEntry): string {
  const you = e.leagues.filter((l) => l.side === "you").length;
  const opp = e.leagues.filter((l) => l.side === "opp").length;
  const label = POS_LABEL(e.position);

  if (you > 0 && opp > 0) {
    return `Yours in ${you} ${you === 1 ? "league" : "leagues"}, against you in ${opp}.`;
  }
  if (you > 0) {
    return you === 1 ? `Your ${label}.` : `Your ${label} in ${you} leagues.`;
  }
  return opp === 1 ? `Your opponent's ${label}.` : `Opposing ${label} in ${opp} leagues.`;
}

// ─── Position icons (inline SVG, no emoji) ─────────────────────────────────────

function PosIcon({ group }: { group: "ball" | "fg" | "def" }) {
  if (group === "fg") {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path d="M6 20V9M18 20V9M4 9h16M12 9V4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (group === "def") {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-32 12 12)" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <line x1="9" y1="15" x2="15" y2="9" stroke="currentColor" strokeWidth="1.7" />
      <line x1="10.6" y1="11.2" x2="12" y2="12.6" stroke="currentColor" strokeWidth="1.7" />
      <line x1="12" y1="9.6" x2="13.4" y2="11" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-9 w-44 bg-pitch-800 rounded" />
      <div className="h-4 w-72 bg-pitch-800 rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-7 w-24 bg-pitch-800 rounded-full" />)}
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 border border-pitch-700 border-l-[3px] bg-pitch-900 px-5 py-4">
          <div className="h-9 w-9 bg-pitch-800 rounded-lg" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-40 bg-pitch-800 rounded" />
            <div className="flex gap-2">
              <div className="h-5 w-28 bg-pitch-800 rounded-lg" />
              <div className="h-5 w-24 bg-pitch-800 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FeedContent() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loadErrors, setLoadErrors] = useState<LeagueLoadError[]>([]);
  const [leagueCount, setLeagueCount] = useState(0);
  const [noConnections, setNoConnections] = useState(false);
  const [noTeams, setNoTeams] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [isLive, setIsLive] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [connRes, dataRes] = await Promise.all([
        fetch("/api/user/connections", { cache: "no-store" }),
        fetch("/api/leagues/data", { cache: "no-store" }),
      ]);
      const [connData, data] = await Promise.all([connRes.json(), dataRes.json()]);

      if (!connData.ok || !connData.hasAnyConnection) {
        setNoConnections(true);
        return;
      }
      setNoConnections(false);

      const platforms: PlatformLeagueData[] = data.ok ? (data.platforms ?? []) : [];
      setLoadErrors(data.ok && Array.isArray(data.errors) ? data.errors : []);
      setLeagueCount(platforms.length);

      // leagueId -> myTeam (per-league, multi-league aware). Mirrors Game Day.
      const myTeamMap: Record<string, MyTeam> = {};
      for (const e of connData.connections?.yahoo?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueKey] = e.myTeam;
      }
      for (const e of connData.connections?.sleeper?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }
      for (const e of connData.connections?.espn?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }

      // Figure out which rosters to pull: always your team in each league, plus
      // your current opponent's team when a matchup exists.
      const tasks: RosterTask[] = [];
      for (const league of platforms) {
        const myTeam = myTeamMap[league.leagueId];
        if (!myTeam) continue;

        tasks.push({
          leagueName: league.leagueName,
          platform: league.platform,
          leagueId: league.leagueId,
          teamKey: myTeam.teamKey,
          side: "you",
        });

        const matchup = league.matchups.find(
          (m) => m.teamA.key === myTeam.teamKey || m.teamB.key === myTeam.teamKey
        );
        if (matchup) {
          const isTeamA = matchup.teamA.key === myTeam.teamKey;
          const oppKey = isTeamA ? matchup.teamB.key : matchup.teamA.key;
          if (oppKey) {
            tasks.push({
              leagueName: league.leagueName,
              platform: league.platform,
              leagueId: league.leagueId,
              teamKey: oppKey,
              side: "opp",
            });
          }
        }
      }

      if (tasks.length === 0) {
        setNoTeams(true);
        setEntries([]);
        return;
      }
      setNoTeams(false);

      // Pull every roster in parallel; a single failed roster is skipped, not fatal.
      const rosters = await Promise.all(
        tasks.map(async (t) => {
          try {
            const params = new URLSearchParams({ platform: t.platform, leagueKey: t.leagueId });
            const res = await fetch(`/api/roster/${encodeURIComponent(t.teamKey)}?${params}`, { cache: "no-store" });
            const j = await res.json();
            if (!j.ok) return { task: t, starters: [] as RosterPlayer[] };
            const starters: RosterPlayer[] = (j.starters ?? []).map((p: any) => ({
              name: p.name ?? "",
              position: p.position ?? "",
              team: p.team ?? "",
              points: Number(p.points ?? 0),
            }));
            return { task: t, starters };
          } catch {
            return { task: t, starters: [] as RosterPlayer[] };
          }
        })
      );

      // Aggregate scoring starters across leagues by player.
      const byPlayer = new Map<string, FeedEntry>();
      for (const { task, starters } of rosters) {
        for (const p of starters) {
          if (!p.name || p.points <= 0) continue;
          const key = playerKey(p.name);
          let entry = byPlayer.get(key);
          if (!entry) {
            entry = {
              key,
              name: p.name,
              position: p.position,
              nflTeam: p.team,
              topPoints: 0,
              leagues: [],
              hasYou: false,
              hasOpp: false,
            };
            byPlayer.set(key, entry);
          }
          entry.leagues.push({
            leagueName: task.leagueName,
            platform: task.platform,
            side: task.side,
            points: p.points,
          });
          entry.topPoints = Math.max(entry.topPoints, p.points);
          if (task.side === "you") entry.hasYou = true;
          else entry.hasOpp = true;
          // Prefer a real position/team label if the first one we saw was blank.
          if (!entry.position && p.position) entry.position = p.position;
          if (!entry.nflTeam && p.team) entry.nflTeam = p.team;
        }
      }

      const list = Array.from(byPlayer.values()).sort((a, b) => b.topPoints - a.topPoints);
      setEntries(list);
    } catch (e: any) {
      setError(e?.message || "Failed to load the feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Auto-refresh only during live NFL windows (manual-only otherwise), matching
    // the rest of the app. Re-evaluates the window every minute.
    let liveInterval: ReturnType<typeof setInterval> | null = null;
    const evaluate = () => {
      const live = isNflGameWindow();
      setIsLive(live);
      if (live && !liveInterval) {
        liveInterval = setInterval(() => load(true), REFRESH_MS);
      } else if (!live && liveInterval) {
        clearInterval(liveInterval);
        liveInterval = null;
      }
    };
    evaluate();
    const windowCheck = setInterval(evaluate, WINDOW_CHECK_MS);
    return () => {
      clearInterval(windowCheck);
      if (liveInterval) clearInterval(liveInterval);
    };
  }, [load]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "mine":    return entries.filter((e) => e.hasYou);
      case "helping": return entries.filter((e) => e.hasYou && !e.hasOpp);
      case "against": return entries.filter((e) => e.hasOpp);
      default:        return entries;
    }
  }, [entries, filter]);

  // ── Loading ──
  if (loading) return <FeedSkeleton />;

  // ── No connections ──
  if (noConnections) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <h2 className="font-display text-4xl tracking-widest text-gray-200">CONNECT A LEAGUE</h2>
        <p className="text-gray-500 max-w-sm font-ui">
          Link a Yahoo, Sleeper, or ESPN league and the Feed will stream every score across all of them here.
        </p>
        <Link
          href="/connect"
          className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors font-ui tracking-wider text-sm"
        >
          <LinkIcon className="w-4 h-4" />
          Go to Leagues
        </Link>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-red-400">{error}</p>
        <button onClick={() => load()} className="text-sm text-accent hover:text-accent-soft underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <h1 className="font-display text-5xl tracking-[0.08em] text-white leading-none">LIVE FEED</h1>
        <div className="flex items-center gap-3">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.15em] text-green-400 uppercase">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 p-1.5 hover:bg-pitch-800 disabled:opacity-50 transition-colors"
            title="Refresh feed"
            aria-label="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mt-1.5 mb-4">
        Every score across your {leagueCount === 1 ? "league" : `${leagueCount} leagues`}. Green is your player, red is your opponent&apos;s.
      </p>

      {/* ── Filter tabs ── */}
      <div className="flex gap-5 flex-wrap border-b border-pitch-700 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`text-[11px] font-bold tracking-[0.12em] uppercase pb-2.5 -mb-px border-b-2 transition-colors ${
              filter === t.id
                ? "text-white border-accent"
                : "text-gray-600 border-transparent hover:text-gray-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <LeagueErrorBanner errors={loadErrors} />

      {/* ── Entries ── */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center space-y-2.5">
          <p className="text-gray-400">
            {entries.length === 0 ? "No scoring yet." : "Nothing matches this filter yet."}
          </p>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            {entries.length === 0
              ? "Your players' points stream in here during NFL game windows, across all your leagues at once."
              : "Try another tab, or check back once more games are underway."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((e) => {
            const side = e.hasYou && e.hasOpp ? "mixed" : e.hasYou ? "you" : "opp";
            const barClass =
              side === "you" ? "border-l-emerald-400" : side === "opp" ? "border-l-red-400" : "border-l-accent";
            const iconClass =
              side === "you"
                ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/25"
                : side === "opp"
                ? "bg-red-400/10 text-red-400 border-red-400/25"
                : "bg-accent/10 text-accent border-accent/25";

            return (
              <div
                key={e.key}
                className={`flex gap-4 border border-pitch-700 border-l-[3px] ${barClass} bg-pitch-900 px-5 py-4`}
              >
                {/* Position icon */}
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconClass}`}>
                  <PosIcon group={POS_GROUP(e.position)} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-display text-xl tracking-wide text-white align-middle">{e.name}</span>
                      <span className="text-[11px] font-bold tracking-wide text-gray-500 uppercase ml-2 align-middle">
                        {e.position}{e.nflTeam ? ` · ${e.nflTeam}` : ""}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-accent whitespace-nowrap">
                      {fmtPts(e.topPoints)} PTS
                    </span>
                  </div>

                  {/* Per-league chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {e.leagues.map((l, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11.5px] font-semibold bg-pitch-800 ${
                          l.side === "you"
                            ? "border-emerald-500/30 text-emerald-300"
                            : "border-red-500/30 text-red-300"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${l.side === "you" ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="max-w-[150px] truncate">{l.leagueName}</span>
                        <span className="font-mono font-bold">+{fmtPts(l.points)}</span>
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-gray-600 mt-2">{noteFor(e)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-7 font-mono text-[10px] text-gray-600 text-center tracking-wide uppercase">
        Points are this week&apos;s totals from each league. Exact play detail arrives with the play-by-play feed.
      </p>
    </div>
  );
}
