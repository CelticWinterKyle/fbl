export const dynamic = "force-dynamic";
import Card from "@/components/Card";
import { readTokens } from "@/lib/tokenStore";
import { getYahoo } from "@/lib/yahoo";

const fmt = (n: any) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0");
const relTime = (ts:number) => {
  const diff = Date.now() - ts * 1000;
  const m = Math.round(diff/60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h/24)}d ago`;
};
const fmtDate = (x:any) => {
  const n = Number(x);
  if (Number.isFinite(n)) {
    const ms = n > 1e12 ? n : (n > 1e9 ? n*1000 : n);
    return new Date(ms).toLocaleString();
  }
  return x ? String(x) : "";
};
const fmtPlayer = (p:any) => {
  const n = p?.name?.full || p?.name;
  const pos = p?.display_position || p?.primary_position || "";
  const nfl = p?.editorial_team_abbr || p?.editorial_team_key?.split(".").pop() || "";
  return [n, pos && `(${pos}${nfl ? `, ${nfl}` : ""})`].filter(Boolean).join(" ");
};

export default async function Dashboard() {
  const { access_token } = readTokens();
  if (!access_token) return <Card title="Dashboard">Connect Yahoo first.</Card>;
  const yf: any = getYahoo(access_token);

  // league key
  const gm = await yf.game.meta("nfl");
  const gameKey = Array.isArray(gm) ? gm[0]?.game_key : gm?.game_key;
  const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

  // meta + settings
  const meta = await yf.league.meta(leagueKey).catch(() => ({}));
  const week = Number(meta?.current_week || 1);
  const settings = await yf.league.settings(leagueKey).catch(() => (null));

  // standings (no PA)
  const s = await yf.league.standings(leagueKey).catch(() => null);
  const teams =
    (Array.isArray((s as any)?.standings) ? (s as any).standings : null) ??
    (s as any)?.standings?.teams ??
    (s as any)?.league?.standings?.teams ??
    [];
  const standings = (teams || [])
    .map((t: any) => {
      const st = t.standings || t.team_standings || {};
      const ot = st.outcome_totals || t.outcome_totals || {};
      return { name: t.name, owner: t.managers?.[0]?.nickname || "Owner", w: +(ot.wins || 0), l: +(ot.losses || 0), pf: +(st.points_for || 0) };
    })
    .sort((a: any, b: any) => b.w - a.w || b.pf - a.pf);

  // scoreboard (2-col grid)
  const sb = await yf.league.scoreboard(leagueKey, week).catch(() => ({}));
  const matchups = (sb?.matchups ?? sb?.scoreboard?.matchups ?? sb?.[0]?.matchups ?? []).map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    return { aName: a?.name || a?.team_name, aPts: Number(a?.points ?? a?.team_points?.total ?? 0), bName: b?.name || b?.team_name, bPts: Number(b?.points ?? b?.team_points?.total ?? 0) };
  });

  // transactions (we'll only show TRADES here)
  const tx = await yf.league.transactions(leagueKey).catch(() => ({}));
  const txs = (tx?.transactions ?? tx?.league?.transactions ?? []) as any[];
  const trades = txs
    .filter((t:any)=> (t.type||"").toLowerCase()==="trade")
    .slice(0,3)
    .map((t:any)=>{
      const when = Number(t.timestamp || t.time || 0);
      const rawPlayers = (t.players || []) as any[];
      const players = rawPlayers.map((x:any)=> x?.player ? x.player : x);
      const byTeam: Record<string,string[]> = {};
      players.forEach((p:any) => {
        const from = p?.source_team_name || "Team";
        (byTeam[from] ||= []).push(fmtPlayer(p));
      });
      const sides = Object.entries(byTeam).map(([team, arr]) => `${team}: ${arr.join(", ")}`).join("  ⇄  ");
      return { id: t.transaction_key || when, when, rel: when ? relTime(when) : "", text: sides || "Trade" };
    });

  // Commish Updates (derived from settings; shows WHAT is set)
  const cuLines:string[] = [];
  const st:any = settings || {};
  const draftTime = st.draft_time || st.draft_timestamp || st.draft_date;
  const draftType = st.draft_type || (st.auction_draft ? "auction" : st.snake_draft ? "snake" : "");
  if (draftTime) cuLines.push(`Draft scheduled: ${fmtDate(draftTime)}${draftType ? ` (${String(draftType).toLowerCase()})` : ""}`);
  const deadline = meta?.trade_end_date || st.trade_end_date || st.trade_deadline;
  if (deadline) cuLines.push(`Trade deadline: ${fmtDate(deadline)}`);
  const waiverType = st.waiver_type || st.waiver_rule;
  if (waiverType) cuLines.push(`Waivers: ${String(waiverType).replace(/_/g," ")}`);
  const rosterLock = st.roster_locked || st.roster_locktime;
  if (rosterLock) cuLines.push(`Roster lock: ${fmtDate(rosterLock)}`);
  if (!cuLines.length) cuLines.push("No commissioner updates available.");

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Scoreboard">
          {matchups.length ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {matchups.map((m: any, i: number) => (
                <div key={i} className="border rounded-xl p-4">
                  <div className="text-sm font-medium mb-2">Week {week} Matchup</div>
                  <div className="grid grid-cols-3 items-center">
                    <div>
                      <div className="font-medium">{m.aName}</div>
                      <div className="text-3xl mt-1">{fmt(m.aPts)}</div>
                    </div>
                    <div className="text-center opacity-60">vs</div>
                    <div className="text-right">
                      <div className="font-medium">{m.bName}</div>
                      <div className="text-3xl mt-1">{fmt(m.bPts)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">No matchups yet.</div>
          )}
        </Card>

        <Card title="Latest News">
          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Commish Updates</div>
            <ul className="text-sm space-y-1">
              {cuLines.map((line, i) => <li key={i}>• {line}</li>)}
            </ul>
          </div>

          {trades.length ? (
            <div className="border rounded-xl p-4 mt-3">
              <div className="font-semibold mb-2">Recent Trades</div>
              <ul className="text-sm space-y-1">
                {trades.map(t => (
                  <li key={t.id} title={t.when ? new Date(t.when*1000).toLocaleString() : ""}>
                    {t.rel ? `${t.rel} — ` : ""}{t.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Standings">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r: any, i: number) => (
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
        </Card>

        <Card title="At a Glance">
          <ul className="text-sm space-y-1">
            <li>Season: {meta?.season ?? "—"}</li>
            <li>Scoring: {meta?.scoring_type ?? "—"}</li>
            <li>Trade deadline: {meta?.trade_end_date ?? "—"}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
