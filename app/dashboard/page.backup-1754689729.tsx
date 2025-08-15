export const dynamic = "force-dynamic";
import Card from "@/components/Card";
import { readTokens } from "@/lib/tokenStore";
import { getYahoo } from "@/lib/yahoo";

const fmt = (n: any) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : "0.0");

export default async function Dashboard() {
  const { access_token } = readTokens();
  if (!access_token) return <Card title="Dashboard">Connect Yahoo first.</Card>;
  const yf: any = getYahoo(access_token);

  const gm = await yf.game.meta("nfl");
  const gameKey = Array.isArray(gm) ? gm[0]?.game_key : gm?.game_key;
  const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

  const meta = await yf.league.meta(leagueKey).catch(() => ({}));
  const week = Number(meta?.current_week || 1);

  const s = await yf.league.standings(leagueKey).catch(() => null);
  const teams =
    (Array.isArray(s?.standings) ? s.standings : null) ??
    s?.standings?.teams ?? s?.league?.standings?.teams ?? [];
  const standings = (teams || [])
    .map((t: any) => {
      const st = t.standings || t.team_standings || {};
      const ot = st.outcome_totals || t.outcome_totals || {};
      return {
        name: t.name,
        owner: t.managers?.[0]?.nickname || "Owner",
        w: +(ot.wins || 0),
        l: +(ot.losses || 0),
        pf: +(st.points_for || 0),
      };
    })
    .sort((a: any, b: any) => b.w - a.w || b.pf - a.pf);

  const sb = await yf.league.scoreboard(leagueKey, week).catch(() => ({}));
  const matchups = (sb?.matchups ?? sb?.scoreboard?.matchups ?? sb?.[0]?.matchups ?? []).map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    return {
      aName: a?.name || a?.team_name,
      aPts: Number(a?.points ?? a?.team_points?.total ?? 0),
      bName: b?.name || b?.team_name,
      bPts: Number(b?.points ?? b?.team_points?.total ?? 0),
    };
  });

  const tx = await yf.league.transactions(leagueKey).catch(() => ({}));
  const txs = (tx?.transactions ?? tx?.league?.transactions ?? []);
  const latest = txs[0]
    ? {
        when: new Date((+(txs[0].timestamp || txs[0].time || 0)) * 1000).toLocaleDateString(),
        title: `${txs[0].type} (${txs[0].status})`,
        note:
          (txs[0].players || [])
            .map((p: any) => `${p?.name?.full || p?.name} — ${p?.source_team_name || "?"} → ${p?.destination_team_name || "?"}`)
            .join("; ") || "No player details.",
      }
    : null;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* LEFT: All Matchups + Latest News */}
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
          {latest ? (
            <div className="border rounded-xl p-4">
              <div className="text-sm font-medium mb-2">{latest.when}</div>
              <div className="font-semibold">{latest.title}</div>
              <div className="opacity-80 text-sm mt-1">{latest.note}</div>
            </div>
          ) : (
            <div className="text-sm opacity-70">No recent activity.</div>
          )}
        </Card>
      </div>

      {/* RIGHT: FULL Standings (no PA) + At a Glance */}
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
