"use client";
import React, { useState } from "react";

interface Player {
  name: string;
  position: string;
  team?: string;
  // Actual points — API may send either field name
  points?: number;
  actual?: number;
  // Projected points — API sends projectedPoints (camelCase)
  projection?: number;
  projectedPoints?: number;
  // Kickoff timestamp ms — API sends kickoffMs (camelCase)
  kickoff_ms?: number | null;
  kickoffMs?: number | null;
  opponent?: string | null;
  // Home/away — API sends isHome (boolean)
  home_away?: "@" | "vs" | null;
  isHome?: boolean | null;
  status?: string;
}

interface MatchupCardProps {
  aName: string;
  bName: string;
  aPoints: number;
  bPoints: number;
  aKey: string;
  bKey: string;
  week?: number;
  aRoster?: Player[];
  bRoster?: Player[];
  rosterPositions?: { position: string; count: number }[];
  platform?: "yahoo" | "sleeper" | "espn";
  leagueKey?: string;
  analyzeContext?: "matchup" | "live";
  AnalyzeMatchup: React.ComponentType<{
    aKey: string;
    bKey: string;
    week?: number;
    aName?: string;
    bName?: string;
    platform?: "yahoo" | "sleeper" | "espn";
    leagueKey?: string;
    context?: "matchup" | "live";
  }>;
}

const MatchupCard: React.FC<MatchupCardProps> = ({
  aName,
  bName,
  aPoints,
  bPoints,
  aKey,
  bKey,
  week,
  aRoster = [],
  bRoster = [],
  AnalyzeMatchup,
  analyzeContext,
  rosterPositions,
  platform,
  leagueKey,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [aRosterData, setARosterData] = useState<Player[]>(aRoster);
  const [bRosterData, setBRosterData] = useState<Player[]>(bRoster);
  const [expandedRosters, setExpandedRosters] = useState<{a: boolean, b: boolean}>({a: false, b: false});
  const [loadingRosters, setLoadingRosters] = useState(false);

  const fetchRosterData = async (teamKey: string, retryCount = 0): Promise<Player[]> => {
    try {
      const params = new URLSearchParams();
      if (typeof week === 'number' && Number.isFinite(week)) params.set('week', String(week));
      if (platform) params.set('platform', platform);
      if (leagueKey) params.set('leagueKey', leagueKey);
      const qs = params.toString();
      const response = await fetch(`/api/roster/${teamKey}${qs ? `?${qs}` : ''}`);
      const data = await response.json();

      if (response.status === 401 && retryCount === 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchRosterData(teamKey, retryCount + 1);
      }

      if (data.ok && data.roster && Array.isArray(data.roster)) return data.roster;
      return [];
    } catch (error) {
      console.error(`[MatchupCard] roster fetch error for ${teamKey}:`, error);
      return [];
    }
  };

  const handleExpand = async () => {
    if (!isExpanded) {
      setIsExpanded(true);
      if ((aRosterData.length === 0 && aKey) || (bRosterData.length === 0 && bKey)) {
        setLoadingRosters(true);
        try {
          if (aRosterData.length === 0 && aKey) {
            const aRoster = await fetchRosterData(aKey);
            setARosterData(aRoster);
          }
          if (aRosterData.length === 0 && bRosterData.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          if (bRosterData.length === 0 && bKey) {
            const bRoster = await fetchRosterData(bKey);
            setBRosterData(bRoster);
          }
        } catch (error) {
          console.error('[MatchupCard] roster fetch error:', error);
        } finally {
          setLoadingRosters(false);
        }
      }
    } else {
      setIsExpanded(false);
    }
  };

  const isClose = Math.abs(aPoints - bPoints) < 15;
  const aWinning = aPoints >= bPoints;

  const safeText = (v: any, fallback: string = 'N/A') => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : '')).filter(Boolean).join(', ') || fallback;
    if (typeof v === 'object' && (v.position || v.pos)) return String(v.position || v.pos);
    return fallback;
  };

  const normalizeSlot = (pos?: string) => {
    const s = String(pos || '').toUpperCase();
    if (s === 'D/ST' || s === 'DST' || s === 'DEFENSE' || s === 'DE') return 'DEF';
    if (s === 'W/R/T' || s === 'WR/RB/TE' || s === 'W/R/T/QB') return 'FLEX';
    return s || 'BN';
  };
  const slotOrder: Record<string, number> = { QB: 1, WR: 2, RB: 3, TE: 4, FLEX: 5, K: 6, DEF: 7, IR: 98, BN: 99 };
  const isStarterSlot = (s: string) => s !== 'BN' && s !== 'IR';
  const orderOf = (s: string) => (slotOrder[s] ?? 90);
  const sortPlayers = (list: Player[]) =>
    list.slice().sort((a, b) => orderOf(normalizeSlot(a.position)) - orderOf(normalizeSlot(b.position)));

  const buildStartersBySlots = (list: Player[]) => {
    const players = list.slice();
    const starters: Player[] = [];
    const taken = new Array(players.length).fill(false);
    const slots = Array.isArray(rosterPositions) && rosterPositions.length
      ? rosterPositions.map(r => ({ position: normalizeSlot(r.position), count: r.count }))
      : [{ position: 'QB', count: 1 }, { position: 'WR', count: 2 }, { position: 'RB', count: 2 }, { position: 'TE', count: 1 }, { position: 'FLEX', count: 1 }, { position: 'K', count: 1 }, { position: 'DEF', count: 1 }];
    slots.forEach(slot => {
      if (!slot.position || slot.position === 'BN' || slot.position === 'IR') return;
      let need = Math.max(0, Number(slot.count || 0));
      for (let i = 0; i < players.length && need > 0; i++) {
        if (taken[i]) continue;
        const p = players[i];
        if (normalizeSlot(p.position) === slot.position || (slot.position === 'FLEX' && ['WR','RB','TE'].includes(normalizeSlot(p.position)))) {
          starters.push(p); taken[i] = true; need--;
        }
      }
    });
    return starters;
  };

  const slotPlan: string[] = (() => {
    const slots = Array.isArray(rosterPositions) && rosterPositions.length
      ? rosterPositions.map(r => ({ position: normalizeSlot(r.position), count: r.count }))
      : [{ position: 'QB', count: 1 }, { position: 'WR', count: 2 }, { position: 'RB', count: 2 }, { position: 'TE', count: 1 }, { position: 'FLEX', count: 1 }, { position: 'K', count: 1 }, { position: 'DEF', count: 1 }];
    const out: string[] = [];
    for (const s of slots) {
      if (!s.position || s.position === 'BN' || s.position === 'IR') continue;
      for (let i = 0; i < (Number(s.count)||0); i++) out.push(s.position);
    }
    return out;
  })();

  function makeSlotIter(list: Player[]) {
    const used = new Array(list.length).fill(false);
    return function next(slot: string): Player | undefined {
      for (let i = 0; i < list.length; i++) {
        if (used[i]) continue;
        const p = list[i];
        const s = normalizeSlot(p.position);
        if (s === slot || (slot === 'FLEX' && ['WR','RB','TE'].includes(s))) { used[i] = true; return p; }
      }
      return undefined;
    };
  }

  function formatGame(p?: Player): string {
    if (!p) return '—';
    const opp = (p.opponent || '').toString().toUpperCase();
    let ha: string | null = p.home_away || null;
    if (!ha && p.isHome !== undefined && p.isHome !== null) ha = p.isHome ? 'vs' : '@';
    const ms = p.kickoff_ms ?? p.kickoffMs;
    const when = ms ? new Date(ms) : null;
    if (!when || !Number.isFinite(when.getTime())) return opp && ha ? `${ha} ${opp}` : (opp || '—');
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const day = dayNames[when.getDay()];
    let h = when.getHours();
    const m = when.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    const mm = m.toString().padStart(2,'0');
    const time = `${h}:${mm} ${ampm}`;
    const place = (ha && opp) ? `${ha} ${opp}` : '';
    return place ? `${day} ${time} ${place}` : `${day} ${time}`;
  }

  function StatusChip({ s }:{ s?: string }){
    const S = String(s||'').toUpperCase();
    if (!S) return null as any;
    const isQ = S === 'Q' || S === 'QUESTIONABLE';
    const isO = S === 'O' || S === 'OUT' || S === 'D' || S === 'DOUBTFUL';
    const isIR = S === 'IR';
    if (!isQ && !isO && !isIR) return null as any;
    const color = isQ ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : isO ? 'bg-red-900/40 text-red-300 border border-red-700/40' : 'bg-purple-900/40 text-purple-300 border border-purple-700/40';
    const label = isQ ? 'Q' : isO ? 'O' : 'IR';
    return <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold ${color}`}>{label}</span> as any;
  }

  function getGameState(ms?: number | null): 'upcoming' | 'active' | 'done' | 'unknown' {
    if (!ms || !Number.isFinite(ms)) return 'unknown';
    const now = Date.now();
    if (ms > now) return 'upcoming';
    if (now < ms + 4 * 60 * 60 * 1000) return 'active';
    return 'done';
  }

  function pointsColorClass(p?: Player): string {
    if (!p) return 'text-gray-400';
    const ms = p.kickoff_ms ?? p.kickoffMs;
    const state = getGameState(ms);
    if (state === 'active') return 'text-amber-400 font-semibold';
    if (state === 'upcoming') return 'text-gray-600';
    return 'text-gray-300';
  }

  function totalsForStarters(list: Player[]) {
    const starters = buildStartersBySlots(sortPlayers(list));
    const sum = (arr: Array<number|undefined>) => {
      const total = arr.reduce((acc:number, val:number|undefined)=> acc + (Number(val ?? 0) || 0), 0);
      return Number(total.toFixed(1));
    };
    return {
      proj: sum(starters.map(p => p.projection ?? p.projectedPoints ?? 0)),
      actual: sum(starters.map(p => (p.actual ?? p.points ?? 0)))
    };
  }

  const renderCellPlayer = (p?: Player, alignRight=false) => {
    const ms = p?.kickoff_ms ?? p?.kickoffMs;
    const gameState = getGameState(ms);
    return (
      <div className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-0.5">
          {gameState === 'active' && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" title="Playing now" />
          )}
          <span className="truncate max-w-[150px] text-gray-100">{safeText(p?.name, '—')}</span>
          <StatusChip s={p?.status} />
        </div>
        <div className={`text-[10px] text-gray-600 ${alignRight ? 'text-right' : 'text-left'}`}>{formatGame(p)}</div>
      </div>
    );
  };

  return (
    <div className="bg-pitch-900 rounded-lg border border-pitch-700 hover:border-pitch-600 transition-colors">
      {/* Score header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isClose ? 'bg-amber-400' : 'bg-emerald-500'}`} />
          <span className="text-[10px] font-bold tracking-[0.15em] text-gray-600 uppercase">
            {isClose ? 'Close Game' : `Week ${week || 1}`}
          </span>
        </div>
        <button
          onClick={handleExpand}
          className="text-[11px] font-bold tracking-wider text-amber-400 hover:text-amber-300 transition-colors uppercase"
          disabled={loadingRosters}
        >
          {loadingRosters ? 'Loading...' : isExpanded ? '▲ Hide' : '▼ Rosters'}
        </button>
      </div>

      <div className="flex items-center px-4 pb-4 gap-3">
        <div className="flex-1 text-center min-w-0">
          <div className="font-semibold text-gray-200 text-xs mb-1.5 truncate">{aName}</div>
          <div className={`font-display text-3xl leading-none tabular-nums ${aWinning ? 'text-amber-400' : 'text-gray-600'}`}>
            {aPoints.toFixed(1)}
          </div>
        </div>
        <div className="text-pitch-500 text-xs font-bold tracking-widest">VS</div>
        <div className="flex-1 text-center min-w-0">
          <div className="font-semibold text-gray-400 text-xs mb-1.5 truncate">{bName}</div>
          <div className={`font-display text-3xl leading-none tabular-nums ${!aWinning ? 'text-amber-400' : 'text-gray-600'}`}>
            {bPoints.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Expanded roster table */}
      {isExpanded && (
        <div className="border-t border-pitch-700/60">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-pitch-700/40">
            <span className="text-[10px] font-bold tracking-[0.15em] text-gray-500 uppercase">Lineups</span>
            <span className="text-[10px] text-gray-700">Times in local timezone</span>
          </div>

          {loadingRosters ? (
            <div className="px-4 py-3 text-xs text-gray-500">Loading roster...</div>
          ) : (
            (() => {
              const aSorted = sortPlayers(aRosterData);
              const bSorted = sortPlayers(bRosterData);
              const aStarters = buildStartersBySlots(aSorted);
              const bStarters = buildStartersBySlots(bSorted);
              const nextA = makeSlotIter(aStarters);
              const nextB = makeSlotIter(bStarters);
              const rows = slotPlan.map((slot, idx) => ({ slot, A: nextA(slot), B: nextB(slot), id: idx }));
              const tA = totalsForStarters(aRosterData);
              const tB = totalsForStarters(bRosterData);

              return (
                <>
                  {/* Desktop table */}
                  <table className="hidden md:table table-fixed w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-600 font-bold tracking-wider uppercase border-b border-pitch-700/40">
                        <th className="px-3 py-2 text-left w-[34%]">{aName}</th>
                        <th className="px-2 py-2 text-right w-[7%]">Proj</th>
                        <th className="px-2 py-2 text-right w-[7%]">Pts</th>
                        <th className="px-2 py-2 text-center w-[10%]">Pos</th>
                        <th className="px-2 py-2 text-left w-[7%]">Pts</th>
                        <th className="px-2 py-2 text-left w-[7%]">Proj</th>
                        <th className="px-3 py-2 text-right w-[28%]">{bName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ slot, A, B, id }) => (
                        <tr key={id} className="border-t border-pitch-700/30 hover:bg-pitch-800/30">
                          <td className="px-3 py-2">{renderCellPlayer(A)}</td>
                          <td className="px-2 py-2 text-right text-gray-700">{A ? (A.projection ?? A.projectedPoints ?? 0).toFixed(1) : '—'}</td>
                          <td className={`px-2 py-2 text-right ${pointsColorClass(A)}`}>{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</td>
                          <td className="px-2 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600">{slot}</td>
                          <td className={`px-2 py-2 text-left ${pointsColorClass(B)}`}>{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</td>
                          <td className="px-2 py-2 text-left text-gray-700">{B ? (B.projection ?? B.projectedPoints ?? 0).toFixed(1) : '—'}</td>
                          <td className="px-3 py-2 text-right">{renderCellPlayer(B, true)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-pitch-700 bg-pitch-800/40">
                        <td className="px-3 py-2 font-bold text-gray-300 text-[10px] tracking-wider uppercase">Totals</td>
                        <td className="px-2 py-2 text-right font-bold text-gray-300">{tA.proj.toFixed(1)}</td>
                        <td className="px-2 py-2 text-right font-bold text-amber-400">{tA.actual.toFixed(1)}</td>
                        <td className="px-2 py-2 text-center text-gray-700">—</td>
                        <td className="px-2 py-2 text-left font-bold text-amber-400">{tB.actual.toFixed(1)}</td>
                        <td className="px-2 py-2 text-left font-bold text-gray-300">{tB.proj.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-300 text-[10px] tracking-wider uppercase">Totals</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Mobile stacked */}
                  <div className="md:hidden">
                    {rows.map(({ slot, A, B, id }) => (
                      <div key={id} className="border-t border-pitch-700/30 py-2.5 px-3">
                        <div className="text-center text-[10px] font-bold tracking-[0.15em] text-gray-600 uppercase mb-1.5">{slot}</div>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">{renderCellPlayer(A)}</div>
                          <div className="text-right w-14">
                            <div className="text-gray-600 text-[10px] uppercase tracking-wide">Proj</div>
                            <div className="text-gray-600">{A ? (A.projection ?? A.projectedPoints ?? 0).toFixed(1) : '—'}</div>
                          </div>
                          <div className="text-right w-14">
                            <div className="text-gray-600 text-[10px] uppercase tracking-wide">Pts</div>
                            <div className={pointsColorClass(A)}>{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 mt-2">
                          <div className="text-right w-14 order-2">
                            <div className="text-gray-600 text-[10px] uppercase tracking-wide">Pts</div>
                            <div className={pointsColorClass(B)}>{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</div>
                          </div>
                          <div className="text-right w-14 order-1">
                            <div className="text-gray-600 text-[10px] uppercase tracking-wide">Proj</div>
                            <div className="text-gray-600">{B ? (B.projection ?? B.projectedPoints ?? 0).toFixed(1) : '—'}</div>
                          </div>
                          <div className="flex-1 order-3">{renderCellPlayer(B, true)}</div>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-pitch-700 py-2.5 px-3 flex items-center justify-between text-sm bg-pitch-800/40">
                      <div className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">Totals</div>
                      <div className="text-right">
                        <div className="text-gray-600 text-[10px]">{aName}</div>
                        <div className="text-amber-400 font-bold">{tA.actual.toFixed(1)} <span className="text-gray-600 font-normal text-[10px]">proj {tA.proj.toFixed(1)}</span></div>
                      </div>
                      <div className="text-left">
                        <div className="text-gray-600 text-[10px]">{bName}</div>
                        <div className="text-amber-400 font-bold">{tB.actual.toFixed(1)} <span className="text-gray-600 font-normal text-[10px]">proj {tB.proj.toFixed(1)}</span></div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()
          )}

          {(aRosterData.length > 0 || bRosterData.length > 0) && (
            <div className="px-4 py-2.5 border-t border-pitch-700/40">
              <button
                onClick={() => setExpandedRosters(prev => ({ a: !prev.a, b: !prev.b }))}
                className="text-[11px] font-bold tracking-wider text-gray-600 hover:text-amber-400 uppercase transition-colors"
              >
                {expandedRosters.a && expandedRosters.b ? '▲ Hide bench / IR' : '▼ Show bench / IR'}
              </button>
              {(expandedRosters.a && expandedRosters.b) && (
                <div className="mt-2">
                  {(() => {
                    const benchA = sortPlayers(aRosterData).filter(p => !isStarterSlot(normalizeSlot(p.position)));
                    const benchB = sortPlayers(bRosterData).filter(p => !isStarterSlot(normalizeSlot(p.position)));
                    const max = Math.max(benchA.length, benchB.length);
                    return (
                      <>
                        <table className="hidden md:table table-fixed w-full text-xs">
                          <thead>
                            <tr className="text-[10px] text-gray-600 font-bold tracking-wider uppercase border-b border-pitch-700/40">
                              <th className="px-3 py-1.5 text-left w-[34%]">{aName} Bench</th>
                              <th className="px-2 py-1.5 text-right w-[7%]">Proj</th>
                              <th className="px-2 py-1.5 text-right w-[7%]">Pts</th>
                              <th className="px-2 py-1.5 text-center w-[10%]">Pos</th>
                              <th className="px-2 py-1.5 text-left w-[7%]">Pts</th>
                              <th className="px-2 py-1.5 text-left w-[7%]">Proj</th>
                              <th className="px-3 py-1.5 text-right w-[28%]">{bName} Bench</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: max }).map((_, i) => {
                              const A = benchA[i];
                              const B = benchB[i];
                              const slot = (A ? normalizeSlot(A.position) : (B ? normalizeSlot(B.position) : 'BN'));
                              return (
                                <tr key={i} className="border-t border-pitch-700/30">
                                  <td className="px-3 py-2">{renderCellPlayer(A)}</td>
                                  <td className="px-2 py-2 text-right text-gray-700">{A ? (A.projection ?? 0).toFixed(1) : '—'}</td>
                                  <td className="px-2 py-2 text-right text-gray-400">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</td>
                                  <td className="px-2 py-2 text-center text-[10px] font-bold tracking-wider text-gray-600">{slot}</td>
                                  <td className="px-2 py-2 text-left text-gray-400">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</td>
                                  <td className="px-2 py-2 text-left text-gray-700">{B ? (B.projection ?? 0).toFixed(1) : '—'}</td>
                                  <td className="px-3 py-2 text-right">{renderCellPlayer(B, true)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="md:hidden">
                          {Array.from({ length: max }).map((_, i) => {
                            const A = benchA[i];
                            const B = benchB[i];
                            const slot = (A ? normalizeSlot(A.position) : (B ? normalizeSlot(B.position) : 'BN'));
                            return (
                              <div key={i} className="border-t border-pitch-700/30 py-2.5 px-3">
                                <div className="text-center text-[10px] font-bold tracking-[0.15em] text-gray-600 uppercase mb-1.5">{slot}</div>
                                <div className="flex items-start gap-2">
                                  <div className="flex-1">{renderCellPlayer(A)}</div>
                                  <div className="text-right w-14">
                                    <div className="text-gray-600 text-[10px]">Proj</div>
                                    <div className="text-gray-500">{A ? (A.projection ?? 0).toFixed(1) : '—'}</div>
                                  </div>
                                  <div className="text-right w-14">
                                    <div className="text-gray-600 text-[10px]">Pts</div>
                                    <div className="text-gray-400">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 mt-2">
                                  <div className="text-right w-14 order-2">
                                    <div className="text-gray-600 text-[10px]">Pts</div>
                                    <div className="text-gray-400">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</div>
                                  </div>
                                  <div className="text-right w-14 order-1">
                                    <div className="text-gray-600 text-[10px]">Proj</div>
                                    <div className="text-gray-500">{B ? (B.projection ?? 0).toFixed(1) : '—'}</div>
                                  </div>
                                  <div className="flex-1 order-3">{renderCellPlayer(B, true)}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-pitch-700/60 px-4 py-3">
        <AnalyzeMatchup aKey={aKey} bKey={bKey} week={week} aName={aName} bName={bName} platform={platform} leagueKey={leagueKey} context={analyzeContext} />
      </div>
    </div>
  );
};

export default MatchupCard;
