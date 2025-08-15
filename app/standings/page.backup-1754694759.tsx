import { getYahooAuthed } from "@/lib/yahoo";

function fmt(n:any){ const x = Number(n||0); return x.toFixed(1); }

export default async function StandingsPage() {
  const { yf } = await getYahooAuthed();
  if (!yf) {
    return (
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">League Standings</h2>
        Connect Yahoo first (nav → Connect Yahoo).
      </div>
    );
  }

  const gameKey = process.env.YAHOO_GAME_KEY || "461";
  const leagueId = process.env.YAHOO_LEAGUE_ID!;
  const leagueKey = `${gameKey}.l.${leagueId}`;

  try {
    const s:any = await yf.league.standings(leagueKey);
    const rows = (s?.standings?.teams || []).map((t:any)=>({
      name: t?.name,
      owner: t?.managers?.[0]?.nickname || "Owner",
      w: Number(t?.standings?.outcome_totals?.wins || 0),
      l: Number(t?.standings?.outcome_totals?.losses || 0),
      pf: Number(t?.standings?.points_for || 0),
    }));

    return (
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">League Standings</h2>
        {rows.length===0 ? <div>No standings yet.</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r:any,i:number)=>(
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{r.name}</td>
                  <td>{r.owner}</td>
                  <td>{r.w}</td>
                  <td>{r.l}</td>
                  <td>{fmt(r.pf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  } catch (err:any) {
    return (
      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">League Standings</h2>
        Yahoo error: {err?.message || JSON.stringify(err)}
      </div>
    );
  }
}
