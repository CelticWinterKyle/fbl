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

  const sb = await yf.league.scoreboard(leagueKey, week).catch(() => ({}));
  const matchups = (sb?.matchups ?? sb?.scoreboard?.matchups ?? sb?.[0]?.matchups ?? []).map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    return { aName: a?.name || a?.team_name, aPts: Number(a?.points ?? a?.team_points?.total ?? 0), bName: b?.name || b?.team_name, bPts: Number(b?.points ?? b?.team_points?.total ?? 0) };
  });

  const tx = await yf.league.transactions(leagueKey).catch(() => ({}));
  const txs = (tx?.transactions ?? tx?.league?.transactions ?? []) as any[];

  const relTime = (ts:number) => {
    const diff = Date.now() - ts * 1000;
    const m = Math.round(diff/60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m/60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h/24)}d ago`;
  };

  const fmtPlayer = (p:any) => {
    const n = p?.name?.full || p?.name;
    const pos = p?.display_position || p?.primary_position || "";
    const nfl = p?.editorial_team_abbr || p?.editorial_team_key?.split(".").pop() || "";
    return [n, pos && `(${pos}${nfl ? `, ${nfl}` : ""})`].filter(Boolean).join(" ");
  };

  const formatMaybeEpoch = (x:any) => {
    const n = Number(x);
    if (!Number.isFinite(n)) return String(x);
    if (n > 1e12) return new Date(n).toLocaleString();
    if (n > 1e9) return new Date(n * 1000).toLocaleString();
    return String(x);
  };

  const commishDetail = (t:any) => {
    const note = (t.note || t.comments || t.message || t.title || t.description || "").toString().trim();
    if (note) return note;

    const raw = Array.isArray(t.players) ? t.players : [];
    const players = raw.map((x:any)=> x?.player ? x.player : x);
    const bitsFromPlayers = players.map((p:any) => {
      const pd = p?.transaction_data || p?.player_transaction_data || {};
      const move = (pd.type || pd.sub_type || "").replace(/_/g, " ").trim();
      const name = fmtPlayer(p);
      const src = p?.source_team_name || pd?.source_team_name || "";
      const dst = p?.destination_team_name || pd?.destination_team_name || "";
      if (src && dst) return `${name}: moved ${src} → ${dst}`;
      if (move && (src || dst)) return `${move}: ${name}${dst ? ` to ${dst}` : src ? ` from ${src}` : ""}`;
      if (move) return `${move}: ${name}`;
      return name ? `Action on ${name}` : "";
    }).filter(Boolean);

    const keys = Object.keys(t || {});
    const interesting = keys.filter(k => /draft|deadline|trade|waiver|keeper|schedule|roster|setting/i.test(k));
    const fieldPairs:string[] = [];
    for (const k of interesting) {
      const v:any = (t as any)[k];
      if (v == null) continue;
      if (typeof v === "string" && v.trim()) fieldPairs.push(`${k.replace(/_/g," ")}: ${v.trim()}`);
      else if (typeof v === "number") fieldPairs.push(`${k.replace(/_/g," ")}: ${formatMaybeEpoch(v)}`);
      else if (typeof v === "boolean") fieldPairs.push(`${k.replace(/_/g," ")}: ${v ? "on" : "off"}`);
      else if (typeof v === "object") {
        const vv = (v.new ?? v.to ?? v.value ?? v.updated ?? v.time ?? v.date ?? "");
        if (vv !== "") fieldPairs.push(`${k.replace(/_/g," ")}: ${formatMaybeEpoch(vv)}`);
      }
    }

    if (fieldPairs.length) return fieldPairs.join("; ");
    if (bitsFromPlayers.length) return bitsFromPlayers.join("; ");
    return "Commissioner action.";
  };

  const newsItems = txs
    .filter((t:any) => ["trade", "commish"].includes((t.type || "").toLowerCase()))
    .slice(0, 3)
    .map((t:any) => {
      const when = Number(t.timestamp || t.time || 0);
      const type = (t.type || "").toLowerCase();
      const rawPlayers = (t.players || []) as any[];
      const players = rawPlayers.map((x:any)=> x?.player ? x.player : x);
      let detail = "";
      if (type === "trade") {
        const byTeam: Record<string,string[]> = {};
        players.forEach((p:any) => {
          const from = p?.source_team_name || "Team";
          (byTeam[from] ||= []).push(fmtPlayer(p));
        });
        const sides = Object.entries(byTeam).map(([team, arr]) => `${team}: ${arr.join(", ")}`);
        detail = sides.join("  ⇄  ");
      } else {
        detail = commishDetail(t);
      }
      return { id: t.transaction_key || when, title: type === "trade" ? "Trade" : "Commissioner", when, rel: when ? relTime(when) : "", detail };
    });

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
          {newsItems.length ? (
            <ul className="space-y-3">
              {newsItems.map((n:any) => (
                <li key={n.id} className="border rounded-xl p-4">
                  <div className="text-sm font-medium" title={n.when ? new Date(n.when*1000).toLocaleString() : ""}>
                    {n.rel || (n.when ? new Date(n.when*1000).toLocaleDateString() : "")}
                  </div>
                  <div className="font-semibold mt-1">{n.title}</div>
                  <div className="opacity-80 text-sm mt-1">{n.detail}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm opacity-70">No league news yet.</div>
          )}
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
