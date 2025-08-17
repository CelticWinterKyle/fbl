"use client";
import { useState, useEffect } from "react";
import Card from "@/components/Card";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
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

  useEffect(() => {
    async function loadStatus() {
      try {
        const r = await fetch('/api/yahoo/status', { cache: 'no-store' });
        const data = await r.json();
        console.log('[DashboardContent] Status data:', data);
        setStatus(data);
        
        // If we have Yahoo connection and league, fetch league data
        if (data.ok && data.userLeague && data.tokenPreview) {
          console.log('[DashboardContent] Loading league data for:', data.userLeague);
          await loadLeagueData(data.userLeague);
        } else {
          console.log('[DashboardContent] Not loading league data:', { 
            ok: data.ok, 
            hasLeague: !!data.userLeague, 
            hasToken: !!data.tokenPreview 
          });
        }
      } catch (e) {
        console.error('Failed to load status:', e);
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, []);

  async function loadLeagueData(leagueKey: string) {
    try {
      console.log('[DashboardContent] Attempting to load league data for:', leagueKey);
      
      // Fetch real league data from our new API endpoint
      const response = await fetch('/api/league-data', { cache: 'no-store' });
      
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

      // Set the real data
      setMatchups(data.matchups || []);
      setTeams(data.teams || []);
      setLeagueInfo(data.meta || {});
      
      console.log('[DashboardContent] Real league data loaded successfully');

    } catch (e) {
      console.error('Failed to load league data:', e);
      
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
  }

  if (loading) {
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Loading...">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading dashboard...
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!status?.ok || !status?.userLeague || !status?.tokenPreview) {
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Scoreboard">
            <div>
              {!status?.tokenPreview ? 'Connect Yahoo first.' : 'League not selected yet.'}
              <div className="text-xs text-gray-500 mt-2">
                Status: connected={!!status?.tokenPreview}, league={status?.userLeague || 'none'}
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
            onClick={() => window.location.reload()} 
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
                {matchups.map((m, i) => (
                  <div key={i} className="bg-gray-950 rounded-lg p-4 border border-gray-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{m.aN}</div>
                        <div className="text-2xl font-semibold">{m.aP.toFixed(1)}</div>
                      </div>
                      <div className="opacity-60 px-2">vs</div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{m.bN}</div>
                        <div className="text-2xl font-semibold">{m.bP.toFixed(1)}</div>
                      </div>
                    </div>
                    {m.aK && m.bK && (
                      <div className="mt-3">
                        <AnalyzeMatchup 
                          aKey={m.aK} 
                          bKey={m.bK} 
                          week={leagueInfo?.week}
                          aName={m.aN} 
                          bName={m.bN}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No matchups available for this week.</div>
            )}
          </Card>

          <Card title="Latest News" subtitle="Commissioner Updates">
            <div className="text-sm">• No commissioner updates available.</div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Standings">
            {teams.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="py-2">Team</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PF</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.slice(0, 8).map((team, i) => (
                    <tr key={i} className="border-b border-gray-700 last:border-0">
                      <td className="py-2 truncate">{team.name}</td>
                      <td>{team.wins}</td>
                      <td>{team.losses}</td>
                      <td>{team.points.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : "—"}
          </Card>

          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li>Season: {leagueInfo?.season || new Date().getFullYear()}</li>
              <li>Week: {leagueInfo?.week || "—"}</li>
              <li>Teams: {teams.length || "—"}</li>
              <li>League: {leagueInfo?.name || "—"}</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="League Activity" subtitle="Recent adds, drops, and trades">
          <div className="rounded-lg border border-dashed border-gray-800 bg-gray-950 p-6 text-center text-gray-400">
            No recent activity
          </div>
        </Card>
        
        <Card title="Trophy Case" subtitle="Champions and records">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm text-gray-300">
              <Trophy className="h-5 w-5 text-amber-300" />
              <span className="font-semibold">2024:</span> 
              <span>TBD</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-300">
              <Trophy className="h-5 w-5 text-amber-300" />
              <span className="font-semibold">2023:</span> 
              <span>Previous Champion</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
