"use client";
import React from "react";

interface Player {
  name: string;
  position: string;
  team: string;
  points: number;
}

interface MatchupCardProps {
  a: string;
  b: string;
  aRoster: Player[];
  bRoster: Player[];
  aTotal: number;
  bTotal: number;
  week: number;
  AnalyzeMatchup: React.ComponentType<{ aKey: string; bKey: string; week: number; aName?: string; bName?: string }>;
}

const MatchupCard: React.FC<MatchupCardProps> = ({ a, b, aRoster, bRoster, aTotal, bTotal, week, AnalyzeMatchup }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="bg-gray-950 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{a}</div>
          <div className="text-2xl font-semibold">{aTotal.toFixed(1)}</div>
        </div>
        <div className="opacity-60 px-2">vs</div>
        <div className="text-right">
          <div className="text-sm font-semibold">{b}</div>
          <div className="text-2xl font-semibold">{bTotal.toFixed(1)}</div>
        </div>
      </div>
      <div className="mt-2">
        <button
          className="text-xs text-blue-400 underline hover:text-blue-300 focus:outline-none"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide Rosters' : 'See Rosters'}
        </button>
        {expanded && (
          <div className="flex gap-8 mt-3">
            <div className="w-1/2">
              <div className="font-semibold text-xs mb-1">{a} Roster</div>
              <table className="w-full text-xs">
                <tbody>
                  {aRoster.map((p: any) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="text-gray-400">{p.position}</td>
                      <td className="text-right">{typeof p.points === 'number' ? p.points.toFixed(1) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="w-1/2 text-right">
              <div className="font-semibold text-xs mb-1">{b} Roster</div>
              <table className="w-full text-xs">
                <tbody>
                  {bRoster.map((p: any) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="text-gray-400">{p.position}</td>
                      <td className="text-right">{typeof p.points === 'number' ? p.points.toFixed(1) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {/* Analyze button (mock in demo) */}
  <AnalyzeMatchup aKey={a} bKey={b} week={week} aName={a} bName={b} />
    </div>
  );
};

export default MatchupCard;
