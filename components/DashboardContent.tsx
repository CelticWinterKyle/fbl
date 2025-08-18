"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Card from "@/components/Card";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import MatchupCard from "@/components/MatchupCard";
import { RefreshCw, CalendarDays, ChevronRight, Trophy } from "lucide-react";

type YahooStatus = {
  ok: boolean;
  userId?: string;
  reason?: string | null;
  userLeague?: string | null;
  tokenPreview?: { access_token: string } | null;
};

type MatchupData = {
  aN: string; aP: number; aK: string;
  bN: string; bP: number; bK: string;
};

type TeamData = {
  name: string;
  wins: number;
  losses: number;
  points: number;
};

export default function DashboardContent() {
  const [status, setStatus] = useState<YahooStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchups, setMatchups] = useState<MatchupData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [leagueInfo, setLeagueInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const lastLeagueRef = useRef<string | null>(null);

  // Function to load league data
  const loadLeagueData = useCallback(async (leagueKey: string) => {
    try {
      console.log('[DashboardContent] Attempting to load league data for:', leagueKey);
      
      // Fetch real league data from our new API endpoint
      const timestamp = Date.now();
      const response = await fetch(`/api/league-data?t=${timestamp}`, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.error('[DashboardContent] League data API error:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('[DashboardContent] Error details:', errorData);
        return;
      }

      const data = await response.json();
      
      if (!data.ok) {
        console.error('[DashboardContent] League data response error:', data.error, data.message);
        return;
      }

      console.log('[DashboardContent] Received league data:', {
        matchupsCount: data.matchups?.length || 0,
        teamsCount: data.teams?.length || 0,
        leagueName: data.meta?.name,
        currentWeek: data.meta?.week
      });

      // Safely set the data with fallbacks
      setMatchups(Array.isArray(data.matchups) ? data.matchups : []);
      setTeams(Array.isArray(data.teams) ? data.teams : []);
      setLeagueInfo(data.meta || {});
      
      console.log('[DashboardContent] Real league data loaded successfully');

    } catch (e) {
      console.error('Failed to load league data:', e);
      setError('Failed to load league data: ' + String(e));
      
      // Fallback to mock data if real data fails
      console.log('[DashboardContent] Falling back to mock data');
      const mockMatchups = [
        {
          aN: "Team Alpha", aP: 98.5, aK: "461.l.1224012.t.1",
          bN: "Team Beta", bP: 87.2, bK: "461.l.1224012.t.2"
        }
      ];
      
      const mockTeams = [
        { name: "Team Alpha", wins: 3, losses: 1, points: 415.2 }
      ];
      
      setMatchups(mockMatchups);
      setTeams(mockTeams);
    }
  }, []);

  // Function to load status and detect league changes
  const loadStatus = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const r = await fetch(`/api/yahoo/status?t=${timestamp}`, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const data = await r.json();
      
      // Only log status changes, not every poll
      const currentLeague = data.userLeague;
      const statusChanged = currentLeague !== lastLeagueRef.current;
      
      if (statusChanged) {
        console.log('[DashboardContent] Status data changed:', data);
      }
      
      setStatus(data);
      
      // Check if league changed
      if (currentLeague && currentLeague !== lastLeagueRef.current) {
        console.log('[DashboardContent] League changed from', lastLeagueRef.current, 'to', currentLeague);
        lastLeagueRef.current = currentLeague;
        
        // If we have Yahoo connection and league, fetch league data
        if (data.ok && data.userLeague && data.tokenPreview && !data.reason) {
          console.log('[DashboardContent] Auto-loading league data for:', data.userLeague);
          await loadLeagueData(data.userLeague);
        }
      } else if (!data.ok || !data.userLeague || !data.tokenPreview || data.reason) {
        if (statusChanged) {
          console.log('[DashboardContent] Not loading league data:', { 
            ok: data.ok, 
            hasLeague: !!data.userLeague, 
            hasToken: !!data.tokenPreview,
            reason: data.reason 
          });
        }
        // Clear data if auth failed
        setMatchups([]);
        setTeams([]);
        setLeagueInfo(null);
      }
    } catch (e) {
      console.error('Failed to load status:', e);
      setError('Failed to load status: ' + String(e));
    } finally {
      setLoading(false);
    }
  }, [loadLeagueData]);

  useEffect(() => {
    // Check if we just came back from authentication
    const urlParams = new URLSearchParams(window.location.search);
    const justAuthed = urlParams.get('auth') === 'success';
    
    if (justAuthed) {
      // Clean up the URL and force a reload to get fresh auth state
      window.history.replaceState({}, '', '/dashboard');
      window.location.reload();
      return;
    }

    // Initial load
    loadStatus();

    // Poll for league changes every 10 seconds (less aggressive)
    const pollInterval = setInterval(loadStatus, 10000);
    
    return () => clearInterval(pollInterval);
  }, [loadStatus]);

  if (loading) {
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Loading...">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading dashboard...
            </div>
            {error && (
              <div className="mt-2 text-xs text-red-400">
                Error: {error}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  if (!status?.ok || !status?.userLeague || !status?.tokenPreview || status?.reason) {
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Scoreboard">
            <div>
              {!status?.tokenPreview ? 'Connect Yahoo first.' : status?.reason ? `Error: ${status.reason}` : 'League not selected yet.'}
              <div className="text-xs text-gray-500 mt-2">
                Status: connected={!!status?.tokenPreview}, league={status?.userLeague || 'none'}, reason={status?.reason || 'none'}
              </div>
            </div>
          </Card>
          <Card title="Latest News">
            <div className="text-sm">• No commissioner updates available.</div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Standings">—</Card>
          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li>Season: —</li>
              <li>Scoring: —</li>
              <li>Trade deadline: —</li>
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title row */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {leagueInfo?.name || "Family Business League"}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-lg border border-gray-700/70 bg-gray-900 px-3 py-1.5 text-sm hover:bg-gray-800 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Week {leagueInfo?.week || 1}
          </button>
          <button 
            onClick={() => {
              setLoading(true);
              window.location.reload();
            }} 
            className="rounded-lg border border-gray-700/70 bg-gray-900 p-2 hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card 
            title="Scoreboard"
            action={<span className="text-xs text-blue-300 flex items-center gap-1">All matchups <ChevronRight className="h-3 w-3" /></span>}
          >
            {matchups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchups.map((m, i) => {
                  // Safe property access with fallbacks
                  const teamAName = m?.aN || "Team A";
                  const teamBName = m?.bN || "Team B";
                  const teamAPoints = typeof m?.aP === 'number' ? m.aP : 0;
                  const teamBPoints = typeof m?.bP === 'number' ? m.bP : 0;
                  const teamAKey = m?.aK || "";
                  const teamBKey = m?.bK || "";
                  
                  return (
                    <MatchupCard
                      key={i}
                      aName={teamAName}
                      bName={teamBName}
                      aPoints={teamAPoints}
                      bPoints={teamBPoints}
                      aKey={teamAKey}
                      bKey={teamBKey}
                      week={leagueInfo?.week}
                      AnalyzeMatchup={AnalyzeMatchup}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No matchups available for this week.</div>
            )}
          </Card>

          <Card title="Latest News" subtitle="Commissioner Updates">
            <ul className="list-disc ml-5 space-y-1 text-sm">
              <li className="text-gray-300">Draft scheduled: 8/25/2025, 7:00:00 PM</li>
              <li className="text-gray-300">Trade deadline: 11/21/2025, 5:00:00 PM</li>
              <li className="text-gray-300">Welcome to the {leagueInfo?.season || new Date().getFullYear()} season!</li>
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Standings">
            {teams.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="py-2">Team</th>
                    <th className="text-center">W</th>
                    <th className="text-center">L</th>
                    <th className="text-right">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.slice(0, 8).map((team, i) => {
                    const teamName = team?.name || "Unknown Team";
                    const wins = typeof team?.wins === 'number' ? team.wins : 0;
                    const losses = typeof team?.losses === 'number' ? team.losses : 0;
                    const points = typeof team?.points === 'number' ? team.points : 0;
                    
                    return (
                      <tr key={i} className="border-b border-gray-700 last:border-0 hover:bg-gray-800/50">
                        <td className="py-2 truncate font-medium">{teamName}</td>
                        <td className="text-center">{wins}</td>
                        <td className="text-center">{losses}</td>
                        <td className="text-right">{points.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : "—"}
          </Card>

          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li><span className="font-medium">Season:</span> {leagueInfo?.season || new Date().getFullYear()}</li>
              <li><span className="font-medium">Week:</span> {leagueInfo?.week || "—"}</li>
              <li><span className="font-medium">Teams:</span> {teams.length || "—"}</li>
              <li><span className="font-medium">League:</span> {leagueInfo?.name || "—"}</li>
              <li><span className="font-medium">Trade Deadline:</span> Nov 21, 2025</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="League Activity" subtitle="Recent adds, drops, and trades">
          <div className="space-y-2">
            <div className="text-xs text-gray-400 border-l-2 border-blue-500 pl-2">
              <div className="font-medium">No recent activity</div>
              <div className="text-gray-500">Check back during the season for player transactions</div>
            </div>
            <div className="text-xs text-gray-500 mt-3 pt-2 border-t border-gray-700">
              Trade deadline: November 21, 2025
            </div>
          </div>
        </Card>
        
        <Card title="Trophy Case" subtitle="Champions and records">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <div>
                <div className="font-semibold text-gray-200">2024: TBD</div>
                <div className="text-xs text-gray-400">Current season in progress</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Trophy className="h-5 w-5 text-gray-400" />
              <div>
                <div className="font-semibold text-gray-200">2023: Previous Champion</div>
                <div className="text-xs text-gray-400">Last season winner</div>
              </div>
            </div>
            <div className="border-t border-gray-700 pt-2 mt-2">
              <div className="text-xs text-gray-400">
                League est. 2023 • {teams.length} teams
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
