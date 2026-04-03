"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, Link as LinkIcon, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ─── Types (mirrors /api/leagues/data) ───────────────────────────────────────

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

// ─── Computed types ───────────────────────────────────────────────────────────

type RankedTeam = PlatformTeam & {
  gamesPlayed: number;
  ppg: number;
  recordRank: number;    // 1-based rank by W-L-PF
  powerRank: number;     // 1-based rank by PPG
  rankDelta: number;     // recordRank - powerRank (positive = better than record suggests)
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

  // Record rank: sort by wins desc, then PF desc
  const byRecord = [...withStats].sort((a, b) =>
    b.wins !== a.wins ? b.wins - a.wins : b.pointsFor - a.pointsFor
  );
  byRecord.forEach((t, i) => { t.recordRank = i + 1; });

  // Power rank: sort by PPG desc
  const byPpg = [...withStats].sort((a, b) => b.ppg - a.ppg);
  byPpg.forEach((t, i) => { t.powerRank = i + 1; });

  withStats.forEach((t) => { t.rankDelta = t.recordRank - t.powerRank; });

  return byPpg; // return sorted by power rank
}

function computeWeeklyAwards(matchups: PlatformMatchup[], week: number): WeeklyAward[] {
  // Collect all team scores this week
  const allScores = matchups.flatMap((m) => [
    { name: m.teamA.name, points: m.teamA.points },
    { name: m.teamB.name, points: m.teamB.points },
  ]);

  const hasScores = allScores.some((s) => s.points > 0);
  if (!hasScores) return [];

  const sorted = [...allScores].sort((a, b) => b.points - a.points);
  const topScorer = sorted[0];
  const lowScorer = sorted[sorted.length - 1];

  // Compute margins — only meaningful matchups (both teams scored)
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
    awards.push({
      icon: "🏆",
      label: "High Scorer",
      winner: topScorer.name,
      detail: `${topScorer.points.toFixed(1)} pts`,
    });
  }

  if (lowScorer && lowScorer.name !== topScorer?.name) {
    awards.push({
      icon: "😬",
      label: "Basement",
      winner: lowScorer.name,
      detail: `${lowScorer.points.toFixed(1)} pts`,
    });
  }

  if (margins.length > 0) {
    const biggestWin = [...margins].sort((a, b) => b.margin - a.margin)[0];
    awards.push({
      icon: "💥",
      label: "Dominant Win",
      winner: biggestWin.winner,
      detail: `def. ${biggestWin.loser} by ${biggestWin.margin.toFixed(1)}`,
    });

    const narrowest = [...margins].sort((a, b) => a.margin - b.margin)[0];
    if (narrowest.margin < biggestWin.margin) {
      awards.push({
        icon: "😅",
        label: "Lucky Escape",
        winner: narrowest.winner,
        detail: `def. ${narrowest.loser} by ${narrowest.margin.toFixed(1)}`,
      });
    }
  }

  return awards;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AwardsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-32 bg-gray-700 rounded" />
      <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5 space-y-3">
        <div className="h-5 w-36 bg-gray-700 rounded" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-4 bg-gray-700 rounded" />
            <div className="h-4 flex-1 bg-gray-800 rounded" />
            <div className="h-4 w-12 bg-gray-800 rounded" />
            <div className="h-4 w-10 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 space-y-2">
            <div className="h-6 w-6 bg-gray-700 rounded" />
            <div className="h-4 w-20 bg-gray-700 rounded" />
            <div className="h-5 w-32 bg-gray-800 rounded" />
            <div className="h-3 w-24 bg-gray-800 rounded" />
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

      // Extract myTeam per platform
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
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
        <div className="text-5xl">🏆</div>
        <h2 className="text-xl font-semibold text-gray-100">No leagues connected yet</h2>
        <p className="text-gray-400 max-w-sm">Connect your leagues to see power rankings and weekly awards.</p>
        <Link href="/connect" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors">
          <LinkIcon className="w-4 h-4" />
          Connect a League
        </Link>
      </div>
    );
  }

  if (error || platforms.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-gray-400">{error ?? "No data available."}</p>
        <button onClick={() => load()} className="text-sm text-blue-400 hover:text-blue-300 underline">Try again</button>
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
        <h1 className="text-xl font-semibold tracking-tight">{active.leagueName}</h1>

        {/* Platform tabs */}
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

        {platforms.length === 1 && (
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${pStyle.bg} ${pStyle.text}`}>
            {pStyle.label}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">Week {active.currentWeek}</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-gray-700 bg-gray-900 p-1.5 hover:bg-gray-800 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Power Rankings ── */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700/60 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <h2 className="font-semibold text-sm">Power Rankings</h2>
          <span className="text-xs text-gray-500 ml-1">sorted by points per game</span>
        </div>

        {!hasAnyGames ? (
          <div className="px-5 py-6 text-sm text-gray-500 text-center">
            Rankings update once the season begins.
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {rankings.map((team, i) => {
              const isMyTeam = myTeam && team.name === myTeam.teamName;
              const delta = team.rankDelta;

              return (
                <div
                  key={team.name}
                  className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                    isMyTeam ? "bg-blue-900/20 border-l-2 border-blue-500" : "hover:bg-gray-800/40"
                  }`}
                >
                  {/* Power rank */}
                  <span className={`w-6 text-center font-bold tabular-nums ${
                    i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-gray-500"
                  }`}>
                    {i + 1}
                  </span>

                  {/* Team name */}
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium truncate block ${isMyTeam ? "text-blue-300" : "text-gray-100"}`}>
                      {team.name}
                      {isMyTeam && <span className="ml-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wide">you</span>}
                    </span>
                    {team.ownerName && (
                      <span className="text-xs text-gray-500 truncate block">{team.ownerName}</span>
                    )}
                  </div>

                  {/* Record */}
                  <span className="text-gray-400 tabular-nums text-xs w-12 text-right">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ""}
                  </span>

                  {/* PPG */}
                  <span className="text-gray-200 tabular-nums font-medium w-14 text-right">
                    {team.gamesPlayed > 0 ? team.ppg.toFixed(1) : "—"}
                    <span className="text-gray-500 font-normal text-[10px] ml-0.5">ppg</span>
                  </span>

                  {/* Rank delta vs standings */}
                  <div className="w-8 flex justify-center" title={
                    delta > 0 ? `Ranked ${delta} spot${delta > 1 ? "s" : ""} higher than record suggests`
                    : delta < 0 ? `Ranked ${Math.abs(delta)} spot${Math.abs(delta) > 1 ? "s" : ""} lower than record suggests`
                    : "Record matches power rank"
                  }>
                    {delta > 1 ? <TrendingUp className="w-4 h-4 text-green-400" /> :
                     delta < -1 ? <TrendingDown className="w-4 h-4 text-red-400" /> :
                     <Minus className="w-3.5 h-3.5 text-gray-600" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasAnyGames && (
          <div className="px-5 py-2.5 border-t border-gray-700/50 flex items-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-400" /> Better than record</span>
            <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400" /> Worse than record</span>
            <span className="flex items-center gap-1"><Minus className="w-3 h-3 text-gray-600" /> On par</span>
          </div>
        )}
      </div>

      {/* ── Weekly Awards ── */}
      <div>
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <span>Week {active.currentWeek} Awards</span>
        </h2>

        {awards.length === 0 ? (
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 px-5 py-6 text-sm text-gray-500 text-center">
            Awards update each week once games are played.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {awards.map((award) => (
              <div
                key={award.label}
                className="rounded-xl border border-gray-700 bg-gray-900/60 px-5 py-4 space-y-1"
              >
                <div className="text-2xl">{award.icon}</div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{award.label}</div>
                <div className="font-semibold text-gray-100 truncate">{award.winner}</div>
                <div className="text-xs text-gray-400">{award.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
