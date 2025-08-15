export const dynamic = "force-dynamic";

import Card from "@/components/Card";
import { readTokens } from "@/lib/tokenStore";
import { getYahoo } from "@/lib/yahoo";

export default async function StandingsPage() {
  const { access_token } = readTokens();
  if (!access_token) return <Card title="League Standings">Connect Yahoo first (nav → Connect Yahoo).</Card>;

  const yf: any = getYahoo(access_token);

  // Build league_key from this season's NFL game + your league id
  const gm = await yf.game.meta("nfl");
  const gameKey = Array.isArray(gm) ? gm[0]?.game_key : gm?.game_key;
  const leagueId = process.env.YAHOO_LEAGUE_ID;
  const leagueKey = `${gameKey}.l.${leagueId}`;

  let s: any;
  try {
    s = await yf.league.standings(leagueKey);
  } catch (e: any) {
    return <Card title="League Standings">Yahoo error: {String(e?.message ?? e)}</Card>;
  }

  // Handle all known shapes (yours is: s.standings = [teams...])
  const teams =
    (Array.isArray(s?.standings) ? s.standings : null) ??
    s?.standings?.teams ??
    s?.league?.standings?.teams ??
    s?.league?.[0]?.standings?.[0]?.teams;

  if (!teams) {
    return (
      <Card title="League Standings">
        No standings data yet. Double-check league for season {gameKey}.<br />
        <small>Debug keys: {Object.keys(s || {}).join(", ")}</small>
      </Card>
    );
  }

  const rows = teams.map((t: any) => {
    const st = t.standings || t.team_standings || {};
    const ot = st.outcome_totals || t.outcome_totals || {};
    return {
      name: t.name || t.team_name,
      owner: t.managers?.[0]?.nickname || "Owner",
      w: Number(ot.wins ?? 0),
      l: Number(ot.losses ?? 0),
      pf: Number(st.points_for ?? t.points_for ?? 0),
      pa: Number(st.points_against ?? t.points_against ?? 0),
    };
  }).sort((a: any, b: any) => b.w - a.w || b.pf - a.pf);

  return (
    <Card title="League Standings">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th><th>PA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2">{r.name}</td>
              <td>{r.owner}</td>
              <td>{r.w}</td>
              <td>{r.l}</td>
              <td>{r.pf.toFixed(1)}</td>
              <td>{r.pa.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
