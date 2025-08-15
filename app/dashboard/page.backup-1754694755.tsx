import { getYahooAuthed } from "@/lib/yahoo";

function fmt(n:any){ const x=Number(n||0); return x.toFixed(1); }

export default async function Dashboard() {
  const { yf } = await getYahooAuthed();
  if (!yf) {
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-4 border rounded"><h2 className="font-semibold mb-2">Scoreboard</h2>
          Connect Yahoo first (nav → Connect Yahoo).
        </div>
        <div className="p-4 border rounded"><h2 className="font-semibold mb-2">Standings</h2>—</div>
      </div>
    );
  }

  const gameKey = process.env.YAHOO_GAME_KEY || "461";
  const leagueId = process.env.YAHOO_LEAGUE_ID!;
  const leagueKey = `${gameKey}.l.${leagueId}`;

  let meta:any = null, standingsRows:any[] = [], matchups:any[] = [];
  try {
    meta = await yf.league.meta(leagueKey);
  } catch {}

  try {
    const s:any = await yf.league.standings(leagueKey);
    standingsRows = (s?.standings?.teams || []).slice(0,4).map((t:any)=>({
      name: t?.name,
      owner: t?.managers?.[0]?.nickname || "Owner",
      w: Number(t?.standings?.outcome_totals?.wins || 0),
      l: Number(t?.standings?.outcome_totals?.losses || 0),
      pf: Number(t?.standings?.points_for || 0),
    }));
  } catch {}

  // Matchups (may be empty pre-draft)
  try {
    const sc:any = await yf.league.scoreboard(leagueKey);
    const week = sc?.scoreboard?.week;
    const games = sc?.scoreboard?.matchups || sc?.scoreboard?.matchup || [];
    matchups = (Array.isArray(games)?games:[games]).slice(0,2);
  } catch {}

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Scoreboard</h2>
          {matchups.length===0 ? <div>No matchups yet.</div> : matchups.map((m:any,i:number)=>{
            const teams = m?.teams || m?.matchup || m;
            const a = teams?.[0] ?? teams?.team1 ?? teams?.home;
            const b = teams?.[1] ?? teams?.team2 ?? teams?.away;
            const an = a?.name || a?.team_name || "Team A";
            const bn = b?.name || b?.team_name || "Team B";
            const ap = Number(a?.points ?? a?.team_points?.total ?? 0);
            const bp = Number(b?.points ?? b?.team_points?.total ?? 0);
            return (
              <div key={i} className="flex items-center gap-3 py-1">
                <div className="flex-1">{an}</div><div>{fmt(ap)}</div>
                <div className="opacity-60">vs</div>
                <div className="flex-1">{bn}</div><div>{fmt(bp)}</div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Latest News</h2>
          <div><strong>Commish Updates</strong></div>
          <ul className="list-disc pl-5">
            <li>No commissioner updates available.</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Standings</h2>
          {standingsRows.length===0 ? <div>—</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th>
              </tr></thead>
              <tbody>
                {standingsRows.map((r:any,i:number)=>(
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

        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">At a Glance</h2>
          <ul className="text-sm space-y-1">
            <li>Season: {meta?.season ?? "—"}</li>
            <li>Scoring: {meta?.scoring_type ?? "—"}</li>
            <li>Trade deadline: {meta?.trade_end_date ?? "—"}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
