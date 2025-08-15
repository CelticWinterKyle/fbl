"use server";
import Card from "@/components/Card";
import { getYahooAuthed } from "@/lib/yahoo";

function fmt1(x:number){ return Number(x||0).toFixed(1) }
function fmtDate(v:any){
  const n = typeof v === "number" ? v*1000 :
            /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? Date.parse(v) : Number(v);
  if (!n || isNaN(n)) return String(v ?? "—");
  return new Date(n).toLocaleString();
}

export default async function Dashboard() {
  const { yf } = await getYahooAuthed();
  if (!yf) return <Card title="Dashboard">Connect Yahoo first.</Card>;

  const gameKey = process.env.YAHOO_GAME_KEY || "461";
  const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

  // Fetch everything in parallel, be lenient with response shapes
  const [rawStandings, rawBoard, rawSettings] = await Promise.all([
    yf.league.standings(leagueKey).catch(()=>null),
    yf.league.scoreboard(leagueKey).catch(()=>null),
    yf.league.settings(leagueKey).catch(()=>null),
  ]);

  const s:any = rawStandings?.standings ?? rawStandings ?? {};
  const teams = (s.teams ?? s?.league?.standings?.teams ?? s?.league?.teams ?? s ?? [])
    .map((t:any)=>({
      name: t.name || t.team_name,
      owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner",
      w: +(t?.standings?.outcome_totals?.wins ?? t?.outcome_totals?.wins ?? 0),
      l: +(t?.standings?.outcome_totals?.losses ?? t?.outcome_totals?.losses ?? 0),
      pf: +(t?.standings?.points_for ?? t?.points_for ?? 0),
    }))
    .slice(0,4);

  const sb:any = rawBoard?.scoreboard ?? rawBoard ?? {};
  const matchups:any[] = (sb.matchups ?? sb?.matchup ?? sb ?? [])
    .map((m:any)=>{
      const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
      const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
      return {
        aName: a?.name || a?.team_name, aPts: Number(a?.points ?? a?.team_points?.total ?? 0),
        bName: b?.name || b?.team_name, bPts: Number(b?.points ?? b?.team_points?.total ?? 0),
      };
    })
    .slice(0,4); // show first four; grid below is 2 columns

  const settings:any = rawSettings?.settings ?? rawSettings?.league?.settings ?? rawSettings ?? {};
  const cuLines:string[] = [];
  const draftTime = settings?.draft_time ?? settings?.draft_timestamp ?? settings?.draft_date ?? settings?.draft?.time ?? settings?.draft?.date;
  if (draftTime) cuLines.push(`Draft scheduled: ${fmtDate(draftTime)}`);
  const tradeDL = settings?.trade_end_date ?? settings?.trade_deadline;
  if (tradeDL) cuLines.push(`Trade deadline: ${fmtDate(tradeDL)}`);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Scoreboard">
          {matchups.length === 0 ? (
            <div className="text-sm opacity-70">No matchups yet.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {matchups.map((m, i)=>(
                <div key={i} className="border rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{m.aName}</div>
                    <div className="text-2xl">{fmt1(m.aPts)}</div>
                  </div>
                  <div className="px-2 opacity-60">vs</div>
                  <div className="flex-1 text-right">
                    <div className="font-medium">{m.bName}</div>
                    <div className="text-2xl">{fmt1(m.bPts)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Latest News">
          <div className="space-y-1">
            <div className="font-medium">Commish Updates</div>
            {cuLines.length ? (
              <ul className="list-disc pl-5">
                {cuLines.map((x,i)=>(<li key={i}>{x}</li>))}
              </ul>
            ) : (
              <div className="text-sm opacity-70">No commissioner updates available.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Standings">
          {teams.length === 0 ? (
            <div className="text-sm opacity-70">—</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t:any,i:number)=>(
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{t.name}</td>
                    <td>{t.owner}</td>
                    <td>{t.w}</td>
                    <td>{t.l}</td>
                    <td>{fmt1(t.pf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="At a Glance">
          <ul className="text-sm space-y-1">
            <li>Season: {settings?.season ?? "—"}</li>
            <li>Scoring: {settings?.scoring_type ?? "—"}</li>
            <li>Trade deadline: {tradeDL ? fmtDate(tradeDL) : "—"}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
