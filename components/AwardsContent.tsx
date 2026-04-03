"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, Link as LinkIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type MyTeam = { teamKey: string; teamName: string };

type RankedTeam = PlatformTeam & {
  gamesPlayed: number;
  ppg: number;
  recordRank: number;
  powerRank: number;
  rankDelta: number;
};

type WeeklyAward = {
  icon: string;
  label: string;
  winner: string;
  detail: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  yahoo:   { bg: "bg-purple-600",  text: "text-white", label: "Yahoo"   },
  sleeper: { bg: "bg-[#01B86C]",   text: "text-white", label: "Sleeper" },
  espn:    { bg: "bg-[#E8002D]",   text: "text-white", label: "ESPN"    },
};

// ─── Computation helpers ──────────────────────────────────────────────────────

function computePowerRankings(teams: PlatformTeam[]): RankedTeam[] {
  const withStats = teams.map((t) => {
    const gamesPlayed = t.wins + t.losses + t.ties;
    const ppg = gamesPlayed > 0 ? t.pointsFor / gamesPlayed : 0;
    return { ...t, gamesPlayed, ppg, recordRank: 0, powerRank: 0, rankDelta: 0 };
  });

  const byRecord = [...withStats].sort((a, b) =>
    b.wins !== a.wins ? b.wins - a.wins : b.pointsFor - a.pointsFor
  );
  byRecord.forEach((t, i) => { t.recordRank = i + 1; });

  const byPpg = [...withStats].sort((a, b) => b.ppg - a.ppg);
  byPpg.forEach((t, i) => { t.powerRank = i + 1; });

  withStats.forEach((t) => { t.rankDelta = t.recordRank - t.powerRank; });

  return byPpg;
}

function computeWeeklyAwards(matchups: PlatformMatchup[], week: number): WeeklyAward[] {
  const allScores = matchups.flatMap((m) => [
    { name: m.teamA.name, points: m.teamA.points },
    { name: m.teamB.name, points: m.teamB.points },
  ]);

  const hasScores = allScores.some((s) => s.points > 0);
  if (!hasScores) return [];

  const sorted = [...allScores].sort((a, b) => b.points - a.points);
  const topScorer = sorted[0];
  const lowScorer = sorted[sorted.length - 1];

  const margins = matchups
    .filter((m) => m.teamA.points > 0 || m.teamB.points > 0)
    .map((m) => {
      const winning = m.teamA.points >= m.teamB.points ? m.teamA : m.teamB;
      const losing  = m.teamA.points >= m.teamB.points ? m.teamB : m.teamA;
      return { winner: winning.name, loser: losing.name, margin: Math.abs(m.teamA.points - m.teamB.points), winnerPts: winning.points, loserPts: losing.points };
    })
    .filter((m) => m.margin > 0);

  const awards: WeeklyAward[] = [];

  if (topScorer) {
    awards.push({ icon: "🏆", label: "High Scorer", winner: topScorer.name, detail: `${topScorer.points.toFixed(1)} pts` });
  }

  if (lowScorer && lowScorer.name !== topScorer?.name) {
    awards.push({ icon: "😬", label: "Basement", winner: lowScorer.name, detail: `${lowScorer.points.toFixed(1)} pts` });
  }

  if (margins.length > 0) {
    const biggestWin = [...margins].sort((a, b) => b.margin - a.margin)[0];
    awards.push({ icon: "💥", label: "Dominant Win", winner: biggestWin.winner, detail: `def. ${biggestWin.loser} by ${biggestWin.margin.toFixed(1)}` });

    const narrowest = [...margins].sort((a, b) => a.margin - b.margin)[0];
    if (narrowest.margin < biggestWin.margin) {
      awards.push({ icon: "😅", label: "Lucky Escape", winner: narrowest.winner, detail: `def. ${narrowest.loser} by ${narrowest.margin.toFixed(1)}` });
    }
  }

  return awards;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AwardsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-9 w-48 bg-pitch-800 rounded" />
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-pitch-700/60">
          <div className="h-5 w-40 bg-pitch-800 rounded" />
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-pitch-700/40 last:border-0">
            <div className="h-8 w-8 bg-pitch-800 rounded" />
            <div className="h-4 flex-1 bg-pitch-800 rounded" />
            <div className="h-4 w-16 bg-pitch-800 rounded" />
            <div className="h-4 w-10 bg-pitch-800 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl border border-pitch-700 bg-pitch-900 p-5 space-y-2">
            <div className="h-7 w-7 bg-pitch-800 rounded" />
            <div className="h-3 w-20 bg-pitch-800 rounded" />
            <div className="h-5 w-36 bg-pitch-700 rounded" />
            <div className="h-3 w-28 bg-pitch-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AwardsContent() {
  const [platforms, setPlatforms] = useState<PlatformLeagueData[]>([]);
  const [myTeams, setMyTeams] = useState<Record<string, MyTeam | null>>({});
  const [activePlatformIdx, setActivePlatformIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noConnections, setNoConnections] = useState(false);

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

      const teams: Record<string, MyTeam | null> = {};
      for (const [platform, conn] of Object.entries(connData.connections as Record<string, { myTeam: MyTeam | null }>)) {
        teams[platform] = conn.myTeam ?? null;
      }
      setMyTeams(teams);

      if (data.ok && Array.isArray(data.platforms)) {
        setPlatforms(data.platforms);
        if (!silent) setActivePlatformIdx(0);
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

  useEffect(() => { load(); }, [load]);

  if (loading) return <AwardsSkeleton />;

  if (noConnections) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <div className="font-display text-[80px] leading-none text-amber-400/20 select-none">01</div>
        <h2 className="font-display text-4xl tracking-widest text-gray-200">NO LEAGUES YET</h2>
        <p className="text-gray-500 max-w-sm">Connect your leagues to see power rankings and weekly awards.</p>
        <Link href="/connect" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm">
          <LinkIcon className="w-4 h-4" />
          Connect a League
        </Link>
      </div>
    );
  }

  if (error || platforms.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-gray-500">{error ?? "No data available."}</p>
        <button onClick={() => load()} className="text-sm text-amber-400 hover:text-amber-300 underline">Try again</button>
      </div>
    );
  }

  const active = platforms[activePlatformIdx] ?? platforms[0];
  const pStyle = PLATFORM_STYLE[active.platform] ?? PLATFORM_STYLE.yahoo;
  const myTeam = myTeams[active.platform] ?? null;

  const rankings = computePowerRankings(active.teams);
  const awards = computeWeeklyAwards(active.matchups, active.currentWeek);
  const hasAnyGames = active.teams.some(t => t.wins + t.losses + t.ties > 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">RANKINGS</h1>

        {platforms.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {platforms.map((p, i) => {
              const s = PLATFORM_STYLE[p.platform] ?? PLATFORM_STYLE.yahoo;
              return (
                <button
                  key={p.platform + p.leagueId}
                  onClick={() => setActivePlatformIdx(i)}
                  className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider transition-colors ${
                    i === activePlatformIdx ? `${s.bg} ${s.text}` : "bg-pitch-800 text-gray-400 hover:bg-pitch-700"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        {platforms.length === 1 && (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${pStyle.bg} ${pStyle.text}`}>
            {pStyle.label}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-bold tracking-widest text-gray-600 uppercase">Week {active.currentWeek}</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 p-1.5 hover:bg-pitch-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Power Rankings ── */}
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        <div className="px-6 py-4 border-b border-pitch-700/60 flex items-center gap-3">
          <h2 className="font-bold text-xs tracking-[0.18em] uppercase text-gray-300">Power Rankings</h2>
          <span className="text-xs text-gray-600">· points per game</span>
        </div>

        {!hasAnyGames ? (
          <div className="px-6 py-8 text-sm text-gray-600 text-center tracking-wider">
            Rankings update once the season begins.
          </div>
        ) : (
          <div className="divide-y divide-pitch-700/40">
            {rankings.map((team, i) => {
              const isMyTeam = myTeam && team.name === myTeam.teamName;
              const delta = team.rankDelta;

              const rankColor =
                i === 0 ? "text-amber-400" :
                i === 1 ? "text-gray-300" :
                i === 2 ? "text-orange-500" :
                "text-pitch-500";

              return (
                <div
                  key={team.name}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                    isMyTeam
                      ? "bg-amber-900/10 border-l-2 border-amber-500"
                      : "hover:bg-pitch-800/50"
                  }`}
                >
                  {/* Power rank — Bebas Neue */}
                  <span className={`font-display text-2xl leading-none w-7 text-center tabular-nums ${rankColor}`}>
                    {i + 1}
                  </span>

                  {/* Team name */}
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold truncate block text-sm ${isMyTeam ? "text-amber-300" : "text-gray-100"}`}>
                      {team.name}
                      {isMyTeam && (
                        <span className="ml-2 text-[9px] font-bold tracking-[0.2em] text-amber-500 uppercase">you</span>
                      )}
                    </span>
                    {team.ownerName && (
                      <span className="text-xs text-gray-600 truncate block">{team.ownerName}</span>
                    )}
                  </div>

                  {/* Record */}
                  <span className="text-gray-500 tabular-nums text-xs w-12 text-right font-mono">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                  </span>

                  {/* PPG */}
                  <span className="text-gray-200 tabular-nums font-bold text-sm w-16 text-right">
                    {team.gamesPlayed > 0 ? team.ppg.toFixed(1) : "—"}
                    <span className="text-gray-600 font-normal text-[10px] ml-0.5">ppg</span>
                  </span>

                  {/* Trend arrow */}
                  <div className="w-6 flex justify-center" title={
                    delta > 0 ? `+${delta} vs record`
                    : delta < 0 ? `${delta} vs record`
                    : "On par"
                  }>
                    {delta > 1  ? <TrendingUp   className="w-3.5 h-3.5 text-green-400" /> :
                     delta < -1 ? <TrendingDown className="w-3.5 h-3.5 text-red-400"   /> :
                     <Minus className="w-3 h-3 text-pitch-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasAnyGames && (
          <div className="px-6 py-3 border-t border-pitch-700/50 flex items-center gap-5 text-[10px] text-gray-600 font-bold tracking-wider uppercase">
            <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-green-400" /> Better than record</span>
            <span className="flex items-center gap-1.5"><TrendingDown className="w-3 h-3 text-red-400" /> Worse than record</span>
          </div>
        )}
      </div>

      {/* ── Weekly Awards ── */}
      <div>
        <h2 className="font-bold text-xs tracking-[0.18em] uppercase text-gray-500 mb-4">
          Week {active.currentWeek} Awards
        </h2>

        {awards.length === 0 ? (
          <div className="rounded-2xl border border-pitch-700 bg-pitch-900 px-6 py-8 text-sm text-gray-600 text-center tracking-wider">
            Awards update each week once games are played.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {awards.map((award) => (
              <div
                key={award.label}
                className="rounded-xl border border-pitch-700 bg-pitch-900 px-5 py-4 space-y-1.5 hover:border-pitch-600 transition-colors"
              >
                <div className="text-2xl">{award.icon}</div>
                <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-600">{award.label}</div>
                <div className="font-bold text-gray-100 truncate text-sm">{award.winner}</div>
                <div className="text-xs text-gray-500">{award.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
