"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import MatchupCard from "@/components/MatchupCard";
import { RefreshCw, CalendarDays, Link as LinkIcon } from "lucide-react";
import DashboardSkeleton from "@/components/DashboardSkeleton";

// ─── Types (mirrors /api/leagues/data response) ───────────────────────────────

type PlatformMatchup = {
  id: string;
  teamA: { name: string; points: number; projectedPoints: number; key: string };
  teamB: { name: string; points: number; projectedPoints: number; key: string };
};

type PlatformTeam = {
  name: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
};

type PlatformLeagueData = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  leagueName: string;
  currentWeek: number;
  season: number;
  matchups: PlatformMatchup[];
  teams: PlatformTeam[];
  rosterPositions: { position: string; count: number }[];
};

// ─── Platform badge colours ───────────────────────────────────────────────────

const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  yahoo:   { bg: "bg-purple-600",   text: "text-white",      label: "Yahoo"   },
  sleeper: { bg: "bg-[#01B86C]",    text: "text-white",      label: "Sleeper" },
  espn:    { bg: "bg-[#E8002D]",    text: "text-white",      label: "ESPN"    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedStandings(teams: PlatformTeam[]): PlatformTeam[] {
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
}

// ─── Empty / CTA states ───────────────────────────────────────────────────────

function NoPlatformsConnected() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
      <div className="text-5xl">🏈</div>
      <h2 className="text-xl font-semibold text-gray-100">No leagues connected yet</h2>
      <p className="text-gray-400 max-w-sm">
        Connect your Yahoo, Sleeper, or ESPN fantasy leagues to start seeing your matchups and standings here.
      </p>
      <Link
        href="/connect"
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
      >
        <LinkIcon className="w-4 h-4" />
        Connect a League
      </Link>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardContent() {
  const [platforms, setPlatforms] = useState<PlatformLeagueData[]>([]);
  const [activePlatformIdx, setActivePlatformIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noConnections, setNoConnections] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<number | undefined>(undefined);

  const load = useCallback(async (opts?: { weekOverride?: number; silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // 1. Check connections
      const connRes = await fetch("/api/user/connections", { cache: "no-store" });
      const connData = await connRes.json();
      if (!connData.ok || !connData.hasAnyConnection) {
        setNoConnections(true);
        return;
      }
      setNoConnections(false);

      // 2. Fetch unified league data
      const params = new URLSearchParams();
      const targetWeek = opts?.weekOverride ?? week;
      if (targetWeek) params.set("week", String(targetWeek));

      const dataRes = await fetch(
        `/api/leagues/data${params.size ? `?${params}` : ""}`,
        { cache: "no-store" }
      );
      const data = await dataRes.json();

      if (data.ok && Array.isArray(data.platforms)) {
        setPlatforms(data.platforms);
        // Reset tab to first platform on fresh load only
        if (!opts?.silent) setActivePlatformIdx(0);
      } else {
        setError(data.error ?? "Failed to load league data");
      }
    } catch (e: any) {
      setError(e?.message || "An error occurred");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [week]);

  useEffect(() => {
    load();
    // Listen for Yahoo league-selected events (fired by YahooAuth header component)
    const onLeagueSelected = () => load({ silent: true });
    window.addEventListener("fbl:league-selected", onLeagueSelected);
    return () => window.removeEventListener("fbl:league-selected", onLeagueSelected);
  }, [load]);

  // ── Loading ──
  if (loading) return <DashboardSkeleton />;

  // ── No connections ──
  if (noConnections) return <NoPlatformsConnected />;

  // ── Error with no data ──
  if (error && platforms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => load()}
          className="text-sm text-blue-400 hover:text-blue-300 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── No data (connected but nothing loaded yet — e.g. pre-season) ──
  if (platforms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <p className="text-gray-400">No league data available right now.</p>
        <Link href="/connect" className="text-sm text-blue-400 hover:text-blue-300 underline">
          Check connected leagues →
        </Link>
      </div>
    );
  }

  const active = platforms[activePlatformIdx] ?? platforms[0];
  const pStyle = PLATFORM_STYLE[active.platform] ?? PLATFORM_STYLE.yahoo;
  const standings = sortedStandings(active.teams);

  return (
    <div className="space-y-6">
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight truncate">
          {active.leagueName}
        </h1>

        {/* Platform tabs — only shown when > 1 platform connected */}
        {platforms.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {platforms.map((p, i) => {
              const s = PLATFORM_STYLE[p.platform] ?? PLATFORM_STYLE.yahoo;
              return (
                <button
                  key={p.platform + p.leagueId}
                  onClick={() => setActivePlatformIdx(i)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    i === activePlatformIdx
                      ? `${s.bg} ${s.text}`
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Platform badge (single platform case) */}
        {platforms.length === 1 && (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${pStyle.bg} ${pStyle.text}`}>
            {pStyle.label}
          </span>
        )}

        {/* Controls */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <span>Week {active.currentWeek}</span>
          </div>
          <button
            onClick={() => load({ silent: true })}
            disabled={refreshing}
            className="rounded-lg border border-gray-700 bg-gray-900 p-1.5 hover:bg-gray-800 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/connect"
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs hover:bg-gray-800 flex items-center gap-1.5 text-gray-300"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Leagues
          </Link>
        </div>
      </div>

      {/* ── Main content grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Scoreboard */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Scoreboard">
            {active.matchups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {active.matchups.map((m) => (
                  <MatchupCard
                    key={m.id}
                    aName={m.teamA.name}
                    bName={m.teamB.name}
                    aPoints={m.teamA.points}
                    bPoints={m.teamB.points}
                    aKey={m.teamA.key}
                    bKey={m.teamB.key}
                    week={active.currentWeek}
                    rosterPositions={active.rosterPositions}
                    platform={active.platform}
                    leagueKey={active.leagueId}
                    AnalyzeMatchup={AnalyzeMatchup}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No matchups available for this week.</p>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card title="Standings">
            {standings.length > 0 ? (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-700 text-gray-400">
                    <th className="py-2">Team</th>
                    <th className="text-center">W</th>
                    <th className="text-center">L</th>
                    <th className="text-right">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/50"
                    >
                      <td className="py-2 truncate max-w-[140px] font-medium">{t.name}</td>
                      <td className="text-center">{t.wins}</td>
                      <td className="text-center">{t.losses}</td>
                      <td className="text-right">{t.pointsFor.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No standings yet.</p>
            )}
          </Card>

          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li><span className="font-medium">Season:</span> {active.season}</li>
              <li><span className="font-medium">Week:</span> {active.currentWeek}</li>
              <li><span className="font-medium">Teams:</span> {active.teams.length}</li>
              <li>
                <span className="font-medium">Platform:</span>{" "}
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${pStyle.bg} ${pStyle.text}`}>
                  {pStyle.label}
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
