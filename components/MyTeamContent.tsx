'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Link as LinkIcon, ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = {
  name: string;
  position: string;
  team: string | null;
  points: number;
  actual: number;
  projection: number;
  projectedPoints: number;
  status: string | null;
};

type TeamRoster = {
  platform: 'yahoo' | 'sleeper' | 'espn';
  leagueName: string;
  leagueId: string;
  teamName: string;
  teamKey: string;
  week: number;
  season: number;
  starters: Player[];
  bench: Player[];
  rosterLoading: boolean;
  rosterError: string | null;
};

// ─── Style maps ───────────────────────────────────────────────────────────────

const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string; accent: string }> = {
  yahoo:   { bg: 'bg-purple-600', text: 'text-white', label: 'Yahoo',   accent: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
  sleeper: { bg: 'bg-[#01B86C]',  text: 'text-white', label: 'Sleeper', accent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  espn:    { bg: 'bg-[#E8002D]',  text: 'text-white', label: 'ESPN',    accent: 'border-red-500/40 bg-red-500/10 text-red-300' },
};

const SLOT_COLOR: Record<string, string> = {
  QB:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RB:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WR:      'bg-violet-500/15 text-violet-400 border-violet-500/30',
  TE:      'bg-orange-500/15 text-orange-400 border-orange-500/30',
  FLEX:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'WR/TE': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  OP:      'bg-amber-500/15 text-amber-400 border-amber-500/30',
  K:       'bg-gray-500/15 text-gray-400 border-gray-500/30',
  DEF:     'bg-red-500/15 text-red-400 border-red-500/30',
  BN:      'bg-pitch-700/40 text-gray-600 border-pitch-600/20',
  IR:      'bg-red-900/20 text-red-700 border-red-800/20',
};

const STATUS_DOT: Record<string, string> = {
  active:       'bg-emerald-400',
  questionable: 'bg-yellow-400',
  doubtful:     'bg-orange-400',
  out:          'bg-red-500',
  ir:           'bg-red-800',
};

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, isBench }: { player: Player; isBench?: boolean }) {
  const slotColor = SLOT_COLOR[player.position] ?? SLOT_COLOR.BN;
  const dotColor  = player.status ? (STATUS_DOT[player.status] ?? STATUS_DOT.active) : STATUS_DOT.active;
  const pts       = player.points ?? player.actual ?? 0;
  const proj      = player.projectedPoints ?? player.projection ?? 0;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-pitch-800/40 ${isBench ? 'opacity-55' : ''}`}>
      <span className={`shrink-0 w-[3.25rem] text-center text-[10px] font-bold tracking-wider border rounded px-1 py-0.5 ${slotColor}`}>
        {player.position}
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isBench ? 'text-gray-400' : 'text-white'}`}>
          {player.name}
        </p>
        {player.team && (
          <p className="text-[10px] text-gray-600 font-bold tracking-wider">{player.team}</p>
        )}
      </div>

      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`}
        title={player.status ?? 'active'}
      />

      <div className="shrink-0 text-right tabular-nums">
        {pts > 0 ? (
          <span className="text-sm font-bold text-white">{pts.toFixed(1)}</span>
        ) : (
          <span className="text-sm text-gray-700">—</span>
        )}
        <span className="text-xs text-gray-600 ml-1.5">/ {proj.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── League roster card ───────────────────────────────────────────────────────

function LeagueRosterCard({ team }: { team: TeamRoster }) {
  const [benchOpen, setBenchOpen] = useState(false);
  const pStyle = PLATFORM_STYLE[team.platform] ?? PLATFORM_STYLE.yahoo;

  const totalPts  = team.starters.reduce((s, p) => s + (p.points ?? p.actual ?? 0), 0);
  const totalProj = team.starters.reduce((s, p) => s + (p.projectedPoints ?? p.projection ?? 0), 0);

  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-pitch-700/60 flex items-center gap-3 flex-wrap">
        <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.18em] uppercase ${pStyle.bg} ${pStyle.text}`}>
          {pStyle.label}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-[0.06em] text-white leading-none truncate">
            {team.leagueName.toUpperCase()}
          </h2>
          <p className="text-[10px] text-gray-600 font-bold tracking-[0.15em] uppercase mt-0.5">
            Week {team.week} · {team.season}
          </p>
        </div>
        <span className={`ml-auto text-[11px] font-bold tracking-wider border rounded-full px-2.5 py-0.5 ${pStyle.accent}`}>
          {team.teamName}
        </span>
      </div>

      {/* Loading */}
      {team.rosterLoading && (
        <div className="px-5 py-8 text-center text-sm text-gray-600 animate-pulse">Loading roster...</div>
      )}

      {/* Error */}
      {team.rosterError && !team.rosterLoading && (
        <div className="px-5 py-4 text-sm text-red-400/70">{team.rosterError}</div>
      )}

      {/* Content */}
      {!team.rosterLoading && !team.rosterError && (
        <>
          {/* Points summary bar */}
          <div className="px-5 py-2.5 flex items-baseline gap-3 border-b border-pitch-700/40 bg-pitch-800/30">
            <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">Starters</span>
            <span className="font-display text-2xl text-white tabular-nums leading-none">
              {totalPts.toFixed(1)}
            </span>
            <span className="text-xs text-gray-600">/ {totalProj.toFixed(1)} proj</span>
          </div>

          {/* Starters */}
          <div className="divide-y divide-pitch-700/30">
            {team.starters.length > 0
              ? team.starters.map((p, i) => <PlayerRow key={i} player={p} />)
              : <p className="px-5 py-4 text-sm text-gray-600">No starter data available.</p>
            }
          </div>

          {/* Bench */}
          {team.bench.length > 0 && (
            <div className="border-t border-pitch-700/40">
              <button
                onClick={() => setBenchOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase hover:bg-pitch-800 transition-colors"
              >
                <span>Bench · {team.bench.length} players</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${benchOpen ? 'rotate-180' : ''}`} />
              </button>
              {benchOpen && (
                <div className="divide-y divide-pitch-700/20 border-t border-pitch-700/30">
                  {team.bench.map((p, i) => <PlayerRow key={i} player={p} isBench />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoTeams() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[45vh] text-center space-y-4">
      <div className="font-display text-[72px] leading-none text-amber-400/20 select-none">MT</div>
      <h2 className="font-display text-3xl tracking-widest text-gray-300">NO TEAM SET</h2>
      <p className="text-gray-500 max-w-xs text-sm">
        Pick your team for each connected league to see your roster, stats, and lineup here.
      </p>
      <Link
        href="/connect"
        className="inline-flex items-center gap-2 text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors"
      >
        <LinkIcon className="w-4 h-4" />
        Go to Leagues →
      </Link>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-9 w-32 bg-pitch-800 rounded" />
      {[1, 2].map(i => (
        <div key={i} className="rounded-xl border border-pitch-700 bg-pitch-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-pitch-700/60 flex gap-3 items-center">
            <div className="h-5 w-14 bg-pitch-700 rounded" />
            <div className="h-5 w-40 bg-pitch-800 rounded" />
          </div>
          <div className="px-5 py-3 border-b border-pitch-700/40 bg-pitch-800/30">
            <div className="h-7 w-20 bg-pitch-700 rounded" />
          </div>
          <div className="divide-y divide-pitch-700/30">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(j => (
              <div key={j} className="px-4 py-2.5 flex items-center gap-3">
                <div className="h-6 w-12 bg-pitch-800 rounded" />
                <div className="flex-1 h-4 bg-pitch-800 rounded" />
                <div className="h-4 w-16 bg-pitch-800 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MyTeamContent() {
  const [teams, setTeams]       = useState<TeamRoster[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noTeams, setNoTeams]   = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [connRes, dataRes] = await Promise.all([
        fetch('/api/user/connections', { cache: 'no-store' }),
        fetch('/api/leagues/data',     { cache: 'no-store' }),
      ]);
      const [connData, leagueData] = await Promise.all([connRes.json(), dataRes.json()]);

      if (!connData.ok || !connData.hasAnyConnection) { setNoTeams(true); return; }

      // Build leagueId → myTeam map
      const myTeamMap: Record<string, { teamKey: string; teamName: string }> = {};
      for (const e of connData.connections?.yahoo?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueKey] = e.myTeam;
      }
      for (const e of connData.connections?.sleeper?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }
      for (const e of connData.connections?.espn?.leagues ?? []) {
        if (e.myTeam) myTeamMap[e.leagueId] = e.myTeam;
      }

      const platforms: any[] = leagueData.ok ? (leagueData.platforms ?? []) : [];
      const withMyTeam = platforms.filter(p => myTeamMap[p.leagueId]);

      if (withMyTeam.length === 0) { setNoTeams(true); return; }
      setNoTeams(false);

      // Seed with loading placeholders
      const seed: TeamRoster[] = withMyTeam.map(p => ({
        platform:     p.platform,
        leagueName:   p.leagueName,
        leagueId:     p.leagueId,
        teamName:     myTeamMap[p.leagueId].teamName,
        teamKey:      myTeamMap[p.leagueId].teamKey,
        week:         p.currentWeek,
        season:       p.season,
        starters:     [],
        bench:        [],
        rosterLoading: true,
        rosterError:  null,
      }));
      setTeams(seed);

      // Fetch rosters in parallel; update each card as it resolves
      await Promise.all(seed.map(async team => {
        try {
          const params = new URLSearchParams({ platform: team.platform, leagueKey: team.leagueId });
          const res  = await fetch(`/api/roster/${encodeURIComponent(team.teamKey)}?${params}`, { cache: 'no-store' });
          const data = await res.json();
          setTeams(prev => prev.map(t =>
            t.leagueId === team.leagueId
              ? { ...t, starters: data.starters ?? [], bench: data.bench ?? [], rosterLoading: false }
              : t
          ));
        } catch {
          setTeams(prev => prev.map(t =>
            t.leagueId === team.leagueId
              ? { ...t, rosterLoading: false, rosterError: 'Failed to load roster' }
              : t
          ));
        }
      }));
    } catch {
      setNoTeams(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton />;
  if (noTeams)  return <NoTeams />;

  return (
    <div className="space-y-8">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white">MY TEAM</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-lg border border-pitch-700 bg-pitch-900 p-1.5 hover:bg-pitch-800 disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
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

      {/* Cards */}
      <div className="space-y-6">
        {teams.map(team => (
          <LeagueRosterCard key={`${team.platform}-${team.leagueId}`} team={team} />
        ))}
      </div>
    </div>
  );
}
