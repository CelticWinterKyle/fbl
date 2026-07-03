"use client";
// Weekly recap: your result in every league, the headline record, your top
// player, and a share card (SEASON_FEATURES_PLAN.md #3). Linked from the
// Tuesday recap push; readable any time.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, Share2, Check, CalendarOff, Link as LinkIcon, Megaphone } from "lucide-react";

type MyTeam = { teamKey: string; teamName?: string };

type CoachRecap = { headline: string; lines: { id: string; text: string }[] };

type Row = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  leagueName: string;
  week: number;
  myName: string;
  myPts: number;
  oppName: string;
  oppPts: number;
};

const PLATFORM_LABEL: Record<Row["platform"], string> = {
  yahoo: "Yahoo", sleeper: "Sleeper", espn: "ESPN",
};
const PLATFORM_DOT: Record<Row["platform"], string> = {
  yahoo: "bg-purple-400", sleeper: "bg-emerald-400", espn: "bg-red-400",
};

export default function RecapContent() {
  const [rows, setRows] = useState<Row[]>([]);
  const [recaps, setRecaps] = useState<Record<string, CoachRecap>>({});
  const [topPlayer, setTopPlayer] = useState<{ name: string; points: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noConnections, setNoConnections] = useState(false);
  const [copied, setCopied] = useState(false);

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

      let platforms: any[] = data.ok ? (data.platforms ?? []) : [];

      // Platforms roll currentWeek forward Tuesday morning, before anyone
      // has read their recap: when the new week is entirely scoreless, show
      // the just-finished week instead of a page of 0.0 to 0.0 results.
      const allScoreless =
        platforms.length > 0 &&
        platforms.every((l: any) =>
          (l.matchups ?? []).every(
            (m: any) => Math.max(m.teamA?.points ?? 0, m.teamB?.points ?? 0) === 0
          )
        );
      const maxWeek = platforms.reduce(
        (max: number, l: any) => Math.max(max, Number(l.currentWeek) || 0),
        0
      );
      if (allScoreless && maxWeek > 1) {
        try {
          const prevRes = await fetch(`/api/leagues/data?week=${maxWeek - 1}`, { cache: "no-store" });
          const prev = await prevRes.json();
          const prevPlatforms: any[] = prev.ok ? (prev.platforms ?? []) : [];
          const prevHasScores = prevPlatforms.some((l: any) =>
            (l.matchups ?? []).some(
              (m: any) => Math.max(m.teamA?.points ?? 0, m.teamB?.points ?? 0) > 0
            )
          );
          if (prevHasScores) platforms = prevPlatforms;
        } catch {
          // Fall back to the current (scoreless) week rather than erroring.
        }
      }

      // leagueId -> myTeam (mirrors Game Day)
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

      const found: Row[] = [];
      const rosterTasks: { platform: Row["platform"]; leagueKey: string; teamKey: string }[] = [];
      for (const league of platforms) {
        const myTeam = myTeamMap[league.leagueId];
        if (!myTeam) continue;
        const m = league.matchups.find(
          (mu: any) => mu.teamA.key === myTeam.teamKey || mu.teamB.key === myTeam.teamKey
        );
        if (!m) continue;
        const mine = m.teamA.key === myTeam.teamKey ? m.teamA : m.teamB;
        const opp = m.teamA.key === myTeam.teamKey ? m.teamB : m.teamA;
        found.push({
          platform: league.platform,
          leagueId: league.leagueId,
          leagueName: league.leagueName,
          week: league.currentWeek,
          myName: mine.name,
          myPts: mine.points,
          oppName: opp.name,
          oppPts: opp.points,
        });
        rosterTasks.push({ platform: league.platform, leagueKey: league.leagueId, teamKey: myTeam.teamKey });
      }
      setRows(found);

      // Coach's recap per league (best effort): served from a global per-week
      // cache after the first league member generates it. 409 means the week
      // is not final yet; any failure just means the block does not render.
      void Promise.all(
        found
          .filter((r) => Math.max(r.myPts, r.oppPts) > 0)
          .slice(0, 12)
          .map(async (r) => {
            try {
              const res = await fetch("/api/recap/narrative", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ platform: r.platform, leagueId: r.leagueId, week: r.week }),
              });
              const j = await res.json();
              if (j?.ok && j.headline) {
                setRecaps((prev) => ({
                  ...prev,
                  [`${r.platform}:${r.leagueId}`]: { headline: j.headline, lines: Array.isArray(j.lines) ? j.lines : [] },
                }));
              }
            } catch {
              // Narrative is decoration; the recap page works without it.
            }
          })
      );

      // Top player across your starters this week (best effort).
      if (rosterTasks.length > 0) {
        try {
          const res = await fetch("/api/rosters/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ items: rosterTasks.slice(0, 24) }),
          });
          const j = await res.json();
          let best: { name: string; points: number } | null = null;
          for (const r of j?.ok && Array.isArray(j.rosters) ? j.rosters : []) {
            for (const p of r?.roster?.starters ?? []) {
              const pts = Number(p?.points ?? 0);
              if (p?.name && pts > (best?.points ?? 0)) best = { name: p.name, points: pts };
            }
          }
          setTopPlayer(best);
        } catch {
          setTopPlayer(null);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scored = rows.filter((r) => Math.max(r.myPts, r.oppPts) > 0);
  const wins = scored.filter((r) => r.myPts > r.oppPts).length;
  const losses = scored.filter((r) => r.myPts < r.oppPts).length;
  const week = rows.reduce((max, r) => Math.max(max, r.week), 0);

  const shareUrl = (() => {
    const params = new URLSearchParams({
      record: `${wins}-${losses}`,
      leagues: String(scored.length),
    });
    if (topPlayer) {
      params.set("top", topPlayer.name);
      params.set("topPts", topPlayer.points.toFixed(1));
    }
    if (week > 0) params.set("week", String(week));
    return `/share/week?${params.toString()}`;
  })();

  const copyShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable: the open-card link still works.
    }
  }, [shareUrl]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-3 animate-pulse">
        <div className="h-9 w-48 bg-pitch-800 rounded" />
        <div className="h-28 bg-pitch-800 rounded-xl" />
        <div className="h-16 bg-pitch-800 rounded-xl" />
        <div className="h-16 bg-pitch-800 rounded-xl" />
      </div>
    );
  }

  if (noConnections || rows.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[52vh] text-center space-y-5">
        <CalendarOff className="w-8 h-8 text-gray-600" aria-hidden="true" />
        <h2 className="font-display text-4xl tracking-widest text-gray-200">NO RECAP YET</h2>
        <p className="text-gray-500 max-w-sm">
          {noConnections
            ? "Connect a league and your weekly results will land here."
            : "Once games are played, your week across every league shows up here."}
        </p>
        <Link
          href={noConnections ? "/connect" : "/gameday"}
          className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm"
        >
          <LinkIcon className="w-4 h-4" />
          {noConnections ? "Go to Leagues" : "Go to Game Day"}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">YOUR WEEK</h1>
        {week > 0 && (
          <span className="text-xs font-bold tracking-[0.15em] text-gray-600 uppercase">Week {week}</span>
        )}
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="ml-auto rounded-lg border border-pitch-700 bg-pitch-900 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-pitch-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Record hero */}
      <div className="rounded-2xl border border-pitch-700 bg-pitch-900 px-6 py-8 text-center shadow-xl shadow-black/40">
        <div className="font-display text-7xl leading-none tabular-nums text-accent">
          {wins}-{losses}
        </div>
        <p className="text-gray-400 mt-2 text-sm">
          across {scored.length} {scored.length === 1 ? "league" : "leagues"}
        </p>
        {topPlayer && (
          <p className="text-sm text-gray-300 mt-4">
            <span className="text-gray-500">Top player:</span>{" "}
            <span className="font-semibold">{topPlayer.name}</span>{" "}
            <span className="text-accent font-bold">{topPlayer.points.toFixed(1)} pts</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          <button
            onClick={copyShare}
            className="inline-flex items-center gap-2 min-h-[44px] bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2 px-6 rounded-lg transition-colors tracking-wider text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {copied ? "Link copied" : "Share your week"}
          </button>
          <Link
            href={shareUrl}
            target="_blank"
            className="inline-flex items-center min-h-[44px] px-4 text-sm text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
          >
            Preview card
          </Link>
        </div>
      </div>

      {/* Coach's recap: league narratives, present only once generated */}
      {rows.some((r) => recaps[`${r.platform}:${r.leagueId}`]) && (
        <div className="rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
          <div className="px-6 py-4 border-b border-pitch-700/60 flex items-center gap-2">
            <Megaphone className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <h2 className="font-bold text-xs tracking-[0.18em] uppercase text-gray-300">Coach&apos;s Recap</h2>
          </div>
          <div className="divide-y divide-pitch-700/40">
            {rows.map((r) => {
              const recap = recaps[`${r.platform}:${r.leagueId}`];
              if (!recap) return null;
              return (
                <div key={`recap-${r.platform}:${r.leagueId}`} className="px-6 py-4 space-y-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[r.platform]}`} />
                    <span className="text-xs font-bold tracking-[0.15em] text-gray-500 uppercase truncate">
                      {r.leagueName}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-100">{recap.headline}</p>
                  {recap.lines.length > 0 && (
                    <ul className="space-y-1.5">
                      {recap.lines.map((l) => (
                        <li key={l.id} className="text-sm text-gray-400 leading-relaxed">
                          {l.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-league rows */}
      <div className="space-y-2">
        {rows.map((r) => {
          const played = Math.max(r.myPts, r.oppPts) > 0;
          const won = r.myPts > r.oppPts;
          const tied = r.myPts === r.oppPts;
          return (
            <div
              key={`${r.platform}:${r.leagueId}`}
              className="flex items-center justify-between gap-3 flex-wrap border border-pitch-700 bg-pitch-900 rounded-xl px-5 py-3.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[r.platform]}`} />
                <span className="text-xs font-bold tracking-[0.15em] text-gray-500 uppercase shrink-0">
                  {PLATFORM_LABEL[r.platform]}
                </span>
                <span className="text-sm text-gray-300 truncate">{r.leagueName}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-sm tabular-nums text-gray-300">
                  {r.myPts.toFixed(1)} <span className="text-gray-600">to</span> {r.oppPts.toFixed(1)}
                </span>
                {played ? (
                  <span
                    className={`text-[10px] font-bold tracking-[0.15em] uppercase border rounded-md px-2 py-1 ${
                      tied
                        ? "text-gray-400 border-pitch-600"
                        : won
                          ? "text-accent border-accent-strong/40"
                          : "text-red-400 border-red-700/40"
                    }`}
                  >
                    {tied ? "Tie" : won ? "Win" : "Loss"}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-600 border border-pitch-700 rounded-md px-2 py-1">
                    Not played
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
