"use client";
import React, { useState } from "react";

interface Player {
  name: string;
  position: string;
  team: string;
  points: number;
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
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-gray-950 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{aName}</div>
          <div className="text-2xl font-semibold">{aPoints.toFixed(1)}</div>
        </div>
        <div className="opacity-60 px-2">vs</div>
        <div className="text-right">
          <div className="text-sm font-semibold">{bName}</div>
          <div className="text-2xl font-semibold">{bPoints.toFixed(1)}</div>
        </div>
      </div>
      
      <div className="mt-3 flex items-center justify-between">
        <button
          className="text-xs text-blue-400 underline hover:text-blue-300 focus:outline-none"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide Rosters' : 'See Rosters'}
        </button>
        
        <AnalyzeMatchup 
          aKey={aKey} 
          bKey={bKey} 
          week={week}
          aName={aName} 
          bName={bName}
        />
      </div>
      
      {expanded && (aRoster.length > 0 || bRoster.length > 0) && (
        <div className="flex gap-8 mt-3">
          <div className="w-1/2">
            <div className="font-semibold text-xs mb-1">{aName} Roster</div>
            <table className="w-full text-xs">
              <tbody>
                {aRoster.map((player, i) => (
                  <tr key={i} className="border-b border-gray-700 last:border-0">
                    <td className="py-1 pr-2">{player.position}</td>
                    <td className="py-1 truncate">{player.name}</td>
                    <td className="py-1 text-right">{player.points.toFixed(1)}</td>
                  </tr>
                ))}
                {aRoster.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-gray-500 text-center">
                      Roster not available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="w-1/2">
            <div className="font-semibold text-xs mb-1">{bName} Roster</div>
            <table className="w-full text-xs">
              <tbody>
                {bRoster.map((player, i) => (
                  <tr key={i} className="border-b border-gray-700 last:border-0">
                    <td className="py-1 pr-2">{player.position}</td>
                    <td className="py-1 truncate">{player.name}</td>
                    <td className="py-1 text-right">{player.points.toFixed(1)}</td>
                  </tr>
                ))}
                {bRoster.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-gray-500 text-center">
                      Roster not available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchupCard;
