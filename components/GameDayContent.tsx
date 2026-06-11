"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import LeagueErrorBanner, { type LeagueLoadError } from "@/components/LeagueErrorBanner";
import OffseasonPanel from "@/components/OffseasonPanel";
import Logo from "@/components/Logo";
import { fmtPts } from "@/lib/format";
import { isNflGameWindow } from "@/lib/gameWindow";
import { RefreshCw, Link as LinkIcon, Sparkles, ArrowRight, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CalendarOff } from "lucide-react";

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

type MyMatchup = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueName: string;
  leagueId: string;
  week: number;
  rosterPositions: { position: string; count: number }[];
  matchup: PlatformMatchup;
  myTeam: MyTeam;
  isTeamA: boolean;
};

/** A league where you have a team but no matchup this week (eliminated,
 *  bye, or the season's final round didn't include you). */
type IdleLeague = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueName: string;
  leagueId: string;
  week: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  yahoo: "Yahoo", sleeper: "Sleeper", espn: "ESPN",
};

const PLATFORM_DOT: Record<string, string> = {
  yahoo: "bg-purple-400", sleeper: "bg-emerald-400", espn: "bg-red-400",
};

const REFRESH_MS = 45_000;
const WINDOW_CHECK_MS = 60_000;

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function GameDaySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 bg-pitch-800 rounded" />
      {[1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden">
          <div className="px-6 py-3.5 border-b border-pitch-700/60 flex gap-3 items-center">
            <div className="h-4 w-4 bg-pitch-700 rounded-full" />
            <div className="h-4 w-14 bg-pitch-800 rounded" />
            <div className="h-4 w-40 bg-pitch-800 rounded" />
          </div>
          <div className="px-6 py-8 flex items-center gap-6">
            <div className="flex-1 text-center space-y-3">
              <div className="h-3 w-16 bg-pitch-800 rounded mx-auto" />
              <div className="h-4 w-32 bg-pitch-700 rounded mx-auto" />
              <div className="h-16 w-24 bg-pitch-800 rounded mx-auto" />
            </div>
            <div className="w-24 flex flex-col items-center gap-2">
              <div className="h-7 w-20 bg-pitch-800 rounded-full" />
              <div className="h-3 w-10 bg-pitch-800 rounded" />
            </div>
            <div className="flex-1 text-center space-y-3">
              <div className="h-3 w-16 bg-pitch-800 rounded mx-auto" />
              <div className="h-4 w-32 bg-pitch-700 rounded mx-auto" />
              <div className="h-12 w-20 bg-pitch-800 rounded mx-auto" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameDayContent() {
  const [myMatchups, setMyMatchups] = useState<MyMatchup[]>([]);
  const [idleLeagues, setIdleLeagues] = useState<IdleLeague[]>([]);
  /** null = the live/current week; a number = browsing history */
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const [loadErrors, setLoadErrors] = useState<LeagueLoadError[]>([]);
  const [noConnections, setNoConnections] = useState(false);
  const [noTeamsSelected, setNoTeamsSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  // Signature of the matchup set the current narrative describes. We only clear
  // the AI summary when the week/team/league mix actually changes, so the 45s
  // background refresh never wipes it mid-read.
  const narrativeKeyRef = useRef<string>("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const dataUrl = viewWeek !== null ? `/api/leagues/data?week=${viewWeek}` : "/api/leagues/data";
      const [connRes, dataRes] = await Promise.all([
        fetch("/api/user/connections", { cache: "no-store" }),
        fetch(dataUrl, { cache: "no-store" }),
      ]);
      const [connData, data] = await Promise.all([connRes.json(), dataRes.json()]);

      if (!connData.ok || !connData.hasAnyConnection) {
        setNoConnections(true);
        return;
      }
      setNoConnections(false);

      const platforms: PlatformLeagueData[] = data.ok ? (data.platforms ?? []) : [];
      setLoadErrors(data.ok && Array.isArray(data.errors) ? data.errors : []);

      // Build leagueId → myTeam map (per-league, multi-league aware)
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

      const found: MyMatchup[] = [];
      const idle: IdleLeague[] = [];
      for (const league of platforms) {
        const myTeam = myTeamMap[league.leagueId];
        if (!myTeam) continue;
        const matchup = league.matchups.find(
          (m) => m.teamA.key === myTeam.teamKey || m.teamB.key === myTeam.teamKey
        );
        if (!matchup) {
          idle.push({
            platform: league.platform,
            leagueName: league.leagueName,
            leagueId: league.leagueId,
            week: league.currentWeek,
          });
          continue;
        }
        found.push({
          platform: league.platform,
          leagueName: league.leagueName,
          leagueId: league.leagueId,
          week: league.currentWeek,
          rosterPositions: league.rosterPositions,
          matchup,
          myTeam,
          isTeamA: matchup.teamA.key === myTeam.teamKey,
        });
      }

      // "No teams" means: connected, but no team picked in any league. An empty
      // `found` with teams picked is the off-season / no-matchups case instead.
      setNoTeamsSelected(Object.keys(myTeamMap).length === 0);
      setMyMatchups(found);
      setIdleLeagues(idle);

      // Clear the AI narrative only when the matchup context actually changed
      // (different week, team, or league set), never on a background refresh.
      const narrativeKey = found
        .map((f) => `${f.platform}:${f.leagueId}:${f.week}:${f.myTeam.teamKey}`)
        .sort()
        .join("|");
      if (narrativeKeyRef.current !== narrativeKey) {
        narrativeKeyRef.current = narrativeKey;
        setNarrative(null);
        setNarrativeError(null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewWeek]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Re-check the game window every minute and start/stop the 45s live refresh
    // accordingly — so it engages even if the page was opened just before
    // kickoff, and stops once games end, without a reload.
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

  async function fetchNarrative() {
    if (myMatchups.length === 0) return;
    setNarrativeLoading(true);
    setNarrativeError(null);
    setNarrative(null);

    const payload = myMatchups.map((m) => ({
      platform: m.platform,
      leagueName: m.leagueName,
      week: m.week,
      myTeamName: m.myTeam.teamName,
      myScore: m.isTeamA ? m.matchup.teamA.points : m.matchup.teamB.points,
      oppName: m.isTeamA ? m.matchup.teamB.name : m.matchup.teamA.name,
      oppScore: m.isTeamA ? m.matchup.teamB.points : m.matchup.teamA.points,
    }));

    try {
      const res = await fetch("/api/gameday/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchups: payload }),
      });
      const j = await res.json();
      if (j.ok && j.narrative) {
        setNarrative(j.narrative);
      } else {
        setNarrativeError(j.message ?? j.error ?? "Failed to generate summary");
      }
    } catch {
      setNarrativeError("Network error. Try again.");
    } finally {
      setNarrativeLoading(false);
    }
  }

  // ── Loading ──
  if (loading) return <GameDaySkeleton />;

  // ── No connections ──
  if (noConnections) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <div className="opacity-25" aria-hidden="true"><Logo className="h-24 w-auto text-accent" /></div>
        <h2 className="font-display text-4xl tracking-widest text-gray-200">CONNECT A LEAGUE</h2>
        <p className="text-gray-500 max-w-sm font-ui">
          Link a Yahoo, Sleeper, or ESPN league and Game Day will show your live matchups here.
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
  if (noTeamsSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <div className="opacity-25" aria-hidden="true"><Logo className="h-24 w-auto text-accent" /></div>
        <h2 className="font-display text-4xl tracking-widest text-gray-200">PICK YOUR TEAMS</h2>
        <p className="text-gray-500 max-w-sm font-ui">
          Go to Leagues, select your team on each connected platform, and Game Day will show your matchups here.
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

  // ── No active matchups (and not week-browsing or sitting out a round) ──
  if (myMatchups.length === 0 && idleLeagues.length === 0 && viewWeek === null) {
    return (
      <div className="py-16 space-y-4 max-w-md mx-auto">
        {loadErrors.length > 0 && <LeagueErrorBanner errors={loadErrors} />}
        <div className="text-center space-y-3">
          <p className="text-gray-400">No matchups to show yet.</p>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            Your weekly matchups appear here once the season kicks off. If games are
            underway, make sure you&apos;ve picked your team for each league.
          </p>
          <Link href="/connect" className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-soft underline">
            Check connected leagues <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <OffseasonPanel />
      </div>
    );
  }

  // ── Cross-league "your week" summary ──
  // Off-season (every matchup still 0-0) renders no strip at all.
  const summary = (() => {
    let wins = 0, losses = 0, close = 0, scored = 0;
    for (const m of myMatchups) {
      const my = m.isTeamA ? m.matchup.teamA.points : m.matchup.teamB.points;
      const opp = m.isTeamA ? m.matchup.teamB.points : m.matchup.teamA.points;
      if (my <= 0 && opp <= 0) continue;
      scored++;
      if (my > opp) wins++;
      else if (my < opp) losses++;
      if (Math.abs(my - opp) < 10) close++;
    }
    if (scored === 0) return null;
    return { wins, losses, close, total: myMatchups.length };
  })();

  const baselineWeek =
    myMatchups.reduce((max, m) => Math.max(max, m.week), 0) ||
    idleLeagues.reduce((max, l) => Math.max(max, l.week), 0) ||
    1;

  return (
    <div className="space-y-6">
      <LeagueErrorBanner errors={loadErrors} />

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">GAME DAY</h1>

        {isLive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/30 border border-green-500/30 text-green-400 text-xs font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        )}

        {/* Week navigator: browse any week; "Live" returns to the current one */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewWeek(Math.max(1, (viewWeek ?? baselineWeek) - 1))}
            aria-label="Previous week"
            className="rounded-lg border border-pitch-700 bg-pitch-900 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-pitch-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-400" />
          </button>
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase min-w-[64px] text-center">
            {viewWeek === null ? `Wk ${baselineWeek}` : `Wk ${viewWeek}`}
          </span>
          <button
            onClick={() => setViewWeek(Math.min(18, (viewWeek ?? baselineWeek) + 1))}
            aria-label="Next week"
            className="rounded-lg border border-pitch-700 bg-pitch-900 min-h-[36px] min-w-[36px] flex items-center justify-center hover:bg-pitch-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
          {viewWeek !== null && (
            <button
              onClick={() => setViewWeek(null)}
              className="px-2.5 py-1 rounded-full bg-accent-strong/15 border border-accent-strong/40 text-accent text-xs font-bold tracking-wider hover:bg-accent-strong/25 transition-colors"
            >
              LATEST
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchNarrative}
            disabled={narrativeLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-strong/30 bg-accent-strong/10 text-accent hover:bg-accent-strong/20 text-xs font-bold tracking-wider transition-colors disabled:opacity-40"
            title="AI Game Day Summary"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {narrativeLoading ? "GENERATING..." : "AI SUMMARY"}
          </button>

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-pitch-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
            title="Refresh scores"
            aria-label="Refresh scores"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── AI Narrative card ── */}
      {(narrative || narrativeError) && (
        <div className={`rounded-xl border px-5 py-4 ${
          narrativeError
            ? "border-red-800/40 bg-red-900/10 text-red-400"
            : "border-accent-strong/30 bg-accent-strong/10"
        }`}>
          {narrativeError ? (
            <p className="text-sm">{narrativeError}</p>
          ) : (
            <div className="flex gap-3">
              <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed text-gray-200">{narrative}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Cross-league summary strip ── */}
      {summary && (
        <div className="rounded-xl border border-pitch-700 bg-pitch-900 px-5 py-3.5 flex items-center gap-3 flex-wrap shadow-lg shadow-black/30">
          <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
            Your Week
          </span>
          <span className="font-display text-2xl leading-none tabular-nums text-accent">
            {summary.wins}-{summary.losses}
          </span>
          <span className="text-sm text-gray-400">
            across {summary.total} {summary.total === 1 ? "league" : "leagues"}
            {summary.close > 0 && (
              <>, {summary.close} close {summary.close === 1 ? "game" : "games"}</>
            )}
          </span>
        </div>
      )}

      {/* ── Matchup hero cards ── */}
      <div className="space-y-5">
        {myMatchups.map((m) => {
          const myScore  = m.isTeamA ? m.matchup.teamA.points : m.matchup.teamB.points;
          const oppScore = m.isTeamA ? m.matchup.teamB.points : m.matchup.teamA.points;
          const oppName  = m.isTeamA ? m.matchup.teamB.name   : m.matchup.teamA.name;
          const myKey    = m.isTeamA ? m.matchup.teamA.key    : m.matchup.teamB.key;
          const oppKey   = m.isTeamA ? m.matchup.teamB.key    : m.matchup.teamA.key;
          const diff = Math.abs(myScore - oppScore);
          const isOpen = expandedId === m.matchup.id;

          const winning = myScore > oppScore;
          const losing  = myScore < oppScore;
          const tied    = myScore === oppScore;

          const statusLabel = winning ? "WINNING" : losing ? "LOSING" : "TIED";
          const statusClasses = winning
            ? "border-accent-strong/50 bg-accent-strong/15 text-accent"
            : losing
            ? "border-red-700/50 bg-red-900/20 text-red-400"
            : "border-pitch-600 bg-pitch-800/60 text-gray-400";

          const myScoreColor  = winning ? "text-accent" : losing ? "text-red-400" : "text-gray-200";
          const oppScoreColor = losing  ? "text-white"     : "text-gray-600";

          return (
            <div
              key={m.platform + m.matchup.id}
              className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40"
            >
              {/* Platform + league header */}
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[m.platform] ?? "bg-gray-400"}`} />
                  <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase shrink-0">
                    {PLATFORM_LABEL[m.platform]}
                  </span>
                  <span className="text-pitch-500 shrink-0">·</span>
                  <span className="text-sm text-gray-400 truncate">{m.leagueName}</span>
                </div>
                <span className="text-xs font-bold tracking-[0.15em] text-gray-600 shrink-0 uppercase">
                  Wk {m.week}
                </span>
              </div>

              {/* Score hero */}
              <div className="px-6 py-8">
                <div className="flex items-center gap-3 sm:gap-8">
                  {/* My team */}
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[10px] font-bold tracking-[0.2em] text-accent-strong/80 mb-1.5 uppercase">
                      My Team
                    </div>
                    <div className="font-semibold text-gray-200 text-sm mb-3 truncate px-1 leading-snug">
                      {m.myTeam.teamName}
                    </div>
                    <div
                      className={`font-display leading-none tabular-nums ${myScoreColor}`}
                      style={{ fontSize: "clamp(3.5rem, 10vw, 6rem)" }}
                    >
                      {fmtPts(myScore)}
                    </div>
                  </div>

                  {/* Status column */}
                  <div className="flex flex-col items-center gap-2 shrink-0 w-20 sm:w-28">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] border ${statusClasses}`}>
                      {statusLabel}
                    </span>
                    {diff > 0 && (
                      <span className="text-[11px] text-gray-600">by {fmtPts(diff)}</span>
                    )}
                    <span className="text-gray-700 text-xs font-bold tracking-widest mt-0.5">VS</span>
                  </div>

                  {/* Opponent */}
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[10px] font-bold tracking-[0.2em] text-gray-600 mb-1.5 uppercase">
                      Opponent
                    </div>
                    <div className="font-semibold text-gray-500 text-sm mb-3 truncate px-1 leading-snug">
                      {oppName}
                    </div>
                    <div
                      className={`font-display leading-none tabular-nums ${oppScoreColor}`}
                      style={{ fontSize: "clamp(2.5rem, 7.5vw, 4.5rem)" }}
                    >
                      {fmtPts(oppScore)}
                    </div>
                  </div>
                </div>

                {/* Toggle */}
                <div className="mt-7 pt-5 border-t border-pitch-700/50 text-center">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : m.matchup.id)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-xs font-bold tracking-[0.15em] text-gray-500 hover:text-accent transition-colors uppercase"
                  >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isOpen ? "Hide Rosters & Analysis" : "See Rosters & Analysis"}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-pitch-700/60 p-4">
                  <MatchupCard
                    /* Always render the user's team on the left so rosters +
                       analysis match the headline above (which puts My Team first). */
                    aName={m.myTeam.teamName}
                    bName={oppName}
                    aPoints={myScore}
                    bPoints={oppScore}
                    aKey={myKey}
                    bKey={oppKey}
                    week={m.week}
                    rosterPositions={m.rosterPositions}
                    platform={m.platform}
                    leagueKey={m.leagueId}
                    leagueName={m.leagueName}
                    analyzeContext="live"
                    embedded
                    AnalyzeMatchup={AnalyzeMatchup}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Leagues where you have a team but no matchup this round: say so
            instead of silently omitting them (reads as a bug otherwise). */}
        {idleLeagues.map((l) => (
          <div
            key={l.platform + l.leagueId}
            className="rounded-2xl border border-pitch-700/60 bg-pitch-900/50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 opacity-60 ${PLATFORM_DOT[l.platform] ?? "bg-gray-400"}`} />
                <span className="text-xs font-bold tracking-[0.15em] text-gray-500 uppercase shrink-0">
                  {PLATFORM_LABEL[l.platform]}
                </span>
                <span className="text-pitch-500 shrink-0">·</span>
                <span className="text-sm text-gray-500 truncate">{l.leagueName}</span>
              </div>
              <span className="text-xs font-bold tracking-[0.15em] text-gray-600 shrink-0 uppercase">
                Wk {l.week}
              </span>
            </div>
            <div className="px-6 py-5 flex items-center gap-3">
              <CalendarOff className="w-4 h-4 text-gray-600 shrink-0" aria-hidden="true" />
              <p className="text-sm text-gray-500">
                No matchup for your team this week. Playoff rounds and season finales only
                include the teams still playing.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
