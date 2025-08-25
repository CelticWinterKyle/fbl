"use client";
import React, { useState } from "react";

interface Player {
  name: string;
  position: string;
  team?: string;
  points?: number;
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
  AnalyzeMatchup
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

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isClose ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
          <span className="text-xs text-gray-400">
            {isClose ? 'CLOSE GAME' : 'WEEK ' + (week || 1)}
          </span>
        </div>
        <button
          onClick={handleExpand}
          className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
          disabled={loadingRosters}
        >
          {loadingRosters ? 'Loading...' : isExpanded ? 'Hide Details' : 'See Rosters'}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 text-center">
          <div className="font-semibold text-white text-sm mb-1">{aName}</div>
          <div className="text-2xl font-bold text-blue-400">{aPoints.toFixed(1)}</div>
        </div>
        
        <div className="px-4">
          <span className="text-gray-500 text-sm">vs</span>
        </div>
        
        <div className="flex-1 text-center">
          <div className="font-semibold text-white text-sm mb-1">{bName}</div>
          <div className="text-2xl font-bold text-red-400">{bPoints.toFixed(1)}</div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-medium text-white mb-2 text-sm">{aName} Roster</h4>
              {loadingRosters ? (
                <div className="text-xs text-gray-400">Loading roster...</div>
              ) : aRosterData && aRosterData.length > 0 ? (
                <div className="space-y-1">
                  {(expandedRosters.a ? aRosterData : aRosterData.slice(0, 8)).map((player, idx) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between">
                      <span className="truncate">{safeText((player as any).name, 'Unknown Player')}</span>
                      <span className="text-gray-500 ml-2">{safeText((player as any).position, 'N/A')}</span>
                    </div>
                  ))}
                  {aRosterData.length > 8 && (
                    <button 
                      onClick={() => setExpandedRosters(prev => ({...prev, a: !prev.a}))}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                    >
                      {expandedRosters.a ? 'Show less' : `...and ${aRosterData.length - 8} more`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Roster data not available for {aName}.</p>
                  <p className="text-gray-600">{`This can happen before the draft or if Yahoo is rate-limiting.`}</p>
                </div>
              )}
            </div>
            
            <div>
              <h4 className="font-medium text-white mb-2 text-sm">{bName} Roster</h4>
              {loadingRosters ? (
                <div className="text-xs text-gray-400">Loading roster...</div>
              ) : bRosterData && bRosterData.length > 0 ? (
                <div className="space-y-1">
                  {(expandedRosters.b ? bRosterData : bRosterData.slice(0, 8)).map((player, idx) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between">
                      <span className="truncate">{player.name || 'Unknown Player'}</span>
                      <span className="text-gray-500 ml-2">{player.position || 'N/A'}</span>
                    </div>
                  ))}
                  {bRosterData.length > 8 && (
                    <button 
                      onClick={() => setExpandedRosters(prev => ({...prev, b: !prev.b}))}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                    >
                      {expandedRosters.b ? 'Show less' : `...and ${bRosterData.length - 8} more`}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Roster data not available for {bName}.</p>
                  <p className="text-gray-600">{`This can happen before the draft or if Yahoo is rate-limiting.`}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <AnalyzeMatchup 
          aKey={aKey} 
          bKey={bKey} 
          week={week}
          aName={aName}
          bName={bName}
        />
      </div>
    </div>
  );
};

export default MatchupCard;
