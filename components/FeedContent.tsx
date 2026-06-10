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

// Mirrors lib/nflPlays.ts ScoringPlay (the /api/feed/plays payload).
type PlayRole = "passer" | "receiver" | "rusher" | "kicker" | "defense" | "returner";
type ApiPlay = {
  id: string;
  gameId: string;
  typeText: string;
  category: "touchdown" | "field-goal" | "two-point" | "safety" | "other";
  isTouchdown: boolean;
  yards: number | null;
  period: number;
  clock: string;
  teamAbbr: string;
  wallclockMs: number | null;
  sortMs: number;
  players: { name: string; role: PlayRole; isTeamDefense: boolean }[];
};

type FeedEntry = {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
  playLabel: string;
  yardsLabel: string | null;
  isTouchdown: boolean;
  wallclockMs: number | null;
  period: number;
  clock: string;
  sortMs: number;
  leagues: LeagueHit[];
  hasYou: boolean;
  hasOpp: boolean;
};

type Filter = "all" | "mine" | "touchdowns" | "helping" | "against";

type RosterTask = {
  leagueName: string;
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  teamKey: string;
  side: Side;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Filter; label: string }[] = [
  { id: "all",         label: "All leagues" },
  { id: "mine",        label: "My players"  },
  { id: "touchdowns",  label: "Touchdowns"  },
  { id: "helping",     label: "Helping me"  },
  { id: "against",     label: "Against me"  },
];

const REFRESH_MS = 45_000;
const WINDOW_CHECK_MS = 60_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

// Merge a player across platforms by a punctuation-stripped name (team
// abbreviations differ between platforms, so name is the most reliable key).
function playerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const POS_GROUP = (pos: string): "ball" | "fg" | "def" => {
  const p = pos.toUpperCase();
  if (p === "K") return "fg";
  if (p === "DEF" || p === "DST" || p === "D/ST" || p === "D") return "def";
  return "ball";
};

const ROLE_POS: Record<PlayRole, string> = {
  passer: "QB", rusher: "RB", receiver: "WR", kicker: "K", returner: "", defense: "DEF",
};

function playLabel(role: PlayRole, category: ApiPlay["category"], typeText: string, isTD: boolean): string {
  if (category === "field-goal") return "Field goal";
  if (category === "safety") return "Safety";
  if (category === "two-point") return "Two-point conversion";
  const t = (typeText || "").toLowerCase();
  switch (role) {
    case "passer":   return "Touchdown pass";
    case "receiver": return "Touchdown catch";
    case "rusher":   return "Rushing TD";
    case "kicker":   return "Field goal";
    case "returner": return t.includes("punt") ? "Punt return TD" : "Kick return TD";
    case "defense":
      if (t.includes("interception")) return "Pick six";
      if (t.includes("fumble"))       return "Fumble return TD";
      if (t.includes("kick") || t.includes("punt")) return "Return TD";
      return "Defensive TD";
  }
  return isTD ? "Touchdown" : "Score";
}

function timeLabel(e: FeedEntry, nowMs: number): string {
  if (e.wallclockMs) {
    const s = Math.max(0, Math.round((nowMs - e.wallclockMs) / 1000));
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  if (e.period >= 5) return `OT ${e.clock}`.trim();
  if (e.period >= 1) return `Q${e.period} ${e.clock}`.trim();
  return "";
}

function noteFor(e: FeedEntry): string {
  const you = e.leagues.filter((l) => l.side === "you").length;
  const opp = e.leagues.filter((l) => l.side === "opp").length;
  if (you > 0 && opp > 0) return `Yours in ${you}, against you in ${opp}.`;
  if (you > 0) return you === 1 ? "Your player." : `Yours in ${you} leagues.`;
  return opp === 1 ? "Your opponent's player." : `Against you in ${opp} leagues.`;
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
    <div className="space-y-3 animate-pulse max-w-3xl mx-auto">
      <div className="h-9 w-44 bg-pitch-800 rounded" />
      <div className="h-4 w-72 bg-pitch-800 rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-7 w-20 bg-pitch-800 rounded-full" />)}
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 border border-pitch-700 border-l-[3px] bg-pitch-900 px-5 py-4">
          <div className="h-9 w-9 bg-pitch-800 rounded-lg" />
          <div className="flex-1 space-y-2.5">
            <div className="h-4 w-40 bg-pitch-800 rounded" />
            <div className="h-4 w-52 bg-pitch-800 rounded" />
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
  const [playsUnavailable, setPlaysUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [isLive, setIsLive] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [connRes, dataRes, playsRes] = await Promise.all([
        fetch("/api/user/connections", { cache: "no-store" }),
        fetch("/api/leagues/data", { cache: "no-store" }),
        fetch("/api/feed/plays", { cache: "no-store" }),
      ]);
      const [connData, data, playsData] = await Promise.all([
        connRes.json(), dataRes.json(), playsRes.json(),
      ]);

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

      // Which rosters to pull: your team + your current opponent in each league.
      const tasks: RosterTask[] = [];
      for (const league of platforms) {
        const myTeam = myTeamMap[league.leagueId];
        if (!myTeam) continue;
        tasks.push({ leagueName: league.leagueName, platform: league.platform, leagueId: league.leagueId, teamKey: myTeam.teamKey, side: "you" });
        const matchup = league.matchups.find((m) => m.teamA.key === myTeam.teamKey || m.teamB.key === myTeam.teamKey);
        if (matchup) {
          const oppKey = matchup.teamA.key === myTeam.teamKey ? matchup.teamB.key : matchup.teamA.key;
          if (oppKey) tasks.push({ leagueName: league.leagueName, platform: league.platform, leagueId: league.leagueId, teamKey: oppKey, side: "opp" });
        }
      }

      if (tasks.length === 0) {
        setNoTeams(true);
        setEntries([]);
        return;
      }
      setNoTeams(false);

      // Pull every roster in one batched request (chunked at the API's 24-item
      // cap for very large league counts); a failed item is skipped, not fatal.
      const BATCH_MAX = 24;
      const chunks: RosterTask[][] = [];
      for (let i = 0; i < tasks.length; i += BATCH_MAX) chunks.push(tasks.slice(i, i + BATCH_MAX));

      const rosters = (
        await Promise.all(
          chunks.map(async (chunk) => {
            try {
              const res = await fetch("/api/rosters/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                  items: chunk.map((t) => ({ platform: t.platform, leagueKey: t.leagueId, teamKey: t.teamKey })),
                }),
              });
              const j = await res.json();
              const results: any[] = j?.ok && Array.isArray(j.rosters) ? j.rosters : [];
              return chunk.map((t, i) => {
                const starters: RosterPlayer[] = (results[i]?.roster?.starters ?? []).map((p: any) => ({
                  name: p.name ?? "",
                  position: p.position ?? "",
                  team: p.team ?? "",
                  points: Number(p.points ?? 0),
                }));
                return { task: t, starters };
              });
            } catch {
              return chunk.map((t) => ({ task: t, starters: [] as RosterPlayer[] }));
            }
          })
        )
      ).flat();

      // Build roster membership: skill players keyed by name, defenses by team.
      const playerMembership = new Map<string, LeagueHit[]>();
      const playerInfo = new Map<string, { name: string; position: string; nflTeam: string }>();
      const defMembership = new Map<string, LeagueHit[]>();

      for (const { task, starters } of rosters) {
        for (const p of starters) {
          if (!p.name) continue;
          const hit: LeagueHit = { leagueName: task.leagueName, platform: task.platform, side: task.side, points: p.points };
          const isDef = POS_GROUP(p.position) === "def";
          if (isDef && p.team) {
            const teamKey = p.team.toUpperCase();
            (defMembership.get(teamKey) ?? defMembership.set(teamKey, []).get(teamKey)!).push(hit);
          } else {
            const key = playerKey(p.name);
            (playerMembership.get(key) ?? playerMembership.set(key, []).get(key)!).push(hit);
            if (!playerInfo.has(key)) playerInfo.set(key, { name: p.name, position: p.position, nflTeam: p.team });
          }
        }
      }

      // Overlay the week's scoring plays onto roster membership.
      const plays: ApiPlay[] = playsData?.ok ? (playsData.plays ?? []) : [];
      setPlaysUnavailable(!playsData?.ok);

      const built: FeedEntry[] = [];
      for (const play of plays) {
        for (const involved of play.players) {
          let leagues: LeagueHit[] | undefined;
          let name: string;
          let position: string;
          let nflTeam: string;

          if (involved.isTeamDefense) {
            leagues = defMembership.get(play.teamAbbr.toUpperCase());
            name = `${play.teamAbbr} D/ST`;
            position = "DEF";
            nflTeam = play.teamAbbr;
          } else {
            const key = playerKey(involved.name);
            leagues = playerMembership.get(key);
            const info = playerInfo.get(key);
            name = info?.name ?? involved.name;
            position = info?.position || ROLE_POS[involved.role] || "";
            nflTeam = info?.nflTeam || play.teamAbbr;
          }

          if (!leagues || leagues.length === 0) continue; // not in any of the user's leagues

          const hasYou = leagues.some((l) => l.side === "you");
          const hasOpp = leagues.some((l) => l.side === "opp");
          const yardsLabel =
            play.yards != null
              ? play.category === "field-goal"
                ? `${play.yards} yds`
                : `+${play.yards} yds`
              : null;

          built.push({
            key: `${play.id}:${involved.role}:${playerKey(name)}`,
            name,
            position,
            nflTeam,
            playLabel: playLabel(involved.role, play.category, play.typeText, play.isTouchdown),
            yardsLabel,
            isTouchdown: play.isTouchdown,
            wallclockMs: play.wallclockMs,
            period: play.period,
            clock: play.clock,
            sortMs: play.sortMs,
            leagues,
            hasYou,
            hasOpp,
          });
        }
      }

      built.sort((a, b) => b.sortMs - a.sortMs);
      setEntries(built);
    } catch (e: any) {
      setError(e?.message || "Failed to load the feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setNowMs(Date.now());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Auto-refresh only during live NFL windows (manual-only otherwise). Also
    // ticks `nowMs` so relative timestamps stay fresh while a window is live.
    let liveInterval: ReturnType<typeof setInterval> | null = null;
    const evaluate = () => {
      const live = isNflGameWindow();
      setIsLive(live);
      if (live && !liveInterval) {
        liveInterval = setInterval(() => { setNowMs(Date.now()); load(true); }, REFRESH_MS);
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
      case "mine":       return entries.filter((e) => e.hasYou);
      case "touchdowns": return entries.filter((e) => e.isTouchdown);
      case "helping":    return entries.filter((e) => e.hasYou && !e.hasOpp);
      case "against":    return entries.filter((e) => e.hasOpp);
      default:           return entries;
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

  // ── Connected, but no team picked in any league ──
  if (noTeams) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <h2 className="font-display text-4xl tracking-widest text-gray-200">PICK YOUR TEAMS</h2>
        <p className="text-gray-500 max-w-sm font-ui">
          Select your team on each connected league and the Feed will follow your players (and your opponents) across all of them.
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
    <div className="max-w-3xl mx-auto">
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
            className="rounded-lg border border-pitch-700 bg-pitch-900 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-pitch-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
            title="Refresh feed"
            aria-label="Refresh feed"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mt-1.5 mb-4">
        Every scoring play across your {leagueCount === 1 ? "league" : `${leagueCount} leagues`}, with how it happened. Green is your player, red is your opponent&apos;s.
      </p>

      {/* ── Filter tabs ── */}
      <div className="flex gap-5 flex-wrap border-b border-pitch-700 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`min-h-[44px] px-1 inline-flex items-center text-xs font-bold tracking-[0.12em] uppercase -mb-px border-b-2 transition-colors ${
              filter === t.id ? "text-white border-accent" : "text-gray-600 border-transparent hover:text-gray-400"
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
            {entries.length === 0 ? "No scoring for your players yet." : "Nothing matches this filter yet."}
          </p>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            {entries.length === 0
              ? "Touchdowns, field goals, and defensive scores from your rostered players stream in here during NFL game windows, across all your leagues at once."
              : "Try another tab, or check back once more games are underway."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((e) => {
            const side = e.hasYou && e.hasOpp ? "mixed" : e.hasYou ? "you" : "opp";
            const barClass = side === "you" ? "border-l-emerald-400" : side === "opp" ? "border-l-red-400" : "border-l-accent";
            const iconClass =
              side === "you"
                ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/25"
                : side === "opp"
                ? "bg-red-400/10 text-red-400 border-red-400/25"
                : "bg-accent/10 text-accent border-accent/25";

            return (
              <div key={e.key} className={`flex gap-4 border border-pitch-700 border-l-[3px] ${barClass} bg-pitch-900 px-5 py-4`}>
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
                    <span className="font-mono text-[11px] text-gray-600 whitespace-nowrap shrink-0">
                      {timeLabel(e, nowMs)}
                    </span>
                  </div>

                  {/* The play */}
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-sm font-bold text-gray-200 tracking-wide">{e.playLabel}</span>
                    {e.yardsLabel && <span className="font-mono text-xs font-bold text-accent">{e.yardsLabel}</span>}
                  </div>

                  {/* Per-league chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {e.leagues.map((l, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11.5px] font-semibold bg-pitch-800 ${
                          l.side === "you" ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${l.side === "you" ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                          {l.side === "you" ? "you" : "opp"}
                        </span>
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
        Plays from the NFL play-by-play feed. League chips show each player&apos;s points-to-date in that league.
        {playsUnavailable ? " Live plays are momentarily unavailable." : ""}
      </p>
    </div>
  );
}
