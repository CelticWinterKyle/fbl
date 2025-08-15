import type { NextApiRequest, NextApiResponse } from "next";
import { getYahooAuthed } from "@/lib/yahoo";
import { promises as fs } from "fs";
import path from "path";

function n(x:any){ const v=Number(x); return Number.isFinite(v)?v:0; }
function teamKeyOf(t:any){ return t?.team_key || t?.team?.team_key || t?.team?.key || t?.key; }
function teamNameOf(t:any){ return t?.name || t?.team_name || t?.team?.name || "Team"; }

async function readChampions() {
  try {
    const p = path.join(process.cwd(), "data", "champions.json");
    const raw = await fs.readFile(p, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.sort((a,b)=>b.season-a.season) : [];
  } catch { return []; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok:false, error:"method_not_allowed" });
  try {
    const { yf } = await getYahooAuthed();
    if (!yf) return res.status(401).json({ ok:false, error:"not_authed" });

    const gameKey = process.env.YAHOO_GAME_KEY || "461";
    const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

    const [metaRaw, standingsRaw, sbNow, champs] = await Promise.all([
      yf.league.meta(leagueKey).catch(()=>null),
      yf.league.standings(leagueKey).catch(()=>null),
      yf.league.scoreboard(leagueKey).catch(()=>null),
      readChampions(),
    ]);

    const season = metaRaw?.season || standingsRaw?.season || "—";
    const currentWeek = n(sbNow?.week ?? sbNow?.scoreboard?.week ?? metaRaw?.current_week ?? 1);

    const teamsSrc:any[] = (standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? []);
    const teams = teamsSrc.map((t:any)=>({
      name: teamNameOf(t),
      pf: n(t?.standings?.points_for ?? t?.points_for),
      w:  n(t?.standings?.outcome_totals?.wins ?? t?.outcome_totals?.wins),
      l:  n(t?.standings?.outcome_totals?.losses ?? t?.outcome_totals?.losses),
      streakType: t?.standings?.streak_type ?? t?.streak_type ?? "",
      streakLen: n(t?.standings?.streak_length ?? t?.streak_length),
      key: teamKeyOf(t),
    }));

    const pfLeader = teams.slice().sort((a,b)=>b.pf - a.pf)[0] ?? null;
    const recordLeader = teams.slice().sort((a,b)=>{
      if (b.w !== a.w) return b.w - a.w;
      if (a.l !== b.l) return a.l - b.l;
      return b.pf - a.pf;
    })[0] ?? null;

    let weeklyHigh:{ week:number; name:string; points:number }|null = null;
    for (let w=1; w<=currentWeek; w++){
      const sb = await yf.league.scoreboard(leagueKey, { week:w }).catch(()=>null);
      const ms:any[] = sb?.matchups ?? sb?.scoreboard?.matchups ?? [];
      for (const m of ms){
        const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
        const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
        const aPts = n(a?.team_points?.total ?? a?.points?.total);
        const bPts = n(b?.team_points?.total ?? b?.points?.total);
        if (!weeklyHigh || aPts > weeklyHigh.points) weeklyHigh = { week:w, name: teamNameOf(a), points: aPts };
        if (!weeklyHigh || bPts > weeklyHigh.points) weeklyHigh = { week:w, name: teamNameOf(b), points: bPts };
      }
    }

    const streakCandidates = teams.filter(t=>t.streakLen>0);
    const streakLeader = streakCandidates.sort((a,b)=>b.streakLen-a.streakLen)[0] ?? null;

    return res.status(200).json({
      ok:true,
      season,
      currentWeek,
      pfLeader: pfLeader ? { name: pfLeader.name, pf: Number(pfLeader.pf.toFixed(1)) } : null,
      recordLeader: recordLeader ? { name: recordLeader.name, w: recordLeader.w, l: recordLeader.l, pf: Number(recordLeader.pf.toFixed(1)) } : null,
      weeklyHigh: weeklyHigh ? { week: weeklyHigh.week, name: weeklyHigh.name, points: Number(weeklyHigh.points.toFixed(1)) } : null,
      streakLeader: streakLeader ? {
        name: streakLeader.name,
        label: `${String(streakLeader.streakType).toUpperCase()==="WIN" ? "Win" : "Streak"} ${streakLeader.streakLen}`
      } : null,
      pastChampions: champs
    });
  } catch (e:any) {
    return res.status(500).json({ ok:false, error: e?.message || "server_error" });
  }
}
