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
  const [loadingRosters, setLoadingRosters] = useState(false);

  const fetchRosterData = async (teamKey: string): Promise<Player[]> => {
    try {
      const response = await fetch(`/api/roster/${teamKey}`);
      const data = await response.json();
      
      if (data.ok && data.roster) {
        return data.roster;
      }
      return [];
    } catch (error) {
      console.error('Error fetching roster:', error);
      return [];
    }
  };

  const handleExpand = async () => {
    if (!isExpanded) {
      setIsExpanded(true);
      
      // Only fetch if we don't have roster data and have team keys
      if ((aRosterData.length === 0 && aKey) || (bRosterData.length === 0 && bKey)) {
        setLoadingRosters(true);
        
        const promises = [];
        
        if (aRosterData.length === 0 && aKey) {
          promises.push(fetchRosterData(aKey).then(roster => ({ team: 'a', roster })));
        }
        
        if (bRosterData.length === 0 && bKey) {
          promises.push(fetchRosterData(bKey).then(roster => ({ team: 'b', roster })));
        }
        
        const results = await Promise.all(promises);
        
        results.forEach(({ team, roster }) => {
          if (team === 'a') setARosterData(roster);
          if (team === 'b') setBRosterData(roster);
        });
        
        setLoadingRosters(false);
      }
    } else {
      setIsExpanded(false);
    }
  };

  const isClose = Math.abs(aPoints - bPoints) < 15;

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
                  {aRosterData.slice(0, 8).map((player, idx) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between">
                      <span className="truncate">{player.name || 'Unknown Player'}</span>
                      <span className="text-gray-500 ml-2">{player.position || 'N/A'}</span>
                    </div>
                  ))}
                  {aRosterData.length > 8 && (
                    <div className="text-xs text-gray-500">...and {aRosterData.length - 8} more</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Roster data not available.</p>
                  <p className="text-gray-600">Try the AI analysis below for detailed info.</p>
                </div>
              )}
            </div>
            
            <div>
              <h4 className="font-medium text-white mb-2 text-sm">{bName} Roster</h4>
              {loadingRosters ? (
                <div className="text-xs text-gray-400">Loading roster...</div>
              ) : bRosterData && bRosterData.length > 0 ? (
                <div className="space-y-1">
                  {bRosterData.slice(0, 8).map((player, idx) => (
                    <div key={idx} className="text-xs text-gray-300 flex justify-between">
                      <span className="truncate">{player.name || 'Unknown Player'}</span>
                      <span className="text-gray-500 ml-2">{player.position || 'N/A'}</span>
                    </div>
                  ))}
                  {bRosterData.length > 8 && (
                    <div className="text-xs text-gray-500">...and {bRosterData.length - 8} more</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Roster data not available.</p>
                  <p className="text-gray-600">Try the AI analysis below for detailed info.</p>
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
