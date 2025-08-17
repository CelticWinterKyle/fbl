export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import Link from "next/link";
import fs from 'fs';
import path from 'path';
import Card from "@/components/Card";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserLeague } from "@/lib/userLeagueStore";
import { RefreshCw, CalendarDays, ChevronRight, Trophy } from "lucide-react";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import LiveRosters from "@/components/LiveRosters";
import LiveActivity from "@/components/LiveActivity";
import { cookies } from 'next/headers';

// --- helpers (unchanged) ---
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
const pick = (...xs: any[]) => xs.find((v) => v !== undefined && v !== null && String(v).trim() !== "");

// --- page ---

export default async function DashboardPage() {
  // Get user context
  const cookieStore = cookies();
  const userCookie = cookieStore.get('fbl_uid');
  const userId = userCookie?.value || '';
  
  // Get user's selected league
  const userLeague = userId ? readUserLeague(userId) : null;
  
  // Auto-generate teams.json and rosters.json if missing
  const teamsPath = path.join(process.cwd(), 'data', 'teams.json');
  const rostersPath = path.join(process.cwd(), 'data', 'rosters.json');
  let teamsGenerated = false;
  let rostersGenerated = false;
  
  // Try to generate teams.json from standings if missing
  if (!fs.existsSync(teamsPath)) {
    // Only attempt live fetch if Yahoo fully configured and user has selected league
    const { yf, reason } = await getYahooAuthedForUser(userId);
    if (yf && userLeague) {
      const standingsRaw = await yf.league.standings(userLeague).catch(() => null);
      let teamsSource = standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];
      if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
        const lt = await yf.league.teams(userLeague).catch(() => null);
        teamsSource = lt?.teams ?? lt?.league?.teams ?? [];
      }
      if (Array.isArray(teamsSource) && teamsSource.length) {
        const teams = teamsSource.map((t: any) => ({
          name: t.name || t.team_name,
          owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner"
        }));
        fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2));
        teamsGenerated = true;
      }
    }
  }
  // Only generate rosters.json if missing
  if (!fs.existsSync(rostersPath)) {
    // Placeholder player pool
    const playerPool = [
      { name: "Patrick Mahomes", position: "QB", team: "KC" },
      { name: "Josh Allen", position: "QB", team: "BUF" },
      { name: "Jalen Hurts", position: "QB", team: "PHI" },
      { name: "Christian McCaffrey", position: "RB", team: "SF" },
      { name: "Austin Ekeler", position: "RB", team: "LAC" },
      { name: "Bijan Robinson", position: "RB", team: "ATL" },
      { name: "Justin Jefferson", position: "WR", team: "MIN" },
      { name: "Tyreek Hill", position: "WR", team: "MIA" },
      { name: "Amon-Ra St. Brown", position: "WR", team: "DET" },
      { name: "Travis Kelce", position: "TE", team: "KC" },
      { name: "Mark Andrews", position: "TE", team: "BAL" },
      { name: "George Kittle", position: "TE", team: "SF" },
      { name: "Eagles D/ST", position: "DST", team: "PHI" },
      { name: "49ers D/ST", position: "DST", team: "SF" },
      { name: "Cowboys D/ST", position: "DST", team: "DAL" }
    ];
    const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));
    let playerIdx = 0;
    const rosters = teams.map((t: any) => ({
      team: t.name,
      owner: t.owner,
      roster: Array.from({ length: 5 }).map(() => {
        const p = playerPool[playerIdx % playerPool.length];
        playerIdx++;
        return { ...p, points: 0 };
      })
    }));
    fs.writeFileSync(rostersPath, JSON.stringify(rosters, null, 2));
    rostersGenerated = true;
  }
  const { yf, reason: yahooReason } = await getYahooAuthedForUser(userId);
  let championsLive: { season: number; team: string; owner: string }[] = [];
  
  // Only fetch champions if user has selected a league
  if (yf && userLeague) {
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    
    // Extract league ID from user's selected league key (e.g., "461.l.87546" -> "87546")
    const leagueId = userLeague.split('.l.')[1];
    
    // Yahoo NFL game keys by year
    const gameKeys: Record<number, string> = {
      2020: "399",
      2021: "406", 
      2022: "414",
      2023: "423",
      2024: "449",
      2025: "461",
    };
    const seasons = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i);
    const results: { season:number; team:string; owner:string }[] = [];
    for (const season of seasons) {
      const gameKey = gameKeys[season];
      if (!gameKey) continue; // skip unknown game key seasons
      const leagueKeySeason = `${gameKey}.l.${leagueId}`;
      try {
        const standings = await yf.league.standings(leagueKeySeason).catch(()=>null);
        const teamsList = standings?.standings?.teams ?? standings?.teams ?? [];
        if (Array.isArray(teamsList) && teamsList.length) {
          const champ = teamsList[0];
            const teamName = champ.name || champ.team_name || "Champion";
            const owner = champ.managers?.[0]?.nickname || champ.managers?.[0]?.manager?.nickname || "Owner";
            results.push({ season, team: teamName, owner });
        }
      } catch { /* suppress */ }
    }
    championsLive = results;
  }
  if (!yf || !userLeague) {
    return (
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Scoreboard">{yahooReason === 'no_token' ? 'Connect Yahoo first.' : 'League not selected yet.'}</Card>
          <Card title="Latest News">
            <div className="text-sm">• No commissioner updates available.</div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Standings">—</Card>
          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li>Season: —</li>
              <li>Scoring: —</li>
              <li>Trade deadline: —</li>
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  // Use the user's selected league
  const leagueKey = userLeague;

  const [scoreRaw, metaRaw, standingsRaw, settingsRaw, txRaw] = await Promise.all([
    yf.league.scoreboard(leagueKey).catch(() => null),
    yf.league.meta(leagueKey).catch(() => null),
    yf.league.standings(leagueKey).catch(() => null),
    yf.league.settings(leagueKey).catch(() => null),
    yf.league.transactions(leagueKey).catch(() => null),
  ]);

  // Scoreboard (+team keys)
  const tKey = (t: any) => t?.team_key || t?.team?.team_key || t?.team?.key || t?.key || null;
  const rawMatchups: any[] =
    scoreRaw?.matchups ?? scoreRaw?.scoreboard?.matchups ?? scoreRaw?.schedule?.matchups ?? [];
  const matchups = rawMatchups.map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    const tName = (t: any) => t?.name || t?.team_name || t?.team?.name || "—";
    const tPts  = (t: any) => Number(t?.points ?? t?.team_points?.total ?? 0);
    return { aN: tName(a), aP: tPts(a), aK: tKey(a), bN: tName(b), bP: tPts(b), bK: tKey(b) };
  });

  // Standings (with fallback)
  let teamsSource: any[] = standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];
  if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
    const lt = await yf.league.teams(leagueKey).catch(() => null);
    teamsSource = lt?.teams ?? lt?.league?.teams ?? [];
  }
  const teams = teamsSource.map((t: any) => ({
    name: t.name || t.team_name,
    owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner",
    w: +t?.standings?.outcome_totals?.wins || +t?.outcome_totals?.wins || 0,
    l: +t?.standings?.outcome_totals?.losses || +t?.outcome_totals?.losses || 0,
    pf: +(t?.standings?.points_for ?? t?.points_for ?? 0),
  }));

  // Commish updates
  const st: any = (settingsRaw?.settings ?? settingsRaw?.league?.settings ?? settingsRaw) || {};
  const draftRaw = pick(
    st.draft_time, st.draft_timestamp, st.draft_date, st.live_draft_start,
    st.draft?.time, st.draft?.date, metaRaw?.draft_time, metaRaw?.draft_timestamp
  );
  const tradeDLRaw = pick(metaRaw?.trade_end_date, st.trade_end_date, st.trade_deadline);

  const settingsLines: string[] = [];
  const draftTxt = fmtDate(draftRaw);
  if (draftTxt) settingsLines.push(`Draft scheduled: ${draftTxt}`);
  if (tradeDLRaw) settingsLines.push(`Trade deadline: ${fmtDate(tradeDLRaw)}`);

  const txArr: any[] = txRaw?.transactions ?? txRaw ?? [];
  const txLines = txArr
    .filter((t: any) => {
      const typ = (t.type || t.transaction || t.transaction_type || "").toString().toLowerCase();
      const sub = (t.subtype || "").toString().toLowerCase();
      return typ.includes("commish") || sub.includes("commish") || typ === "commissioner";
    })
    .map((t: any) => pick(t.note, t.message, t.comments, t.title, t.description, t.commish_notes, t.commish_note))
    .filter(Boolean)
    .map((s: string) => s.trim());

  const commishLines = Array.from(new Set([...txLines, ...settingsLines]));
  if (!commishLines.length) commishLines.push("No commissioner updates available.");

  const season = metaRaw?.season ?? standingsRaw?.season ?? "—";
  const scoring = metaRaw?.scoring_type ?? "—";

  return (
    <div className="space-y-6">
      {/* Toggle to demo dashboard */}
      <div className="flex justify-end mb-2">
        <Link href="/dashboard/demo">
          <button className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded text-sm">Switch to Demo Dashboard</button>
        </Link>
      </div>
      {/* title row */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Family Business League</h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-lg border border-gray-700/70 bg-gray-900 px-3 py-1.5 text-sm hover:bg-gray-800 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Week 1
          </button>
          <form action="" className="inline-block">
            <button className="rounded-lg border border-gray-700/70 bg-gray-900 p-2 hover:bg-gray-800" formAction="">
              <RefreshCw className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Scoreboard"
            action={
              <a className="text-xs text-blue-300 hover:underline flex items-center gap-1" href="#">
                All matchups <ChevronRight className="h-3 w-3" />
              </a>
            }
          >
            {matchups.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchups.map((m, i) => (
                  <div key={i} className="bg-gray-950 rounded-lg p-4 border border-gray-800">
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
                    {m.aK && m.bK ? (
                      <AnalyzeMatchup aKey={m.aK} bKey={m.bK} week={scoreRaw?.week} aName={m.aN} bName={m.bN} />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-300">No matchups yet.</div>
            )}
          </Card>

          <Card title="Latest News" subtitle="Commish Updates">
            <ul className="list-disc ml-5 space-y-1 text-sm">
              {commishLines.map((line, i) => (
                <li key={i} className="text-gray-300">
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Standings">
            {teams.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="py-2">Team</th>
                    <th>Owner</th>
                    <th>W</th>
                    <th>L</th>
                    <th>PF</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-gray-700 last:border-0">
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
            <ul className="text-sm space-y-1 text-gray-300">
              <li>Season: {season}</li>
              <li>Scoring: {scoring}</li>
              <li>Trade deadline: {fmtDate(tradeDLRaw) ?? "—"}</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="League Activity" subtitle="Recent adds, drops, and trades">
          <div className="rounded-lg border border-dashed border-gray-800 bg-gray-950 p-6 text-center text-gray-400">
            No activity yet
          </div>
        </Card>
        <Card title="Trophy Case" subtitle="Champions and records">
          {championsLive.length > 0 ? (
            <ul className="space-y-2">
              {championsLive.map((champ) => (
                <li key={champ.season} className="flex items-center gap-3 text-sm text-gray-300">
                  <Trophy className="h-5 w-5 text-amber-300" />
                  <span className="font-semibold">{champ.season}:</span>
                  <span>{champ.team}</span>
                  <span className="text-xs text-gray-400">({champ.owner})</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 text-sm text-gray-300">
              <Trophy className="h-5 w-5 text-amber-300" />
              <span>No trophies yet</span>
            </div>
          )}
        </Card>
      </div>

      {/* Live Rosters */}
      <div className="mt-8">
        <LiveRosters />
      </div>

      {/* Live Activity */}
      <div className="mt-8">
        <LiveActivity />
      </div>
    </div>
  );
}
