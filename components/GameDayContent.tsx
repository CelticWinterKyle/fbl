"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import { RefreshCw, Link as LinkIcon, Sparkles } from "lucide-react";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  yahoo:   { bg: "bg-purple-600",  text: "text-white", label: "Yahoo"   },
  sleeper: { bg: "bg-[#01B86C]",   text: "text-white", label: "Sleeper" },
  espn:    { bg: "bg-[#E8002D]",   text: "text-white", label: "ESPN"    },
};

// Refresh interval during active game windows
const REFRESH_MS = 45_000;

// ─── Game window detection ────────────────────────────────────────────────────
// Returns true if we're currently in an NFL game window (using ET timezone).

function isNflGameWindow(): boolean {
  try {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = et.getDay();  // 0=Sun 1=Mon 4=Thu 6=Sat
    const mins = et.getHours() * 60 + et.getMinutes();

    if (day === 0) return mins >= 720;           // Sunday  ≥ noon ET
    if (day === 1 || day === 4) return mins >= 1170; // Mon/Thu ≥ 7:30 pm ET
    if (day === 6) return mins >= 780;           // Saturday ≥ 1 pm ET (late season)
    return false;
  } catch {
    return false;
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function GameDaySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 bg-gray-700 rounded" />
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-700 bg-gray-900/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700/60 flex gap-2">
            <div className="h-5 w-14 bg-gray-700 rounded-full" />
            <div className="h-5 w-36 bg-gray-800 rounded" />
          </div>
          <div className="px-5 py-6 flex items-center gap-4">
            <div className="flex-1 space-y-2 text-center">
              <div className="h-3 w-16 bg-gray-700 rounded mx-auto" />
              <div className="h-4 w-28 bg-gray-700 rounded mx-auto" />
              <div className="h-10 w-16 bg-gray-700 rounded mx-auto" />
            </div>
            <div className="w-20 h-8 bg-gray-700 rounded-full mx-auto" />
            <div className="flex-1 space-y-2 text-center">
              <div className="h-3 w-16 bg-gray-700 rounded mx-auto" />
              <div className="h-4 w-28 bg-gray-700 rounded mx-auto" />
              <div className="h-10 w-16 bg-gray-700 rounded mx-auto" />
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
  const [noTeamsSelected, setNoTeamsSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  // AI narrative state
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

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
        setNoTeamsSelected(true);
        return;
      }

      const platforms: PlatformLeagueData[] = data.ok ? (data.platforms ?? []) : [];
      const conns = connData.connections as Record<string, { myTeam: MyTeam | null }>;

      const found: MyMatchup[] = [];
      for (const league of platforms) {
        const myTeam = conns[league.platform]?.myTeam;
        if (!myTeam) continue;

        const matchup = league.matchups.find(
          (m) => m.teamA.key === myTeam.teamKey || m.teamB.key === myTeam.teamKey
        );
        if (!matchup) continue;

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

      setNoTeamsSelected(found.length === 0);
      setMyMatchups(found);
      // Clear stale narrative when data refreshes
      if (silent) setNarrative(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Auto-refresh during NFL game windows
  useEffect(() => {
    const live = isNflGameWindow();
    setIsLive(live);
    if (!live) return;
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
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
      setNarrativeError("Network error — try again");
    } finally {
      setNarrativeLoading(false);
    }
  }

  // ── Loading ──
  if (loading) return <GameDaySkeleton />;

  // ── No teams selected ──
  if (noTeamsSelected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <div className="text-5xl">🏈</div>
        <h2 className="text-xl font-semibold text-gray-100">Pick your teams first</h2>
        <p className="text-gray-400 max-w-sm">
          Go to Leagues, select your team on each connected platform, and Game Day will show your matchups here.
        </p>
        <Link
          href="/connect"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
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
        <button onClick={() => load()} className="text-sm text-blue-400 hover:text-blue-300 underline">
          Try again
        </button>
      </div>
    );
  }

  // ── No active matchups ──
  if (myMatchups.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-gray-400">No active matchups found this week.</p>
        <Link href="/connect" className="text-sm text-blue-400 hover:text-blue-300 underline">
          Check connected leagues →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold tracking-tight">Game Day</h1>

        {isLive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-green-600/20 border border-green-500/30 text-green-400 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE · auto-refresh
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* AI narrative button */}
          <button
            onClick={fetchNarrative}
            disabled={narrativeLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-600/40 bg-purple-600/10 text-purple-300 hover:bg-purple-600/20 text-xs font-medium transition-colors disabled:opacity-50"
            title="AI Game Day Summary"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {narrativeLoading ? "Generating..." : "AI Summary"}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-gray-700 bg-gray-900 p-1.5 hover:bg-gray-800 disabled:opacity-50"
            title="Refresh scores"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── AI Narrative card ── */}
      {(narrative || narrativeError) && (
        <div className={`rounded-xl border px-5 py-4 text-sm ${
          narrativeError
            ? "border-red-800/40 bg-red-900/10 text-red-400"
            : "border-purple-700/40 bg-purple-900/10 text-gray-200"
        }`}>
          {narrativeError ? (
            narrativeError
          ) : (
            <div className="flex gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{narrative}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Matchup cards ── */}
      <div className="space-y-5">
        {myMatchups.map((m) => {
          const pStyle = PLATFORM_STYLE[m.platform] ?? PLATFORM_STYLE.yahoo;
          const myScore  = m.isTeamA ? m.matchup.teamA.points : m.matchup.teamB.points;
          const oppScore = m.isTeamA ? m.matchup.teamB.points : m.matchup.teamA.points;
          const oppName  = m.isTeamA ? m.matchup.teamB.name   : m.matchup.teamA.name;
          const myKey    = m.isTeamA ? m.matchup.teamA.key    : m.matchup.teamB.key;
          const oppKey   = m.isTeamA ? m.matchup.teamB.key    : m.matchup.teamA.key;
          const diff = Math.abs(myScore - oppScore);
          const isOpen = expandedId === m.matchup.id;

          let statusLabel = "TIED";
          let statusColor = "bg-gray-600 text-gray-200";
          if (myScore > oppScore) { statusLabel = "WINNING"; statusColor = "bg-green-600 text-white"; }
          else if (myScore < oppScore) { statusLabel = "LOSING"; statusColor = "bg-red-600 text-white"; }

          return (
            <div
              key={m.platform + m.matchup.id}
              className="rounded-xl border border-gray-700 bg-gray-900/70 overflow-hidden"
            >
              {/* Platform + league header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${pStyle.bg} ${pStyle.text}`}>
                    {pStyle.label}
                  </span>
                  <span className="text-sm text-gray-400 truncate">{m.leagueName}</span>
                </div>
                <span className="text-xs text-gray-500 shrink-0">Week {m.week}</span>
              </div>

              {/* Score hero */}
              <div className="px-5 py-6">
                <div className="flex items-center gap-2 sm:gap-6">
                  {/* My team */}
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-blue-400 mb-1">
                      My Team
                    </div>
                    <div className="font-semibold text-white text-sm mb-2 truncate px-1">
                      {m.myTeam.teamName}
                    </div>
                    <div className={`text-4xl sm:text-5xl font-bold tabular-nums ${myScore >= oppScore ? "text-white" : "text-gray-500"}`}>
                      {myScore.toFixed(1)}
                    </div>
                  </div>

                  {/* Status column */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0 w-20 sm:w-24">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${statusColor}`}>
                      {statusLabel}
                    </span>
                    {diff > 0 && (
                      <span className="text-[11px] text-gray-500">by {diff.toFixed(1)}</span>
                    )}
                    <span className="text-gray-600 text-sm mt-1">vs</span>
                  </div>

                  {/* Opponent */}
                  <div className="flex-1 text-center min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1">
                      Opponent
                    </div>
                    <div className="font-semibold text-gray-300 text-sm mb-2 truncate px-1">
                      {oppName}
                    </div>
                    <div className={`text-4xl sm:text-5xl font-bold tabular-nums ${oppScore > myScore ? "text-white" : "text-gray-500"}`}>
                      {oppScore.toFixed(1)}
                    </div>
                  </div>
                </div>

                {/* Toggle */}
                <div className="mt-5 pt-4 border-t border-gray-700/50 text-center">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : m.matchup.id)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {isOpen ? "Hide Rosters & Analysis ↑" : "See Rosters & Analysis ↓"}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-700/60 p-4">
                  <MatchupCard
                    aName={m.isTeamA ? m.myTeam.teamName : oppName}
                    bName={m.isTeamA ? oppName : m.myTeam.teamName}
                    aPoints={m.isTeamA ? myScore : oppScore}
                    bPoints={m.isTeamA ? oppScore : myScore}
                    aKey={m.isTeamA ? myKey : oppKey}
                    bKey={m.isTeamA ? oppKey : myKey}
                    week={m.week}
                    rosterPositions={m.rosterPositions}
                    platform={m.platform}
                    leagueKey={m.leagueId}
                    AnalyzeMatchup={AnalyzeMatchup}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
