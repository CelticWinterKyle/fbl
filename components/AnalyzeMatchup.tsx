"use client";
import { useState } from "react";

type Insight = {
  winProbA: number; winProbB: number; gapPts: number;
  headline: string;
  showdown: { a: string; b: string; note: string };
  boomBust: string[]; xFactor: string;
  recentForm: { a: string; b: string };
  injuries: { team: "A"|"B"; q?: number; o?: number; ir?: number; bye?: boolean }[];
  weather?: string | null; benchHelp?: string | null;
  weatherOpportunities?: { title:string; why:string; action:string; confidence:"low"|"med"|"high"; players?: {name:string; pos:string; team:string}[] }[];
  // live context extras
  scenario?: string | null;
  stillPlaying?: string | null;
};

const USE_MOCK_ANALYZE = false;

function leagueKeyFromTeamKey(teamKey: string): string | null {
  const match = teamKey.match(/^(\d+)\.l\.(\d+)\.t\.(\d+)$/);
  return match ? `${match[1]}.l.${match[2]}` : null;
}

export default function AnalyzeMatchup({
  aKey, bKey, week, aName, bName, platform = "yahoo", leagueKey: leagueKeyProp,
  context = "matchup",
}: {
  aKey: string; bKey: string; week?: number; aName?: string; bName?: string;
  platform?: "yahoo" | "sleeper" | "espn"; leagueKey?: string;
  context?: "matchup" | "live";
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (open && data) { setOpen(false); return; }
    setOpen(true);
    if (data) return;
    setLoading(true); setErr(null);
    try {
      const resolvedLeagueKey =
        leagueKeyProp ?? (platform === "yahoo" ? leagueKeyFromTeamKey(aKey) : null);

      if (!resolvedLeagueKey) throw new Error("Could not determine league key for analysis");

      const endpoint = USE_MOCK_ANALYZE ? "/api/analyze-matchup/mock" : "/api/analyze-matchup";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aKey, bKey, week, platform, leagueKey: resolvedLeagueKey, league_key: resolvedLeagueKey, aName, bName, context }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(mapError(j.error));
      setData(j.insight as Insight);
    } catch (e:any) {
      setErr(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  const verdictText = (data && typeof data.gapPts === 'number') ? verdictFromGap(data.gapPts, aName || "Team A", bName || "Team B") : null;
  const verdictColor = (data && typeof data.gapPts === 'number') ? colorFromGap(data.gapPts) : "text-gray-300";

  return (
    <div>
      {/* Collapsed trigger */}
      {!open && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-[11px] font-bold tracking-wider uppercase transition-colors"
          >
            {context === "live" ? "Live View" : "Analyze"}
          </button>
          {!data ? (
            <span className="text-gray-600 text-xs">{context === "live" ? "Live prediction & comeback odds" : "AI matchup breakdown"}</span>
          ) : (
            <>
              <span className={`${verdictColor} font-semibold text-xs`}>{verdictText}</span>
              <span className="text-gray-500 text-xs">
                {typeof data.winProbA === 'number' && typeof data.winProbB === 'number'
                  ? Math.max(data.winProbA, data.winProbB) : '--'}% · {typeof data.gapPts === 'number' ? fmtGap(data.gapPts) : '--'}
              </span>
              <span className="text-gray-600 text-xs truncate">"{data.headline}"</span>
            </>
          )}
        </div>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="rounded-xl border border-pitch-700 bg-pitch-950 p-4 space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            {data ? <WinMeter a={data.winProbA} b={data.winProbB} aLabel={aName || "Team A"} bLabel={bName || "Team B"}/> : null}
            <div className="text-sm">
              <div className="font-bold">
                <span className={verdictColor}>{(data && typeof data.gapPts === 'number') ? verdictFromGap(data.gapPts, aName || "Team A", bName || "Team B") : "…"}</span>{" "}
                {(data && typeof data.gapPts === 'number') ? <span className="text-gray-600 font-normal text-xs">· {fmtGap(data.gapPts)}</span> : null}
              </div>
              <div className="text-xs text-gray-500">{(data && data.headline) ? `"${data.headline}"` : null}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto rounded border border-pitch-700 bg-pitch-800 px-2.5 py-1 text-[11px] font-bold tracking-wider text-gray-500 hover:text-gray-300 hover:bg-pitch-700 uppercase transition-colors"
            >
              Close
            </button>
          </div>

          {loading && <div className="text-sm text-gray-500">Crunching numbers…</div>}
          {err && <div className="text-sm text-red-400">{err}</div>}

          {data && (
            <>
              <div className="space-y-3">
                <Tile title="Key Player Showdown" icon="⚔️">
                  {(data.showdown?.a && data.showdown?.b) ? (
                    <>
                      <Line>{data.showdown.a} vs {data.showdown.b}</Line>
                      {data.showdown?.note ? <Sub>{data.showdown.note}</Sub> : null}
                    </>
                  ) : <Sub>—</Sub>}
                </Tile>
                <Tile title="X-Factor Player" icon="✨"><Line>{data.xFactor || "-"}</Line></Tile>
                <Tile title="Boom / Bust Risks" icon="💥">
                  {Array.isArray(data.boomBust) && data.boomBust.length > 0
                    ? data.boomBust.slice(0,2).filter(Boolean).map((s,i)=> <Sub key={i}>• {s}</Sub>)
                    : <Sub>—</Sub>
                  }
                </Tile>
              </div>

              {typeof (data as any).aiAnalysis === 'string' && (data as any).aiAnalysis.trim() && (
                <div className="rounded-lg border border-amber-600/30 bg-amber-900/10 p-4">
                  <div className="mb-2 text-[10px] font-bold tracking-[0.18em] text-amber-400 uppercase flex items-center gap-2">
                    <span>🤖</span><span>AI Analysis</span>
                  </div>
                  <div className="text-sm text-amber-100/80 whitespace-pre-line leading-relaxed">{(data as any).aiAnalysis}</div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <Tile title="Recent Form" icon="📈">
                  <Line>{aName || "Team A"}: {data.recentForm?.a || "—"}</Line>
                  <Line>{bName || "Team B"}: {data.recentForm?.b || "—"}</Line>
                </Tile>
                <Tile title="Injuries & Byes" icon="🚑">
                  <div className="flex flex-wrap gap-1.5">
                    {!Array.isArray(data.injuries) || data.injuries.length===0 ? <Sub>None reported</Sub> :
                      data.injuries.map((g,i)=>(
                        <Pill key={i} tone={g.o||g.ir?"bad":g.q?"warn":"info"}>
                          {(g.team==="A"?(aName||"Team A"):(bName||"Team B"))}: {formatInjuryGroup(g)}
                        </Pill>
                      ))
                    }
                  </div>
                </Tile>
              </div>

              <div className="space-y-3">
                {context === "live" && data.scenario && (
                  <Tile title="Comeback Scenario" icon="⚡">
                    <Line>{data.scenario}</Line>
                  </Tile>
                )}
                {context === "live" && data.stillPlaying && (
                  <Tile title="Still In Play" icon="🏈">
                    <Line>{data.stillPlaying}</Line>
                  </Tile>
                )}
                {context !== "live" && data.benchHelp && (
                  <Tile title="Bench Help" icon="💡">
                    <Line>{data.benchHelp}</Line>
                  </Tile>
                )}
                {data.weather ? (
                  <Tile title="Weather" icon="🌧️">
                    <Line>{data.weather}</Line>
                    {Array.isArray(data.weatherOpportunities) && data.weatherOpportunities.length>0 ? (
                      <div className="mt-2 space-y-2">
                        <Sub>Opportunities</Sub>
                        {data.weatherOpportunities.slice(0,2).map((o,i)=> (
                          <div key={i} className="rounded border border-emerald-700/50 bg-emerald-900/20 p-2">
                            <div className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">{o.title}</div>
                            <div className="text-xs text-emerald-300/80">{o.why}</div>
                            <div className="text-xs text-emerald-400/70">Action: {o.action} · Confidence: {o.confidence}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Tile>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* helpers */
function mapError(code: string) {
  switch (code) {
    case 'rate_limited': return 'Analyze limit reached (15/hr). Try again later.';
    case 'skip_flag': return 'Yahoo data temporarily skipped.';
    case 'missing_env': return 'Yahoo API credentials not configured.';
    case 'missing_league': return 'League ID not set.';
    case 'no_token': return 'Yahoo not authorized. Connect Yahoo to enable.';
    case 'not_authed': return 'Not authorized with Yahoo.';
    case 'matchup_not_found_for_week': return 'Matchup not found for this week.';
    case 'missing_team_keys': return 'Missing team keys for analysis.';
    case 'missing_league_key': return 'Missing league key for analysis.';
    case 'no_user_id': return 'Session missing. Refresh and try again.';
    case 'yahoo_auth_failed': return 'Yahoo auth failed. Reconnect Yahoo.';
    case 'server_error': return 'Server error while analyzing.';
    default: return code || 'Analysis failed.';
  }
}
function verdictFromGap(gap:number, nameA:string="Team A", nameB:string="Team B"){
  const s = Math.abs(gap).toFixed(1);
  if (gap > 12) return `🔥 Heavy Favorite: ${nameA} (+${s})`;
  if (gap > 5)  return `💪 Strong Edge: ${nameA} (+${s})`;
  if (gap >= -5) return `⚖️ Too Close to Call (${gap>=0?"+":""}${gap.toFixed(1)})`;
  if (gap >= -12) return `💪 Strong Edge: ${nameB} (+${s})`;
  return `🔥 Heavy Favorite: ${nameB} (+${s})`;
}
function colorFromGap(gap:number){
  if (gap > 12) return "text-emerald-400";
  if (gap > 5)  return "text-emerald-300";
  if (gap >= -5) return "text-gray-300";
  if (gap >= -12) return "text-amber-400";
  return "text-red-400";
}
function fmtGap(x:number){ return `${x>=0?"+":""}${x.toFixed(1)} pts`; }
function formatInjuryGroup(g:{q?:number;o?:number;ir?:number;bye?:boolean}){
  const parts:string[]=[]; if(g.q)parts.push(`${g.q} Q`); if(g.o)parts.push(`${g.o} Out`);
  if(g.ir)parts.push(`${g.ir} IR`); if(g.bye)parts.push(`DEF on bye`); return parts.join(", ")||"—";
}
function WinMeter({ a, b, aLabel, bLabel }:{ a:number; b:number; aLabel:string; bLabel:string }){
  const A=Math.round(a), B=Math.round(b);
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] font-bold tracking-wider text-gray-500 uppercase mb-1.5">
        <span>{aLabel}: {A}%</span><span>{bLabel}: {B}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-pitch-800 overflow-hidden flex">
        <div className="h-full bg-amber-500 rounded-l-full transition-all" style={{ width: `${A}%` }} />
        <div className="h-full bg-gray-700 rounded-r-full transition-all" style={{ width: `${B}%` }} />
      </div>
    </div>
  );
}
function Tile({ title, icon, children }:{ title:string; icon:string; children:React.ReactNode }){
  return (
    <div className="rounded-lg border border-pitch-700/60 bg-pitch-800 p-3">
      <div className="mb-1.5 text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase flex items-center gap-2">
        <span>{icon}</span><span>{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Line({ children }:{ children: React.ReactNode }){ return <div className="text-sm text-gray-200">{children}</div>; }
function Sub({ children }:{ children: React.ReactNode }){ return <div className="text-xs text-gray-500">{children}</div>; }
function Pill({ children, tone="info" }:{ children: React.ReactNode; tone?: "info"|"warn"|"bad" }){
  const tones:Record<string,string>={
    info:"bg-blue-500/10 text-blue-300 border-blue-500/30",
    warn:"bg-amber-500/10 text-amber-300 border-amber-500/30",
    bad:"bg-red-500/10 text-red-300 border-red-500/30"
  };
  return <span className={`text-xs px-2 py-0.5 rounded border ${tones[tone]}`}>{children}</span>;
}
