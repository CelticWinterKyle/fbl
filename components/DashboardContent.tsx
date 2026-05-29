"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import MatchupCard from "@/components/MatchupCard";
import { RefreshCw, Link as LinkIcon, ChevronDown, Trophy } from "lucide-react";
import DashboardSkeleton from "@/components/DashboardSkeleton";
import LeagueErrorBanner, { type LeagueLoadError } from "@/components/LeagueErrorBanner";
import { fmtPts } from "@/lib/format";

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

type StandingRow = PlatformTeam & { move: number; result: "W" | "L" | "T" | null };

/**
 * Projected standings "if this week ended now": apply each current matchup's
 * leader as a win, add this week's points to points-for, re-rank, and compute
 * each team's movement vs. the current table. Teams matched by name.
 */
function projectedStandings(teams: PlatformTeam[], matchups: PlatformMatchup[]): StandingRow[] {
  const result = new Map<string, "W" | "L" | "T">();
  const weekPts = new Map<string, number>();
  for (const m of matchups) {
    weekPts.set(m.teamA.name, m.teamA.points);
    weekPts.set(m.teamB.name, m.teamB.points);
    const d = m.teamA.points - m.teamB.points;
    if (Math.abs(d) < 0.01) { result.set(m.teamA.name, "T"); result.set(m.teamB.name, "T"); }
    else if (d > 0) { result.set(m.teamA.name, "W"); result.set(m.teamB.name, "L"); }
    else { result.set(m.teamA.name, "L"); result.set(m.teamB.name, "W"); }
  }
  const projected = teams.map((t) => {
    const r = result.get(t.name);
    return {
      ...t,
      wins: t.wins + (r === "W" ? 1 : 0),
      losses: t.losses + (r === "L" ? 1 : 0),
      ties: t.ties + (r === "T" ? 1 : 0),
      pointsFor: t.pointsFor + (weekPts.get(t.name) ?? 0),
    };
  });
  const curRank = new Map(sortedStandings(teams).map((t, i) => [t.name, i]));
  return sortedStandings(projected).map((t, i) => ({
    ...t,
    move: (curRank.get(t.name) ?? i) - i, // positive = moved up
    result: result.get(t.name) ?? null,
  }));
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
  const [projected, setProjected] = useState(false);
  const pStyle = PLATFORM_STYLE[data.platform] ?? PLATFORM_STYLE.yahoo;
  const standings = sortedStandings(data.teams);
  const canProject = data.matchups.length > 0;
  const rows: StandingRow[] = projected && canProject
    ? projectedStandings(data.teams, data.matchups)
    : standings.map((t) => ({ ...t, move: 0, result: null }));
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
            aria-expanded={standingsOpen}
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
              {canProject && (
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-pitch-700/50">
                  <span className="text-[10px] text-gray-600">
                    {projected ? `Projected if Week ${data.currentWeek} ended now` : "Current standings"}
                  </span>
                  <div className="flex rounded-lg border border-pitch-700 overflow-hidden text-[10px] font-bold tracking-wider uppercase">
                    <button
                      onClick={() => setProjected(false)}
                      className={`px-2.5 py-1 transition-colors ${!projected ? "bg-accent text-pitch-950" : "text-gray-400 hover:bg-pitch-800"}`}
                    >
                      Current
                    </button>
                    <button
                      onClick={() => setProjected(true)}
                      className={`px-2.5 py-1 transition-colors ${projected ? "bg-accent text-pitch-950" : "text-gray-400 hover:bg-pitch-800"}`}
                    >
                      Projected
                    </button>
                  </div>
                </div>
              )}
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
                  {rows.map((t, i) => {
                    const isMe = myTeamName && t.name === myTeamName;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-pitch-700/30 last:border-0 transition-colors ${
                          isMe
                            ? "bg-accent-strong/10 border-l-2 border-l-accent"
                            : "hover:bg-pitch-800/40"
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-display text-lg leading-none tabular-nums ${
                              i === 0 ? "text-accent" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-600" : "text-pitch-500"
                            }`}>
                              {i + 1}
                            </span>
                            {projected && t.move !== 0 && (
                              <span className={`text-[10px] font-bold tabular-nums ${t.move > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {t.move > 0 ? `▲${t.move}` : `▼${Math.abs(t.move)}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className={`font-semibold truncate max-w-[180px] ${isMe ? "text-accent-soft" : "text-gray-200"}`}>
                            {t.name}
                            {isMe && <span className="ml-1.5 text-[9px] font-bold tracking-wider text-accent-strong/60 uppercase">You</span>}
                          </div>
                          {t.ownerName && (
                            <div className="text-xs text-gray-600 truncate">{t.ownerName}</div>
                          )}
                        </td>
                        <td className="text-center px-3 py-2.5 tabular-nums text-gray-300">{t.wins}</td>
                        <td className="text-center px-3 py-2.5 tabular-nums text-gray-500">{t.losses}</td>
                        <td className={`text-right px-4 py-2.5 tabular-nums font-semibold ${isMe ? "text-accent" : "text-gray-400"}`}>
                          {fmtPts(t.pointsFor)}
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
      <div className="font-display text-[80px] leading-none text-accent/20 select-none">FB</div>
      <h2 className="font-display text-4xl tracking-widest text-gray-200">NO LEAGUES YET</h2>
      <p className="text-gray-500 max-w-sm">
        Connect your Yahoo, Sleeper, or ESPN fantasy leagues to start seeing your matchups and standings here.
      </p>
      <Link
        href="/connect"
        className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm"
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
  const [loadErrors, setLoadErrors] = useState<LeagueLoadError[]>([]);
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
        setLoadErrors(Array.isArray(data.errors) ? data.errors : []);
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
        {loadErrors.length > 0 ? (
          <div className="w-full max-w-md"><LeagueErrorBanner errors={loadErrors} /></div>
        ) : (
          <p className="text-gray-400">No league data available right now.</p>
        )}
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
            aria-label="Refresh dashboard"
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

      {/* ── Per-platform load errors (auth expired, upstream down, etc.) ── */}
      <LeagueErrorBanner errors={loadErrors} />

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
