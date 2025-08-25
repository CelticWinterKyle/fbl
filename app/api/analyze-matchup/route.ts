import { NextRequest, NextResponse } from "next/server";
import { getYahooAuthedForUser, getYahoo } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";
import { chatCompletion } from "@/lib/openai";
import { getWeatherForTeams, summarizeWeather, summarizeWeatherBrief } from "@/lib/weather";
import { generateWeatherOpportunities } from "@/lib/weatherOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TeamSide = "A" | "B";

function teamKeyOf(t: any) {
  return t?.team_key || t?.team?.team_key || t?.team?.key || t?.key || null;
}
function teamNameOf(t: any) {
  return t?.name || t?.team_name || t?.team?.name || "Team";
}
function num(n:any){ const x = Number(n); return Number.isFinite(x) ? x : 0; }
function logistic(delta:number, scale=12){
  const p = 1/(1+Math.exp(-delta/scale));
  return Math.round(p*100);
}

async function getScoreboard(yf:any, leagueKey:string, week?:number){
  try {
    // @ts-ignore yahoo-fantasy supports optional week arg
    return await yf.league.scoreboard(leagueKey, week ? { week } : undefined);
  } catch { return null; }
}
async function getTeamRoster(yf:any, teamKey:string, week?:number){
  try {
    return await yf.team.roster(teamKey, week ? { week } : undefined);
  } catch { return null; }
}

/* ------------ QB helpers ------------ */
function normalizeRosterArray(raw:any){
  return (raw?.roster || raw?.players || raw?.team?.roster?.players || raw?.team?.players || []);
}
function selectedSlot(p:any){
  // Yahoo shapes vary: try selected_position, selected_position.position, etc.
  return (
    p?.selected_position?.position ||
    p?.selected_position ||
    p?.player?.selected_position?.position ||
    p?.position ||
    ""
  );
}
function teamAbbrOfPlayer(p:any){
  const ab = p?.player?.editorial_team_abbr || p?.player?.editorial_team || p?.player?.team_abbr;
  if (ab) return String(ab).toUpperCase();
  const key:string|undefined = p?.player?.editorial_team_key || p?.player?.team_key;
  if (key && typeof key === 'string' && key.includes(".t.")) {
    const parts = key.split(".t.");
    const tail = parts[1];
    if (tail) return tail.toUpperCase();
  }
  return "";
}
function primaryPos(p:any){
  return (
    p?.player?.primary_position ||
    p?.primary_position ||
    p?.player?.position_type ||
    ""
  );
}
function nameOf(p:any){
  return (
    p?.player?.name_full ||
    p?.player?.name?.full ||
    p?.name_full ||
    p?.name?.full ||
    p?.name ||
    "—"
  );
}
function projFromPlayer(p:any){
  // Prefer projection; fallback to recent/actual if needed.
  const proj =
    num(p?.player_projected_points?.total) ||
    num(p?.projected_points?.total) ||
    num(p?.player_points?.total) || // fallback: actual
    0;
  return proj;
}
function pickStarterQB(rosterRaw:any){
  const roster = normalizeRosterArray(rosterRaw);
  // filter to starters (not bench) that are QB by slot or primary position
  const starters = roster.filter((p:any)=>{
    const slot = String(selectedSlot(p)).toUpperCase();
    const pos  = String(primaryPos(p)).toUpperCase();
    return slot && slot !== "BN" && (slot === "QB" || pos === "QB");
  });
  // pick the best projected among QBs; otherwise try any QB on roster
  let pool = starters.length ? starters : roster.filter((p:any)=>{
    const slot = String(selectedSlot(p)).toUpperCase();
    const pos  = String(primaryPos(p)).toUpperCase();
    return (slot === "QB" || pos === "QB");
  });
  if (!pool.length) return null;
  pool = pool.map((p:any)=>({ p, proj: projFromPlayer(p) }))
             .sort((a: {p:any; proj:number}, b: {p:any; proj:number}) => b.proj - a.proj);
  const best = pool[0];
  return { name: nameOf(best.p), proj: Number(best.proj.toFixed(1)) };
}
/* ----------------------------------- */

function simplifyRosterInjuries(raw:any, side:TeamSide){
  const arr = normalizeRosterArray(raw);
  let q=0,o=0,ir=0;
  for(const it of arr){
    const s = String(it?.player?.status || it?.status || "").toUpperCase();
    if (s==="Q" || s==="QUESTIONABLE") q++;
    else if (s==="O" || s==="OUT") o++;
    else if (s==="IR") ir++;
  }
  const pills:any[] = [];
  if (q) pills.push({ team: side, q });
  if (o) pills.push({ team: side, o });
  if (ir) pills.push({ team: side, ir });
  return pills;
}

function avg(arr:number[]){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

export async function POST(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'no_user_id' }, { status: 400 });
    }

    const body = await req.json();
    const { aKey, bKey, week, league_key } = body;
    
    if (!aKey || !bKey) return NextResponse.json({ ok:false, error:"missing_team_keys" }, { status:400 });
    if (!league_key) return NextResponse.json({ ok:false, error:"missing_league_key" }, { status:400 });

    const { yf, access, reason } = await getYahooAuthedForUser(userId);
    if (!access) {
      // Provide granular error -> front-end can present setup guidance.
      return NextResponse.json({ ok:false, error: reason || "not_authed" }, { status: 200 });
    }

    // Create Yahoo Fantasy SDK object from access token
    const yahooClient = getYahoo(access);

    const leagueKey = league_key;

    // --- Scoreboard for week
    const sb = await getScoreboard(yahooClient, leagueKey, week);
    const matchups:any[] = sb?.matchups ?? sb?.scoreboard?.matchups ?? [];
    const m = matchups.find((m:any) => {
      const t1 = m.teams?.[0] ?? m.team1 ?? m?.[0];
      const t2 = m.teams?.[1] ?? m.team2 ?? m?.[1];
      const k1 = teamKeyOf(t1); const k2 = teamKeyOf(t2);
      return (k1===aKey && k2===bKey) || (k1===bKey && k2===aKey);
    });
    if (!m) {
      const debug = req.nextUrl.searchParams.get('debug') === '1';
      return NextResponse.json(
        {
          ok: false,
          error: "matchup_not_found_for_week",
          ...(debug ? {
            debug: {
              leagueKey,
              week,
              matchupsCount: Array.isArray(matchups) ? matchups.length : 0,
            }
          } : {})
        },
        { status: 200 }
      );
    }
    const tA = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const tB = m.teams?.[1] ?? m.team2 ?? m?.[1];

    // Projections: prefer team_projected_points.total, fallback to current points
    const projA = num(tA?.team_projected_points?.total ?? tA?.projected_points?.total);
    const projB = num(tB?.team_projected_points?.total ?? tB?.projected_points?.total);
    const actualA = num(tA?.team_points?.total ?? tA?.points?.total);
    const actualB = num(tB?.team_points?.total ?? tB?.points?.total);

    const useProj = (projA || projB) ? true : false;
    const aTotal = useProj ? projA : actualA;
    const bTotal = useProj ? projB : actualB;
    const gapPts = Number((aTotal - bTotal).toFixed(1));
    const pA = logistic(gapPts);
    const pB = 100 - pA;

    // --- Compose context for OpenAI
    const prompt = `Fantasy Football Matchup Analysis\n\nTeam A: ${teamNameOf(tA)}\nProjected Points: ${aTotal}\nTeam B: ${teamNameOf(tB)}\nProjected Points: ${bTotal}\n\nWrite a short, fun, and insightful analysis of this matchup. Mention key players if possible. Be creative!`;
    const messages = [
      { role: "system", content: "You are an expert fantasy football analyst." },
      { role: "user", content: prompt }
    ];
    let aiAnalysis = null;
    try {
      const aiRes = await chatCompletion({ messages });
      aiAnalysis = aiRes.choices?.[0]?.message?.content || null;
    } catch (e) {
      aiAnalysis = null;
    }

    // --- Recent form (last up to 3 weeks)
    const wk = Number(week || sb?.week || sb?.scoreboard?.week || 1);
    const lookback:number[] = [wk-1, wk-2, wk-3].filter(x => x>=1);
    const recTotals = { [aKey]: [] as number[], [bKey]: [] as number[] };
    for (const w of lookback) {
      const s = await getScoreboard(yahooClient, leagueKey, w);
      const ms:any[] = s?.matchups ?? s?.scoreboard?.matchups ?? [];
      for (const mm of ms) {
        const x1 = mm.teams?.[0] ?? mm.team1 ?? mm?.[0];
        const x2 = mm.teams?.[1] ?? mm.team2 ?? mm?.[1];
        const k1 = teamKeyOf(x1); const k2 = teamKeyOf(x2);
        const pts1 = num(x1?.team_points?.total ?? x1?.points?.total);
        const pts2 = num(x2?.team_points?.total ?? x2?.points?.total);
        if (k1===aKey) recTotals[aKey].push(pts1);
        if (k2===aKey) recTotals[aKey].push(pts2);
        if (k1===bKey) recTotals[bKey].push(pts1);
        if (k2===bKey) recTotals[bKey].push(pts2);
      }
    }
    const formA = `${recTotals[aKey].length || 0}-game avg, ${avg(recTotals[aKey]).toFixed(1)} avg`;
    const formB = `${recTotals[bKey].length || 0}-game avg, ${avg(recTotals[bKey]).toFixed(1)} avg`;

    // --- Injuries from rosters
    const [rA, rB] = await Promise.all([
      getTeamRoster(yahooClient, aKey, wk),
      getTeamRoster(yahooClient, bKey, wk)
    ]);
    const injuries = [
      ...simplifyRosterInjuries(rA, "A"),
      ...simplifyRosterInjuries(rB, "B"),
    ];

    // --- QB Showdown from starting rosters (projections if present)
    const qbA = pickStarterQB(rA);
    const qbB = pickStarterQB(rB);
    const nameA = teamNameOf(tA);
    const nameB = teamNameOf(tB);
    let showdownNote = "QB edge: ";
    if (qbA && qbB) {
      const delta = Number((qbA.proj - qbB.proj).toFixed(1));
      if (Math.abs(delta) < 0.5) showdownNote += "even";
      else showdownNote += (delta > 0 ? `${nameA} by +${delta}` : `${nameB} by ${delta}`);
    } else {
      showdownNote += (gapPts>=0 ? `${nameA}` : `${nameB}`);
    }

    // --- Real weather using NFL team abbreviations from starters
    const startersA = normalizeRosterArray(rA).filter((p:any)=>{
      const slot = String(selectedSlot(p)).toUpperCase();
      return slot && slot !== "BN";
    });
    const startersB = normalizeRosterArray(rB).filter((p:any)=>{
      const slot = String(selectedSlot(p)).toUpperCase();
      return slot && slot !== "BN";
    });
    const abbrs:string[] = [
      ...startersA.map(teamAbbrOfPlayer),
      ...startersB.map(teamAbbrOfPlayer),
    ].filter(Boolean) as string[];
    const weatherSnaps = await getWeatherForTeams(abbrs);
  const weatherSummary = summarizeWeather(weatherSnaps);
  const weatherBrief = summarizeWeatherBrief(weatherSnaps, 200);
    // Build starters with pos/team for opportunities (best-effort from Yahoo roster objects)
    const mapStarter = (p:any) => ({
      name: nameOf(p),
      pos: String(primaryPos(p) || selectedSlot(p) || "").toUpperCase(),
      team: String(
        p?.player?.editorial_team_abbr || p?.player?.editorial_team || p?.player?.team_abbr || ""
      ).toUpperCase(),
    });
    const startersA2 = startersA.map(mapStarter);
    const startersB2 = startersB.map(mapStarter);
    const weatherOpportunities = generateWeatherOpportunities(startersA2, startersB2, weatherSnaps, nameA, nameB);

    const insight = {
      winProbA: pA, winProbB: pB, gapPts,
      headline: (useProj ? "Projected fireworks" : "Live battle") + `: ${nameA} vs ${nameB}`,
      showdown: {
        a: qbA ? `${qbA.name} (QB • ${qbA.proj.toFixed(1)} proj)` : "QB",
        b: qbB ? `${qbB.name} (QB • ${qbB.proj.toFixed(1)} proj)` : "QB",
        note: showdownNote,
      },
      boomBust: [], // fill later with volatility heuristics
      xFactor: "A swing player could decide this one",
      recentForm: { a: formA, b: formB },
      rivalry: "Head-to-head history coming soon",
      injuries,
  weather: weatherBrief,
  weatherOpportunities,
      funFact: null,
      benchHelp: null,
      aiAnalysis,
    };

    return NextResponse.json({ ok:true, week: wk, insight });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "server_error" }, { status:500 });
  }
}
