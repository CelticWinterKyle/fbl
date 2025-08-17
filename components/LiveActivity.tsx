import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";
import { cookies } from 'next/headers';

export default async function LiveActivity() {
  // Get user context and selected league
  const cookieStore = cookies();
  const userCookie = cookieStore.get('fbl_uid');
  const userId = userCookie?.value || '';
  const userLeague = userId ? readUserLeague(userId) : null;

  if (!userId || !userLeague) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">League Activity</h2>
        <div className="text-gray-400 text-sm">Connect to Yahoo and select a league to view activity</div>
      </div>
    );
  }

  // Get Yahoo authentication
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">League Activity</h2>
        <div className="text-gray-400 text-sm">Yahoo authentication required: {reason}</div>
      </div>
    );
  }

  // Fetch live transaction data
  let transactions: any[] = [];
  try {
    const txData = await yf.league.transactions(userLeague).catch(() => null);
    const txList = txData?.transactions ?? txData?.league?.transactions ?? [];
    
    if (Array.isArray(txList)) {
      transactions = txList.slice(0, 10).map((tx: any) => {
        const type = tx.type || 'unknown';
        const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000) : new Date();
        
        let description = 'Unknown transaction';
        let playerNames: string[] = [];
        
        // Extract player names from transaction
        if (tx.players) {
          const players = Array.isArray(tx.players) ? tx.players : [tx.players];
          playerNames = players.map((p: any) => 
            p.name || p.player?.name || 'Unknown Player'
          );
        }
        
        // Format transaction description based on type
        switch (type) {
          case 'add':
            description = `Added ${playerNames[0] || 'player'}`;
            break;
          case 'drop':
            description = `Dropped ${playerNames[0] || 'player'}`;
            break;
          case 'add/drop':
            description = `Added ${playerNames[0] || 'player'}, dropped ${playerNames[1] || 'player'}`;
            break;
          case 'trade':
            description = `Trade involving ${playerNames.length} players`;
            break;
          default:
            description = `${type} transaction`;
        }
        
        return {
          id: tx.transaction_id || Math.random(),
          type,
          description,
          timestamp,
          teamName: tx.team?.name || tx.team?.team_name || 'Unknown Team',
          playerNames
        };
      });
    }
  } catch (error) {
    console.error('Failed to fetch transaction data:', error);
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">League Activity</h2>
      
      {transactions.length === 0 ? (
        <div className="text-gray-400 text-sm">No recent activity</div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {transactions.map((tx: any) => (
            <div key={tx.id} className="bg-gray-900 rounded p-3 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-blue-300">{tx.teamName}</span>
                  <div className="text-gray-300 mt-1">{tx.description}</div>
                  {tx.playerNames.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Players: {tx.playerNames.join(', ')}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-500 ml-4 flex-shrink-0">
                  {tx.timestamp.toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-4 pt-3 border-t border-gray-800">
        <a 
          href="/trades" 
          className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
        >
          View all trades →
        </a>
      </div>
    </div>
  );
}
