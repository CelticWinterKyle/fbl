import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";
import { cookies } from 'next/headers';

export default async function LiveRosters() {
  // Get user context and selected league
  const cookieStore = cookies();
  const userCookie = cookieStore.get('fbl_uid');
  const userId = userCookie?.value || '';
  const userLeague = userId ? readUserLeague(userId) : null;

  if (!userId || !userLeague) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6 text-center text-gray-400">
        <p>Connect to Yahoo and select a league to view rosters</p>
      </div>
    );
  }

  // Get Yahoo authentication
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6 text-center text-gray-400">
        <p>Yahoo authentication required: {reason}</p>
      </div>
    );
  }

  // Fetch live roster data
  let teams: any[] = [];
  try {
    // Get teams and their rosters
    const teamsData = await yf.league.teams(userLeague).catch(() => null);
    const teamsList = teamsData?.teams ?? teamsData?.league?.teams ?? [];
    
    if (Array.isArray(teamsList) && teamsList.length > 0) {
      // Fetch roster for each team using our more reliable API route
      const rosterPromises = teamsList.map(async (team: any) => {
        const teamKey = team.team_key || team.key;
        if (!teamKey) return null;
        
        try {
          // Use internal API route for more reliable roster fetching
          const rosterResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/roster/${teamKey}`, {
            headers: {
              'Cookie': `fbl_uid=${userId}`,
            },
          });
          
          if (!rosterResponse.ok) {
            throw new Error(`HTTP ${rosterResponse.status}`);
          }
          
          const rosterData = await rosterResponse.json();
          const players = rosterData.roster || rosterData.players || [];
          
          return {
            teamKey,
            name: team.name || team.team_name,
            owner: team.managers?.[0]?.nickname || team.managers?.[0]?.manager?.nickname || "Owner",
            roster: Array.isArray(players) ? players.map((p: any) => ({
              name: p.name || "Unknown Player",
              position: p.position || "—",
              team: p.team || "—",
              points: Number(p.points || 0),
              isStarter: p.position !== "BN" && p.position !== "IR"
            })) : []
          };
        } catch (error) {
          console.error(`Failed to fetch roster for team ${teamKey}:`, error);
          return {
            teamKey,
            name: team.name || team.team_name,
            owner: team.managers?.[0]?.nickname || "Owner",
            roster: []
          };
        }
      });
      
      const rosters = await Promise.all(rosterPromises);
      teams = rosters.filter(Boolean);
    }
  } catch (error) {
    console.error('Failed to fetch roster data:', error);
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6 text-center text-gray-400">
        <p>Error loading roster data</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6 text-center text-gray-400">
        <p>No roster data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">League Rosters</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team: any) => (
          <div key={team.teamKey} className="bg-gray-950 border border-gray-800 rounded-lg p-4">
            <div className="font-bold text-lg mb-3">
              {team.name}
              <span className="block text-xs text-gray-400 font-normal">({team.owner})</span>
            </div>
            
            {/* Starters */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-green-400 mb-2">Starters</h4>
              <div className="space-y-1">
                {team.roster.filter((p: any) => p.isStarter).map((p: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="text-gray-400 ml-2">{p.position}</span>
                    <span className="text-blue-400 ml-2">{p.points}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Bench */}
            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Bench</h4>
              <div className="space-y-1">
                {team.roster.filter((p: any) => !p.isStarter).slice(0, 5).map((p: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-xs text-gray-500">
                    <span className="truncate">{p.name}</span>
                    <span className="ml-2">{p.position}</span>
                  </div>
                ))}
                {team.roster.filter((p: any) => !p.isStarter).length > 5 && (
                  <div className="text-xs text-gray-600">
                    +{team.roster.filter((p: any) => !p.isStarter).length - 5} more
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
