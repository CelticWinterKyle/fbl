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

const PLATFORM_LABEL: Record<string, string> = {
  yahoo: "Yahoo", sleeper: "Sleeper", espn: "ESPN",
};

const PLATFORM_DOT: Record<string, string> = {
  yahoo: "bg-purple-400", sleeper: "bg-emerald-400", espn: "bg-red-400",
};

const REFRESH_MS = 45_000;

// ─── Game window detection ────────────────────────────────────────────────────

function isNflGameWindow(): boolean {
  try {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    if (day === 0) return mins >= 720;
    if (day === 1 || day === 4) return mins >= 1170;
    if (day === 6) return mins >= 780;
    return false;
  } catch {
    return false;
  }
}

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
  const [noTeamsSelected, setNoTeamsSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

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
      for (const league of platforms) {
        const myTeam = myTeamMap[league.leagueId];
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
      if (silent) setNarrative(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <div className="font-display text-[80px] leading-none text-amber-400/20 select-none">FB</div>
        <h2 className="font-display text-4xl tracking-widest text-gray-200">PICK YOUR TEAMS</h2>
        <p className="text-gray-500 max-w-sm font-ui">
          Go to Leagues, select your team on each connected platform, and Game Day will show your matchups here.
        </p>
        <Link
          href="/connect"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors font-ui tracking-wider text-sm"
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
        <button onClick={() => load()} className="text-sm text-amber-400 hover:text-amber-300 underline">
          Try again
        </button>
      </div>
    );
  }

  // ── No active matchups ──
  if (myMatchups.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-gray-500">No active matchups found this week.</p>
        <Link href="/connect" className="text-sm text-amber-400 hover:text-amber-300 underline">
          Check connected leagues →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">GAME DAY</h1>

        {isLive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/30 border border-green-500/30 text-green-400 text-xs font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            LIVE
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchNarrative}
            disabled={narrativeLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-bold tracking-wider transition-colors disabled:opacity-40"
            title="AI Game Day Summary"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {narrativeLoading ? "GENERATING..." : "AI SUMMARY"}
          </button>

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 p-1.5 hover:bg-pitch-800 disabled:opacity-50 transition-colors"
            title="Refresh scores"
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
            : "border-amber-700/30 bg-amber-900/10"
        }`}>
          {narrativeError ? (
            <p className="text-sm">{narrativeError}</p>
          ) : (
            <div className="flex gap-3">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed text-gray-200">{narrative}</p>
            </div>
          )}
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
            ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
            : losing
            ? "border-red-700/50 bg-red-900/20 text-red-400"
            : "border-pitch-600 bg-pitch-800/60 text-gray-400";

          const myScoreColor  = winning ? "text-amber-400" : losing ? "text-red-400" : "text-gray-200";
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
                    <div className="text-[10px] font-bold tracking-[0.2em] text-amber-500/80 mb-1.5 uppercase">
                      My Team
                    </div>
                    <div className="font-semibold text-gray-200 text-sm mb-3 truncate px-1 leading-snug">
                      {m.myTeam.teamName}
                    </div>
                    <div
                      className={`font-display leading-none tabular-nums ${myScoreColor}`}
                      style={{ fontSize: "clamp(3.5rem, 10vw, 6rem)" }}
                    >
                      {myScore.toFixed(1)}
                    </div>
                  </div>

                  {/* Status column */}
                  <div className="flex flex-col items-center gap-2 shrink-0 w-20 sm:w-28">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] border ${statusClasses}`}>
                      {statusLabel}
                    </span>
                    {diff > 0 && (
                      <span className="text-[11px] text-gray-600">by {diff.toFixed(1)}</span>
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
                      {oppScore.toFixed(1)}
                    </div>
                  </div>
                </div>

                {/* Toggle */}
                <div className="mt-7 pt-5 border-t border-pitch-700/50 text-center">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : m.matchup.id)}
                    className="text-xs font-bold tracking-[0.15em] text-gray-500 hover:text-amber-400 transition-colors uppercase"
                  >
                    {isOpen ? "▲ Hide Rosters & Analysis" : "▼ See Rosters & Analysis"}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-pitch-700/60 p-4">
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
                    analyzeContext="live"
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
