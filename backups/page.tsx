import Card from "@/components/Card";
import { getYahooAuthed } from "@/lib/yahoo";

function normalizeDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n)) return new Date(n < 1e12 ? n * 1000 : n);
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
const fmt = (x: number) => Number(x || 0).toFixed(1);
const fmtDate = (v: any) => {
  const d = normalizeDate(v);
  return d ? d.toLocaleString() : null;
};
const pick = (...xs: any[]) =>
  xs.find((v) => v !== undefined && v !== null && String(v).trim() !== "");

export default async function DashboardPage() {
  const { yf } = await getYahooAuthed();
  if (!yf) {
    return (
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Scoreboard">Connect Yahoo first.</Card>
          <Card title="Latest News">
            <div className="text-sm">• No commissioner updates available.</div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Standings">—</Card>
          <Card title="At a Glance">
            <ul className="text-sm space-y-1">
              <li>Season: —</li>
              <li>Scoring: —</li>
              <li>Trade deadline: —</li>
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  const gameKey = process.env.YAHOO_GAME_KEY || "461";
  const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

  const [scoreRaw, metaRaw, standingsRaw, settingsRaw, txRaw] = await Promise.all([
    yf.league.scoreboard(leagueKey).catch(() => null),
    yf.league.meta(leagueKey).catch(() => null),
    yf.league.standings(leagueKey).catch(() => null),
    yf.league.settings(leagueKey).catch(() => null),
    yf.league.transactions(leagueKey).catch(() => null),
  ]);

  // Scoreboard (all matchups, 2-column grid)
  const rawMatchups: any[] =
    scoreRaw?.matchups ??
    scoreRaw?.scoreboard?.matchups ??
    scoreRaw?.schedule?.matchups ??
    [];
  const matchups = rawMatchups.map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    const tName = (t: any) => t?.name || t?.team_name || t?.team?.name || "—";
    const tPts  = (t: any) => Number(t?.points ?? t?.team_points?.total ?? 0);
    return { aN: tName(a), aP: tPts(a), bN: tName(b), bP: tPts(b) };
  });

  // Standings with fallback to league.teams
  let teamsSource: any[] =
    (standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? []);
  if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
    const lt = await yf.league.teams(leagueKey).catch(() => null);
    teamsSource = lt?.teams ?? lt?.league?.teams ?? [];
  }
  const teams = teamsSource.map((t: any) => ({
    name: t.name || t.team_name,
    owner:
      t.managers?.[0]?.nickname ||
      t.managers?.[0]?.manager?.nickname ||
      "Owner",
    w: +t?.standings?.outcome_totals?.wins || +t?.outcome_totals?.wins || 0,
    l: +t?.standings?.outcome_totals?.losses || +t?.outcome_totals?.losses || 0,
    pf: +(t?.standings?.points_for ?? t?.points_for ?? 0),
  }));

  // Settings/meta-based commish items
  const st: any =
    (settingsRaw?.settings ?? settingsRaw?.league?.settings ?? settingsRaw) || {};
  const draftRaw = pick(
    st.draft_time,
    st.draft_timestamp,
    st.draft_date,
    st.live_draft_start,
    st.draft?.time,
    st.draft?.date,
    metaRaw?.draft_time,
    metaRaw?.draft_timestamp
  );
  const tradeDLRaw = pick(metaRaw?.trade_end_date, st.trade_end_date, st.trade_deadline);

  const settingsLines: string[] = [];
  const draftTxt = fmtDate(draftRaw);
  if (draftTxt) settingsLines.push(`Draft scheduled: ${draftTxt}`);
  if (tradeDLRaw) settingsLines.push(`Trade deadline: ${fmtDate(tradeDLRaw)}`);

  // Commissioner “posts” from transactions feed (if Yahoo provides text)
  const txArr: any[] = (txRaw?.transactions ?? txRaw ?? []);
  const txLines = txArr
    .filter((t: any) => {
      const typ = (t.type || t.transaction || t.transaction_type || "").toString().toLowerCase();
      const sub = (t.subtype || "").toString().toLowerCase();
      return typ.includes("commish") || sub.includes("commish") || typ === "commissioner";
    })
    .map((t: any) =>
      pick(
        t.note,
        t.message,
        t.comments,
        t.title,
        t.description,
        t.commish_notes,
        t.commish_note
      )
    )
    .filter(Boolean)
    .map((s: string) => s.trim());

  // Merge, de-dupe
  const commishLines = Array.from(new Set([...txLines, ...settingsLines]));
  if (!commishLines.length) commishLines.push("No commissioner updates available.");

  const season = metaRaw?.season ?? standingsRaw?.season ?? "—";
  const scoring = metaRaw?.scoring_type ?? "—";

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Scoreboard">
          {matchups.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchups.map((m, i) => (
                <div key={i} className="border rounded-md p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">{m.aN}</div>
                      <div className="text-2xl font-semibold">{fmt(m.aP)}</div>
                    </div>
                    <div className="opacity-60">vs</div>
                    <div className="text-right">
                      <div className="text-sm">{m.bN}</div>
                      <div className="text-2xl font-semibold">{fmt(m.bP)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm">No matchups yet.</div>
          )}
        </Card>

        <Card title="Latest News">
          <div className="text-sm space-y-1">
            <div className="font-medium">Commish Updates</div>
            <ul className="list-disc ml-5 space-y-1">
              {commishLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Standings">
          {teams.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Team</th>
                  <th>Owner</th>
                  <th>W</th>
                  <th>L</th>
                  <th>PF</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((r: any, i: number) => (
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
          ) : (
            "—"
          )}
        </Card>

        <Card title="At a Glance">
          <ul className="text-sm space-y-1">
            <li>Season: {season}</li>
            <li>Scoring: {scoring}</li>
            <li>Trade deadline: {fmtDate(tradeDLRaw) ?? "—"}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
