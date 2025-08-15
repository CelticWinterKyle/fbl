import { NextRequest, NextResponse } from 'next/server';
import rosters from '@/data/rosters.json';
import { chatCompletion } from '@/lib/openai';
import { getWeatherForTeams, summarizeWeather, summarizeWeatherBrief } from '@/lib/weather';
import { generateWeatherOpportunities, assessWeatherSeverity } from '@/lib/weatherOps';

// Enhanced mock: realistic analysis using projected points
export async function POST(req: NextRequest) {
  const { aKey, bKey, week } = await req.json();
  const teamA = rosters.find((t: any) => t.team === aKey);
  const teamB = rosters.find((t: any) => t.team === bKey);
  if (!teamA || !teamB) {
    return NextResponse.json({ ok: false, error: 'Matchup not found for week' }, { status: 404 });
  }
  const isStarter = (pos: string) => !["BN","IR"].includes(String(pos).toUpperCase());
  const totalA = teamA.roster.filter((p:any)=>isStarter(p.position)).reduce((sum: number, p: any) => sum + (typeof p.points === 'number' ? p.points : 0), 0);
  const totalB = teamB.roster.filter((p:any)=>isStarter(p.position)).reduce((sum: number, p: any) => sum + (typeof p.points === 'number' ? p.points : 0), 0);
  const gapPts = totalA - totalB;

  // Real weather: gather NFL team abbreviations for starters on both teams
  const abbrs = [
    ...teamA.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>p.team),
    ...teamB.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>p.team),
  ].filter(Boolean) as string[];
  const weatherSnaps = await getWeatherForTeams(abbrs);
  const weatherSummary = summarizeWeather(weatherSnaps);
  const weatherBrief = summarizeWeatherBrief(weatherSnaps, 200);
  // Build starters list with pos/team for opportunities engine
  const startersA = teamA.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>({ name: p.name, pos: p.position, team: p.team }));
  const startersB = teamB.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>({ name: p.name, pos: p.position, team: p.team }));
  const weatherOpportunities = generateWeatherOpportunities(startersA, startersB, weatherSnaps, teamA.team, teamB.team);
  // No server-side bench help fallback; rely on AI for complete responses in mock mode.

  // Build starters/bench arrays with defaults required by the new template
  const short = (full:string)=>{
    const parts = String(full||"").trim().split(/\s+/); if(parts.length<2) return full||"—"; return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
  };
  const startersAEx = teamA.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>({
    name: short(p.name), position: p.position, projection: Number(p.points||0), opponent: "—", difficulty: "—", volatility: "—"
  }));
  const startersBEx = teamB.roster.filter((p:any)=>isStarter(p.position)).map((p:any)=>({
    name: short(p.name), position: p.position, projection: Number(p.points||0), opponent: "—", difficulty: "—", volatility: "—"
  }));
  const benchAEx = teamA.roster.filter((p:any)=>String(p.position).toUpperCase()==='BN').map((p:any)=>({
    name: short(p.name), position: p.position, projection: Number(p.points||0), opponent: "—", difficulty: "—", volatility: "—"
  }));
  const benchBEx = teamB.roster.filter((p:any)=>String(p.position).toUpperCase()==='BN').map((p:any)=>({
    name: short(p.name), position: p.position, projection: Number(p.points||0), opponent: "—", difficulty: "—", volatility: "—"
  }));

  const leagueName = "Family Business League";
  const rivalryNote = "No prior meetings.";
  const recentA = "No recent data";
  const recentB = "No recent data";
  const gap = Number((totalA - totalB).toFixed(1));
  const prompt = `Analyze this fantasy matchup for Week ${week ?? 1} in ${leagueName}.\n\n--- MATCHUP ---\nTeam A: ${teamA.team} (${teamA.owner}) - Projected: ${totalA} pts\nTeam B: ${teamB.team} (${teamB.owner}) - Projected: ${totalB} pts\nPoint Gap: ${gap} (positive = Team A leads)\n\nRecent Performance (last 3 weeks):\nTeam A: ${recentA} pts avg\nTeam B: ${recentB} pts avg\n\nWeather Summary: ${weatherBrief}\nLeague Context: ${rivalryNote}\n\n--- ROSTERS ---\nTeam A Starters:\n${JSON.stringify(startersAEx)}\n\nTeam A Bench:\n${JSON.stringify(benchAEx)}\n\nTeam B Starters:\n${JSON.stringify(startersBEx)}\n\nTeam B Bench:\n${JSON.stringify(benchBEx)}\n\n--- ANALYSIS RULES ---\n\n**Win Probabilities:**\nUse point gap to determine odds:\n- 0–5 pts: 52/48 split (favor leader)\n- 6–10 pts: 57/43 split\n- 11–15 pts: 62/38 split\n- 16–20 pts: 66/34 split\n- 21–25 pts: 70/30 split\n- 26+ pts: 75/25 split\nMust sum to exactly 100.\n\n**Key Matchup Selection:**\n1. If both teams start QBs, compare QBs.\n2. Otherwise, pick highest-projected skill players (RB/WR/TE).\n3. Never pick K or DEF unless no skill players are available.\n4. Tie-break by softer opponent difficulty, then earlier kickoff.\n5. “why” must be one sentence in plain English.\n\n**X-Factor Logic:**\nPick the player most likely to swing the game:\n1. Bench player within 2 pts of a starter at the same position.\n2. High-volatility boom/bust player.\n3. Player with a great matchup vs a weak defense.\n4. Weather beneficiary (dome game or wind/rain factor).\nIf none, pick the safest high-usage RB/WR starter and say why.\n\n**Boom/Bust:**\nReturn one boom scenario and one bust risk. Each ≤90 chars.\nEach must reference a player from the rosters.\n\n**QuickHits:**\n2–3 short bullets, each ≤80 chars, scannable and actionable.\nMust reference roster players, matchups, or weather.\n\n**Confidence:**\nBased on point gap and volatility:\n- High: gap ≥ 15 pts and low volatility.\n- Medium: gap 6–14 pts or mixed volatility.\n- Low: gap ≤ 5 pts or very high volatility.\n\nDefaults:\n- weatherImpact: "No weather factors"\n- benchAlert: "No clear upgrades available"\n- rivalryNote: "No prior meetings."\n- recentA/recentB: "No recent data"\n- injuries: ["No notable injuries"]\n\n--- OUTPUT FORMAT ---\nReturn this exact JSON structure:\n\n{\n  "winProbA": number,\n  "winProbB": number,\n  "pointGap": number,\n  "headline": string,\n  "keyMatchup": { "playerA": "F. Lastname", "playerB": "F. Lastname", "why": string },\n  "boomBust": { "boom": string, "bust": string },\n  "xFactor": string,\n  "weatherImpact": string,\n  "benchAlert": string,\n  "quickHits": [ string, string, string? ],\n  "confidence": "high" | "medium" | "low",\n  "summary": string\n}`;

  const messages = [
    { role: "system", content: "You are an expert fantasy football analyst. Output valid JSON only.\nUse only the provided data — never invent players, stats, injuries, or weather.\nWrite in plain English for casual fans. Keep it fun and actionable.\nAll player names in \"F. Lastname\" format.\nIn all text fields, refer to teams by their actual names (e.g., 'AK-47'), never 'Team A' or 'Team B'.\nNo nulls. If data is missing, use the provided defaults." },
    { role: "user", content: prompt }
  ];
  let aiJson: any = null;
  try {
  const aiRes = await chatCompletion({ messages, model: "gpt-4o-mini", temperature: 0.25, response_format: { type: "json_object" }, logTag: "analyze-mock" });
    // Try to parse the first code block as JSON
    const match = aiRes.choices?.[0]?.message?.content?.match(/```json[\s\n]*([\s\S]+?)```|({[\s\S]+})/i);
    if (match) {
      const jsonStr = match[1] || match[2];
      aiJson = JSON.parse(jsonStr);
    } else {
      aiJson = null;
    }
  } catch (e) {
    aiJson = null;
  }
  const base = {
    ok: true,
    week,
    matchup: {
      a: { name: teamA.team, owner: teamA.owner, total: totalA, roster: teamA.roster },
      b: { name: teamB.team, owner: teamB.owner, total: totalB, roster: teamB.roster },
    },
  };
  // Helper fallbacks (internal only, not injected) for dev utilities
  const nameShort = (full:string)=>{
    const parts = String(full||"").trim().split(/\s+/);
    if (parts.length<2) return full||"—";
    return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
  };
  function fallbackShowdown(){
    // Prefer QBs; else top projected starters by points
    const qbA = startersA.find(p=>String(p.pos).toUpperCase()==='QB');
    const qbB = startersB.find(p=>String(p.pos).toUpperCase()==='QB');
    let aName = qbA?.name, bName = qbB?.name;
    if (!aName || !bName){
      const allWithPts = [
        ...startersA.map((p:any)=>({ ...p, points: (teamA!.roster.find((q:any)=>q.name===p.name)?.points)||0 })),
        ...startersB.map((p:any)=>({ ...p, points: (teamB!.roster.find((q:any)=>q.name===p.name)?.points)||0 })),
      ].sort((a:any,b:any)=> (b.points||0)-(a.points||0));
      aName = aName || allWithPts[0]?.name;
      bName = bName || allWithPts.find(x=>x.name!==aName)?.name;
    }
  const note = Math.abs(gapPts) < 1 ? "Too close to call" : (gapPts>0 ? `${teamA!.team} slight edge` : `${teamB!.team} slight edge`);
    return { a: aName?nameShort(aName):"—", b: bName?nameShort(bName):"—", note };
  }
  function fallbackXFactor(){
    const sev = assessWeatherSeverity(weatherSnaps);
    if (sev?.runTilt) {
      const all = [...startersA, ...startersB];
      const rb = all.find(p => String(p.pos).toUpperCase()==='RB');
      if (rb) return `${rb.name} (${rb.team}) could be the difference if teams lean on the run.`;
      return `A reliable runner could be the difference if passing slows down.`;
    }
    // pick the top projected starter by points as a simple proxy
    const allWithPts = [
      ...startersA.map((p:any)=>({ ...p, points: (teamA!.roster.find((q:any)=>q.name===p.name)?.points)||0 })),
      ...startersB.map((p:any)=>({ ...p, points: (teamB!.roster.find((q:any)=>q.name===p.name)?.points)||0 })),
    ].sort((a:any,b:any)=> (b.points||0)-(a.points||0));
    const top = allWithPts[0];
    return top ? `${top.name} (${top.pos || top.position} ${top.team}) has the upside to swing this matchup.` : "One big performance could decide it.";
  }
  function fallbackBoomBust(){
    const sev = assessWeatherSeverity(weatherSnaps);
    const out:string[] = [];
    if (sev?.runTilt) {
      out.push("Deep wide receivers are riskier in the rain; short throws and slot guys are safer.");
      out.push("Running backs could see extra work if the weather is messy.");
    }
    if (sev?.kickerRisk) out.push("Kickers may be shaky in bad weather—long attempts less likely.");
    if (out.length===0) out.push("Boom/bust WRs can swing the week—watch usage and matchup.");
    return out.slice(0,2);
  }
  function genericBenchHelp(){
    return "No clear bench move from weather. Start your best projections and re-check inactives 90 minutes before kickoff.";
  }
  function calculateWinProb(g:number){
    const gabs = Math.abs(g);
    let prob = 52;
    if (gabs <= 5) prob = 52; else if (gabs <= 10) prob = 57; else if (gabs <= 15) prob = 62; else if (gabs <= 20) prob = 66; else if (gabs <= 25) prob = 70; else prob = 75;
    return g >= 0 ? prob : 100 - prob;
  }
  function validateAndClean(resp:any){
    if (!resp || typeof resp !== 'object') return null;
    const gap = Number((totalA - totalB).toFixed(1));
    resp.winProbA = calculateWinProb(gap);
    resp.winProbB = 100 - resp.winProbA;
    resp.pointGap = gap;
    if (!resp.weatherImpact) resp.weatherImpact = "No weather factors";
    if (!resp.benchAlert) resp.benchAlert = "No clear upgrades available";
    const trimDeep = (v:any):any => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : Array.isArray(v) ? v.map(trimDeep) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k,val])=>[k, trimDeep(val as any)])) : v;
    return trimDeep(resp);
  }
  // Replace any stray 'Team A'/'Team B' references with actual team names
  const teamifyString = (s:any):any => {
    if (typeof s !== 'string') return s;
    return s
      .replace(/\bTeam A['’]s\b/gi, `${teamA.team}'s`)
      .replace(/\bTeam B['’]s\b/gi, `${teamB.team}'s`)
      .replace(/\bTeam A\b/gi, teamA.team)
      .replace(/\bTeam B\b/gi, teamB.team);
  };
  const teamifyDeep = (v:any):any =>
    typeof v === 'string'
      ? teamifyString(v)
      : Array.isArray(v)
      ? v.map(teamifyDeep)
      : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k,val])=>[k, teamifyDeep(val as any)]))
      : v;
  if (aiJson && typeof aiJson === 'object') {
    const cleaned = validateAndClean(teamifyDeep(aiJson));
    if (cleaned) {
      // Map new schema to UI schema
      const insight = {
        winProbA: cleaned.winProbA,
        winProbB: cleaned.winProbB,
        gapPts: cleaned.pointGap,
        headline: teamifyString(cleaned.headline),
        showdown: { a: cleaned?.keyMatchup?.playerA, b: cleaned?.keyMatchup?.playerB, note: teamifyString(cleaned?.keyMatchup?.why) },
        boomBust: [cleaned?.boomBust?.boom, cleaned?.boomBust?.bust].map(teamifyString).filter(Boolean),
        xFactor: teamifyString(cleaned.xFactor),
        recentForm: { a: recentA, b: recentB },
        rivalry: rivalryNote,
        injuries: [],
        weather: weatherBrief,
        weatherOpportunities,
        funFact: null,
        benchHelp: teamifyString(cleaned.benchAlert),
        aiAnalysis: teamifyString(cleaned.summary),
      };
      return NextResponse.json({ ...base, insight });
    }
  }
  return NextResponse.json({ ...base, insight: { error: "AI did not return valid JSON", weather: weatherBrief, weatherOpportunities } });
}
