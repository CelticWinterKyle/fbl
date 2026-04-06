"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import MatchupCard from "@/components/MatchupCard";
import { RefreshCw, Link as LinkIcon, ChevronDown, Trophy } from "lucide-react";
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

type MyTeam = { teamKey: string; teamName: string } | null;

// ─── Platform styles ──────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string; accent: string }> = {
  yahoo:   { bg: "bg-purple-600",  text: "text-white", label: "Yahoo",   accent: "border-purple-500/40 bg-purple-500/10 text-purple-300" },
  sleeper: { bg: "bg-[#01B86C]",   text: "text-white", label: "Sleeper", accent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  espn:    { bg: "bg-[#E8002D]",   text: "text-white", label: "ESPN",    accent: "border-red-500/40 bg-red-500/10 text-red-300" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortedStandings(teams: PlatformTeam[]): PlatformTeam[] {
  return [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
}

// ─── Platform section ─────────────────────────────────────────────────────────

function PlatformSection({
  data,
  myTeam,
}: {
  data: PlatformLeagueData;
  myTeam: MyTeam;
}) {
  const [standingsOpen, setStandingsOpen] = useState(false);
  const pStyle = PLATFORM_STYLE[data.platform] ?? PLATFORM_STYLE.yahoo;
  const standings = sortedStandings(data.teams);
  const myTeamName = myTeam?.teamName ?? null;

  return (
    <section className="space-y-4">
      {/* ── Section header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-[0.18em] uppercase ${pStyle.bg} ${pStyle.text}`}>
          {pStyle.label}
        </span>
        <h2 className="font-display text-2xl tracking-[0.06em] text-white leading-none">
          {data.leagueName.toUpperCase()}
        </h2>
        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">
          Week {data.currentWeek} · {data.season}
        </span>
        {myTeamName && (
          <span className={`ml-auto text-[10px] font-bold tracking-wider border rounded-full px-2.5 py-0.5 ${pStyle.accent}`}>
            {myTeamName}
          </span>
        )}
      </div>

      {/* ── Matchup grid ── */}
      {data.matchups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.matchups.map((m) => (
            <MatchupCard
              key={m.id}
              aName={m.teamA.name}
              bName={m.teamB.name}
              aPoints={m.teamA.points}
              bPoints={m.teamB.points}
              aKey={m.teamA.key}
              bKey={m.teamB.key}
              week={data.currentWeek}
              rosterPositions={data.rosterPositions}
              platform={data.platform}
              leagueKey={data.leagueId}
              analyzeContext="matchup"
              AnalyzeMatchup={AnalyzeMatchup}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-8 text-center text-sm text-gray-600">
          No matchups available for week {data.currentWeek}.
        </div>
      )}

      {/* ── Collapsible standings ── */}
      {standings.length > 0 && (
        <div className="rounded-xl border border-pitch-700 bg-pitch-900 overflow-hidden">
          <button
            onClick={() => setStandingsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase hover:bg-pitch-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Trophy className="w-3 h-3" />
              Standings
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${standingsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {standingsOpen && (
            <div className="border-t border-pitch-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pitch-700/50">
                    <th className="text-left px-4 py-2 text-[10px] font-bold tracking-wider text-gray-600 uppercase">#</th>
                    <th className="text-left px-4 py-2 text-[10px] font-bold tracking-wider text-gray-600 uppercase">Team</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold tracking-wider text-gray-600 uppercase">W</th>
                    <th className="text-center px-3 py-2 text-[10px] font-bold tracking-wider text-gray-600 uppercase">L</th>
                    <th className="text-right px-4 py-2 text-[10px] font-bold tracking-wider text-gray-600 uppercase">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t, i) => {
                    const isMe = myTeamName && t.name === myTeamName;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-pitch-700/30 last:border-0 transition-colors ${
                          isMe
                            ? "bg-amber-500/10 border-l-2 border-l-amber-400"
                            : "hover:bg-pitch-800/40"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className={`font-display text-lg leading-none tabular-nums ${
                            i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-600" : "text-pitch-500"
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className={`font-semibold truncate max-w-[180px] ${isMe ? "text-amber-300" : "text-gray-200"}`}>
                            {t.name}
                            {isMe && <span className="ml-1.5 text-[9px] font-bold tracking-wider text-amber-500/60 uppercase">You</span>}
                          </div>
                          {t.ownerName && (
                            <div className="text-xs text-gray-600 truncate">{t.ownerName}</div>
                          )}
                        </td>
                        <td className="text-center px-3 py-2.5 tabular-nums text-gray-300">{t.wins}</td>
                        <td className="text-center px-3 py-2.5 tabular-nums text-gray-500">{t.losses}</td>
                        <td className={`text-right px-4 py-2.5 tabular-nums font-semibold ${isMe ? "text-amber-400" : "text-gray-400"}`}>
                          {t.pointsFor.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoPlatformsConnected() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
      <div className="font-display text-[80px] leading-none text-amber-400/20 select-none">FB</div>
      <h2 className="font-display text-4xl tracking-widest text-gray-200">NO LEAGUES YET</h2>
      <p className="text-gray-500 max-w-sm">
        Connect your Yahoo, Sleeper, or ESPN fantasy leagues to start seeing your matchups and standings here.
      </p>
      <Link
        href="/connect"
        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm"
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
  const [myTeams, setMyTeams] = useState<Record<string, MyTeam>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noConnections, setNoConnections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      // 1. Check connections + grab myTeam per platform
      const connRes = await fetch("/api/user/connections", { cache: "no-store" });
      const connData = await connRes.json();
      if (!connData.ok || !connData.hasAnyConnection) {
        setNoConnections(true);
        return;
      }
      setNoConnections(false);

      // Build a leagueId → myTeam map from connections response
      const conns = connData.connections ?? {};
      const teamMap: Record<string, MyTeam> = {};

      // Yahoo: keyed by leagueKey
      for (const entry of conns.yahoo?.leagues ?? []) {
        if (entry.myTeam) teamMap[entry.leagueKey] = entry.myTeam;
      }
      // Sleeper: keyed by leagueId
      for (const entry of conns.sleeper?.leagues ?? []) {
        if (entry.myTeam) teamMap[entry.leagueId] = entry.myTeam;
      }
      // ESPN: keyed by leagueId (multi-league)
      for (const entry of conns.espn?.leagues ?? []) {
        if (entry.myTeam) teamMap[entry.leagueId] = entry.myTeam;
      }

      setMyTeams(teamMap);

      // 2. Fetch unified league data
      const dataRes = await fetch("/api/leagues/data", { cache: "no-store" });
      const data = await dataRes.json();

      if (data.ok && Array.isArray(data.platforms)) {
        setPlatforms(data.platforms);
      } else {
        setError(data.error ?? "Failed to load league data");
      }
    } catch (e: any) {
      setError(e?.message || "An error occurred");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onLeagueSelected = () => load({ silent: true });
    window.addEventListener("fbl:league-selected", onLeagueSelected);
    return () => window.removeEventListener("fbl:league-selected", onLeagueSelected);
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (noConnections) return <NoPlatformsConnected />;

  if (error && platforms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <p className="text-red-400">{error}</p>
        <button onClick={() => load()} className="text-sm text-gray-500 hover:text-gray-300 underline">
          Try again
        </button>
      </div>
    );
  }

  if (platforms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <p className="text-gray-400">No league data available right now.</p>
        <Link href="/connect" className="text-sm text-gray-500 hover:text-gray-300 underline">
          Check connected leagues →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">DASHBOARD</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load({ silent: true })}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 p-1.5 hover:bg-pitch-800 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/connect"
            className="rounded-lg border border-pitch-700 bg-pitch-900 px-3 py-1.5 text-xs font-bold tracking-wider hover:bg-pitch-800 flex items-center gap-1.5 text-gray-400 transition-colors"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Leagues
          </Link>
        </div>
      </div>

      {/* ── Platform sections ── */}
      <div className="space-y-10">
        {platforms.map((p, i) => (
          <div key={p.platform + p.leagueId}>
            {i > 0 && <div className="border-t border-pitch-700/40 mb-10" />}
            <PlatformSection
              data={p}
              myTeam={myTeams[p.leagueId] ?? null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
