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
      
      // For now, let's use mock data since we need to create proper API endpoints
      // This will at least show that the component is working
      const mockMatchups = [
        {
          aN: "Team Alpha", aP: 98.5, aK: "461.l.1224012.t.1",
          bN: "Team Beta", bP: 87.2, bK: "461.l.1224012.t.2"
        },
        {
          aN: "Team Gamma", aP: 105.3, aK: "461.l.1224012.t.3", 
          bN: "Team Delta", bP: 92.8, bK: "461.l.1224012.t.4"
        }
      ];
      
      const mockTeams = [
        { name: "Team Alpha", wins: 3, losses: 1, points: 415.2 },
        { name: "Team Beta", wins: 3, losses: 1, points: 398.7 },
        { name: "Team Gamma", wins: 2, losses: 2, points: 387.5 },
        { name: "Team Delta", wins: 1, losses: 3, points: 356.8 }
      ];
      
      setMatchups(mockMatchups);
      setTeams(mockTeams);
      
      console.log('[DashboardContent] Mock data loaded successfully');

    } catch (e) {
      console.error('Failed to load league data:', e);
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
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card title="Scoreboard">
          {matchups.length > 0 ? (
            <div className="space-y-3">
              {matchups.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-900 rounded border border-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <div className="font-medium">{m.aN}</div>
                      <div className="text-gray-400 text-xs">{m.aP} pts</div>
                    </div>
                    <div className="text-gray-500">vs</div>
                    <div className="text-sm">
                      <div className="font-medium">{m.bN}</div>
                      <div className="text-gray-400 text-xs">{m.bP} pts</div>
                    </div>
                  </div>
                  {m.aK && m.bK && (
                    <AnalyzeMatchup 
                      aKey={m.aK} 
                      bKey={m.bK} 
                      aName={m.aN} 
                      bName={m.bN}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">No matchups available for this week.</div>
          )}
        </Card>

        <Card title="Latest News">
          <div className="text-sm">• No commissioner updates available.</div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Standings">
          {teams.length > 0 ? (
            <div className="space-y-2">
              {teams.slice(0, 8).map((team, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="truncate">{team.name}</span>
                  <span className="text-gray-400 text-xs">{team.wins}-{team.losses}</span>
                </div>
              ))}
            </div>
          ) : "—"}
        </Card>

        <Card title="At a Glance">
          <ul className="text-sm space-y-1 text-gray-300">
            <li>Season: {new Date().getFullYear()}</li>
            <li>Scoring: Standard</li>
            <li>Trade deadline: —</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
