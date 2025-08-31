"use client";
import React, { useState } from "react";

interface Player {
  name: string;
  position: string;
  team?: string;
  points?: number; // kept for compatibility; equals actual
  actual?: number;
  projection?: number;
  kickoff_ms?: number | null;
  opponent?: string | null;
  home_away?: "@" | "vs" | null;
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
  AnalyzeMatchup: React.ComponentType<{ 
    aKey: string; 
    bKey: string; 
    week?: number; 
    aName?: string; 
    bName?: string 
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
  rosterPositions
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [aRosterData, setARosterData] = useState<Player[]>(aRoster);
  const [bRosterData, setBRosterData] = useState<Player[]>(bRoster);
  const [expandedRosters, setExpandedRosters] = useState<{a: boolean, b: boolean}>({a: false, b: false});
  const [loadingRosters, setLoadingRosters] = useState(false);

  const fetchRosterData = async (teamKey: string, retryCount = 0): Promise<Player[]> => {
    try {
      console.log(`[MatchupCard] Fetching roster for team: ${teamKey} (attempt ${retryCount + 1})`);
      const params = new URLSearchParams();
      if (typeof week === 'number' && Number.isFinite(week)) params.set('week', String(week));
      if (process.env.NODE_ENV === 'development') params.set('debug', '1');
  // Force a fresh parse while we refine position logic
  params.set('bust', 'projfix3');
  const qs = params.toString();
      const response = await fetch(`/api/roster/${teamKey}${qs ? `?${qs}` : ''}`);
      const data = await response.json();
      
      console.log(`[MatchupCard] Roster response for ${teamKey}:`, {
        ok: data.ok,
        status: response.status,
        rosterLength: data.roster?.length || 0,
        empty: data.empty,
        reason: data.reason,
        error: data.error
      });
      
      // If we get a 401 and haven't retried yet, wait a moment and retry
      if (response.status === 401 && retryCount === 0) {
        console.log(`[MatchupCard] Got 401 for ${teamKey}, retrying after delay...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchRosterData(teamKey, retryCount + 1);
      }
      
      if (data.ok && data.roster && Array.isArray(data.roster)) {
        console.log(`[MatchupCard] Successfully loaded ${data.roster.length} players for ${teamKey}`);
        return data.roster;
      } else {
        console.warn(`[MatchupCard] No roster data for ${teamKey}:`, {
          ok: data.ok,
          hasRoster: !!data.roster,
          isArray: Array.isArray(data.roster),
          reason: data.reason
        });
        return [];
      }
    } catch (error) {
      console.error(`[MatchupCard] Error fetching roster for ${teamKey}:`, error);
      return [];
    }
  };

  const handleExpand = async () => {
    if (!isExpanded) {
      setIsExpanded(true);
      
      console.log(`[MatchupCard] Expanding matchup: ${aName} vs ${bName}`);
      console.log(`[MatchupCard] Team keys: A=${aKey}, B=${bKey}`);
      console.log(`[MatchupCard] Current roster lengths: A=${aRosterData.length}, B=${bRosterData.length}`);
      
      // Only fetch if we don't have roster data and have team keys
      if ((aRosterData.length === 0 && aKey) || (bRosterData.length === 0 && bKey)) {
        setLoadingRosters(true);
        
        try {
          // Fetch team A roster
          if (aRosterData.length === 0 && aKey) {
            console.log(`[MatchupCard] Fetching roster for team A: ${aKey}`);
            const aRoster = await fetchRosterData(aKey);
            console.log(`[MatchupCard] Team A roster fetch result: ${aRoster.length} players`);
            setARosterData(aRoster);
          }
          
          // Small delay between requests to prevent token refresh race conditions
          if (aRosterData.length === 0 && bRosterData.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Fetch team B roster  
          if (bRosterData.length === 0 && bKey) {
            console.log(`[MatchupCard] Fetching roster for team B: ${bKey}`);
            const bRoster = await fetchRosterData(bKey);
            console.log(`[MatchupCard] Team B roster fetch result: ${bRoster.length} players`);
            setBRosterData(bRoster);
          }
        } catch (error) {
          console.error(`[MatchupCard] Error during roster fetching:`, error);
        } finally {
          setLoadingRosters(false);
        }
      }
    } else {
      setIsExpanded(false);
    }
  };

  const isClose = Math.abs(aPoints - bPoints) < 15;
  // Defensive formatter so we never render objects directly (avoids React error #31)
  const safeText = (v: any, fallback: string = 'N/A') => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : '')).filter(Boolean).join(', ') || fallback;
    // common yahoo shapes for position
    if (typeof v === 'object' && (v.position || v.pos)) return String(v.position || v.pos);
    return fallback;
  };

  // Normalize slots and sort so starters come first (QB, WR, RB, TE, FLEX, K, DEF), then BN/IR
  const normalizeSlot = (pos?: string) => {
    const s = String(pos || '').toUpperCase();
    if (s === 'D/ST' || s === 'DST' || s === 'DEFENSE' || s === 'DE') return 'DEF';
    if (s === 'W/R/T' || s === 'WR/RB/TE' || s === 'W/R/T/QB') return 'FLEX';
    return s || 'BN';
  };
  const slotOrder: Record<string, number> = {
    QB: 1, WR: 2, RB: 3, TE: 4, FLEX: 5, K: 6, DEF: 7,
    IR: 98, BN: 99,
  };
  const isStarterSlot = (s: string) => s !== 'BN' && s !== 'IR';
  const orderOf = (s: string) => (slotOrder[s] ?? 90);
  const sortPlayers = (list: Player[]) =>
    list.slice().sort((a, b) => orderOf(normalizeSlot(a.position)) - orderOf(normalizeSlot(b.position)));

  // Build starters in league-defined slot order (using counts)
  const buildStartersBySlots = (list: Player[]) => {
    const players = list.slice();
    const starters: Player[] = [];
    const taken = new Array(players.length).fill(false);
    const slots = Array.isArray(rosterPositions) && rosterPositions.length
      ? rosterPositions.map(r => ({ position: normalizeSlot(r.position), count: r.count }))
      : [{ position: 'QB', count: 1 }, { position: 'WR', count: 2 }, { position: 'RB', count: 2 }, { position: 'TE', count: 1 }, { position: 'FLEX', count: 1 }, { position: 'K', count: 1 }, { position: 'DEF', count: 1 }];
    // iterate slots in order, pick first players matching that slot
    slots.forEach(slot => {
      if (!slot.position || slot.position === 'BN' || slot.position === 'IR') return;
      let need = Math.max(0, Number(slot.count || 0));
      for (let i = 0; i < players.length && need > 0; i++) {
        if (taken[i]) continue;
        const p = players[i];
        if (normalizeSlot(p.position) === slot.position || (slot.position === 'FLEX' && ['WR','RB','TE'].includes(normalizeSlot(p.position)))) {
          starters.push(p);
          taken[i] = true;
          need--;
        }
      }
    });
    return starters;
  };

  // Slot plan expanded into ordered array like [QB, WR, WR, RB, RB, TE, FLEX, K, DEF]
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

  // Utility: pickup next player matching a slot without consuming others
  function makeSlotIter(list: Player[]) {
    const used = new Array(list.length).fill(false);
    return function next(slot: string): Player | undefined {
      for (let i = 0; i < list.length; i++) {
        if (used[i]) continue;
        const p = list[i];
        const s = normalizeSlot(p.position);
        if (s === slot || (slot === 'FLEX' && ['WR','RB','TE'].includes(s))) {
          used[i] = true;
          return p;
        }
      }
      return undefined;
    };
  }

  // Format game line: Thu 8:20 pm @ PHI
  function formatGame(p?: Player): string {
    if (!p) return '—';
    const opp = (p.opponent || '').toString().toUpperCase();
    const ha = p.home_away || null;
    const when = p.kickoff_ms ? new Date(p.kickoff_ms) : null;
    if (!when || !Number.isFinite(when.getTime())) return opp && ha ? `${ha} ${opp}` : '—';
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

  // Render small status chip
  function StatusChip({ s }:{ s?: string }){
    const S = String(s||'').toUpperCase();
    if (!S) return null as any;
    const color = S==='Q' ? 'bg-yellow-500 text-black' : S==='O' || S==='OUT' ? 'bg-red-600' : S==='IR' ? 'bg-purple-600' : 'bg-gray-600';
    const label = S==='QUESTIONABLE' ? 'Q' : S==='OUT' ? 'O' : S;
    return <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${color}`}>{label}</span> as any;
  }

  // Compute totals for starters
  function totalsForStarters(list: Player[]) {
    const starters = buildStartersBySlots(sortPlayers(list));
    const sum = (arr: Array<number|undefined>) => {
      const total = arr.reduce((acc:number, val:number|undefined)=> acc + (Number(val ?? 0) || 0), 0);
      return Number(total.toFixed(1));
    };
    return {
      proj: sum(starters.map(p => p.projection ?? 0)),
      actual: sum(starters.map(p => (p.actual ?? p.points ?? 0)))
    };
  }

  // Shared player cell renderer used in both starters and bench tables
  const renderCellPlayer = (p?: Player, alignRight=false) => (
    <div className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'}`}>
          <div className="">
        <span className="truncate max-w-[160px]">{safeText(p?.name, '—')}</span>
        <StatusChip s={p?.status} />
      </div>
      <div className={`text-[11px] text-gray-400 ${alignRight ? 'text-right' : 'text-left'}`}>{formatGame(p)}</div>
    </div>
  );

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isClose ? 'bg-yellow-400' : 'bg-green-400'}`} />
          <span className="text-xs text-gray-400">{isClose ? 'CLOSE GAME' : 'WEEK ' + (week || 1)}</span>
        </div>
        <button onClick={handleExpand} className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors" disabled={loadingRosters}>
          {loadingRosters ? 'Loading...' : isExpanded ? 'Hide Details' : 'See Rosters'}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 text-center">
          <div className="font-semibold text-white text-sm mb-1">{aName}</div>
          <div className="text-2xl font-bold text-blue-400">{aPoints.toFixed(1)}</div>
        </div>
        <div className="px-4"><span className="text-gray-500 text-sm">vs</span></div>
        <div className="flex-1 text-center">
          <div className="font-semibold text-white text-sm mb-1">{bName}</div>
          <div className="text-2xl font-bold text-red-400">{bPoints.toFixed(1)}</div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-white text-sm">Lineups</h4>
            <div className="text-xs text-gray-400">Times shown in your local timezone</div>
          </div>

          {loadingRosters ? (
            <div className="text-xs text-gray-400 p-2">Loading roster...</div>
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
                  {/* Desktop/tablet table */}
                  <table className="hidden md:table table-fixed w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="px-2 py-1 text-left w-[34%]">{aName}</th>
                        <th className="px-2 py-1 text-right w-[7%]">Proj</th>
                        <th className="px-2 py-1 text-right w-[7%]">Fan Pts</th>
                        <th className="px-2 py-1 text-center w-[10%]">Pos</th>
                        <th className="px-2 py-1 text-left w-[7%]">Fan Pts</th>
                        <th className="px-2 py-1 text-left w-[7%]">Proj</th>
                        <th className="px-2 py-1 text-right w-[28%]">{bName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ slot, A, B, id }) => (
                        <tr key={id} className="border-t border-gray-800">
                          <td className="px-2 py-2 text-white">{renderCellPlayer(A)}</td>
                          <td className="px-2 py-2 text-right text-gray-200">{A ? (A.projection ?? 0).toFixed(1) : '—'}</td>
                          <td className="px-2 py-2 text-right text-gray-300">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</td>
                          <td className="px-2 py-2 text-center text-gray-400">{slot}</td>
                          <td className="px-2 py-2 text-left text-gray-300">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</td>
                          <td className="px-2 py-2 text-left text-gray-200">{B ? (B.projection ?? 0).toFixed(1) : '—'}</td>
                          <td className="px-2 py-2 text-white text-right">{renderCellPlayer(B, true)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-700">
                        <td className="px-2 py-2 font-semibold text-gray-200">Totals</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-200">{tA.proj.toFixed(1)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-200">{tA.actual.toFixed(1)}</td>
                        <td className="px-2 py-2 text-center text-gray-500">—</td>
                        <td className="px-2 py-2 text-left font-semibold text-gray-200">{tB.actual.toFixed(1)}</td>
                        <td className="px-2 py-2 text-left font-semibold text-gray-200">{tB.proj.toFixed(1)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-200">Totals</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Mobile stacked rows */}
                  <div className="md:hidden">
                    {rows.map(({ slot, A, B, id }) => (
                      <div key={id} className="border-t border-gray-800 py-2">
                        <div className="text-center text-[11px] text-gray-400 mb-1">{slot}</div>
                        <div className="flex items-start gap-2">
                          <div className="flex-1">{renderCellPlayer(A)}</div>
                          <div className="text-right w-16">
                            <div className="text-gray-400 text-[11px]">Proj</div>
                            <div className="text-gray-200">{A ? (A.projection ?? 0).toFixed(1) : '—'}</div>
                          </div>
                          <div className="text-right w-16">
                            <div className="text-gray-400 text-[11px]">Pts</div>
                            <div className="text-gray-300">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 mt-2">
                          <div className="text-right w-16 order-2">
                            <div className="text-gray-400 text-[11px]">Pts</div>
                            <div className="text-gray-300">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</div>
                          </div>
                          <div className="text-right w-16 order-1">
                            <div className="text-gray-400 text-[11px]">Proj</div>
                            <div className="text-gray-200">{B ? (B.projection ?? 0).toFixed(1) : '—'}</div>
                          </div>
                          <div className="flex-1 order-3">{renderCellPlayer(B, true)}</div>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-gray-700 py-2 flex items-center justify-between text-sm">
                      <div className="text-gray-200">Totals</div>
                      <div className="text-right">
                        <div className="text-gray-400 text-[11px]">{aName}</div>
                        <div className="text-gray-200">Proj {tA.proj.toFixed(1)} • Pts {tA.actual.toFixed(1)}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-gray-400 text-[11px]">{bName}</div>
                        <div className="text-gray-200">Pts {tB.actual.toFixed(1)} • Proj {tB.proj.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()
          )}

          {(aRosterData.length>0 || bRosterData.length>0) && (
            <div className="mt-3">
              <button onClick={() => setExpandedRosters(prev => ({ a: !prev.a, b: !prev.b }))} className="text-xs text-blue-400 hover:text-blue-300">
                {expandedRosters.a && expandedRosters.b ? 'Hide bench / IR' : 'Show bench / IR'}
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
                            <tr className="text-gray-400">
                              <th className="px-2 py-1 text-left w-[34%]">{aName} Bench</th>
                              <th className="px-2 py-1 text-right w-[7%]">Proj</th>
                              <th className="px-2 py-1 text-right w-[7%]">Fan Pts</th>
                              <th className="px-2 py-1 text-center w-[10%]">Pos</th>
                              <th className="px-2 py-1 text-left w-[7%]">Fan Pts</th>
                              <th className="px-2 py-1 text-left w-[7%]">Proj</th>
                              <th className="px-2 py-1 text-right w-[28%]">{bName} Bench</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: max }).map((_, i) => {
                              const A = benchA[i];
                              const B = benchB[i];
                              const slot = (A ? normalizeSlot(A.position) : (B ? normalizeSlot(B.position) : 'BN'));
                              return (
                                <tr key={i} className="border-t border-gray-800">
                                  <td className="px-2 py-2 text-white">{renderCellPlayer(A)}</td>
                                  <td className="px-2 py-2 text-right text-gray-200">{A ? (A.projection ?? 0).toFixed(1) : '—'}</td>
                                  <td className="px-2 py-2 text-right text-gray-300">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</td>
                                  <td className="px-2 py-2 text-center text-gray-400">{slot}</td>
                                  <td className="px-2 py-2 text-left text-gray-300">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</td>
                                  <td className="px-2 py-2 text-left text-gray-200">{B ? (B.projection ?? 0).toFixed(1) : '—'}</td>
                                  <td className="px-2 py-2 text-white text-right">{renderCellPlayer(B, true)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Mobile stacked bench */}
                        <div className="md:hidden">
                          {Array.from({ length: max }).map((_, i) => {
                            const A = benchA[i];
                            const B = benchB[i];
                            const slot = (A ? normalizeSlot(A.position) : (B ? normalizeSlot(B.position) : 'BN'));
                            return (
                              <div key={i} className="border-t border-gray-800 py-2">
                                <div className="text-center text-[11px] text-gray-400 mb-1">{slot}</div>
                                <div className="flex items-start gap-2">
                                  <div className="flex-1">{renderCellPlayer(A)}</div>
                                  <div className="text-right w-16">
                                    <div className="text-gray-400 text-[11px]">Proj</div>
                                    <div className="text-gray-200">{A ? (A.projection ?? 0).toFixed(1) : '—'}</div>
                                  </div>
                                  <div className="text-right w-16">
                                    <div className="text-gray-400 text-[11px]">Pts</div>
                                    <div className="text-gray-300">{A ? ((A.actual ?? A.points ?? 0).toFixed(1)) : '—'}</div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-2 mt-2">
                                  <div className="text-right w-16 order-2">
                                    <div className="text-gray-400 text-[11px]">Pts</div>
                                    <div className="text-gray-300">{B ? ((B.actual ?? B.points ?? 0).toFixed(1)) : '—'}</div>
                                  </div>
                                  <div className="text-right w-16 order-1">
                                    <div className="text-gray-400 text-[11px]">Proj</div>
                                    <div className="text-gray-200">{B ? (B.projection ?? 0).toFixed(1) : '—'}</div>
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

      <div className="mt-4 pt-4 border-t border-gray-700">
        <AnalyzeMatchup aKey={aKey} bKey={bKey} week={week} aName={aName} bName={bName} />
      </div>
    </div>
  );
};

export default MatchupCard;
