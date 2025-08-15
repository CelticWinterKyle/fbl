"use client";
import { useState } from "react";

type Insight = {
  winProbA: number; winProbB: number; gapPts: number;
  headline: string;
  showdown: { a: string; b: string; note: string };
  boomBust: string[]; xFactor: string;
  recentForm: { a: string; b: string };
  rivalry: string;
  injuries: { team: "A"|"B"; q?: number; o?: number; ir?: number; bye?: boolean }[];
  weather?: string | null; funFact?: string | null; benchHelp?: string | null;
  weatherOpportunities?: { title:string; why:string; action:string; confidence:"low"|"med"|"high"; players?: {name:string; pos:string; team:string}[] }[];
};

const USE_MOCK_ANALYZE = true; // Set to false for live, true for mock

export default function AnalyzeMatchup({ aKey, bKey, week, aName, bName }:{
  aKey: string; bKey: string; week?: number; aName?: string; bName?: string;
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
  const endpoint = USE_MOCK_ANALYZE ? "/api/analyze-matchup/mock" : "/api/analyze-matchup";
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aKey, bKey, week }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "failed");
      setData(j.insight as Insight);
    } catch (e:any) {
      setErr(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  const verdictText = (data && typeof data.gapPts === 'number') ? verdictFromGap(data.gapPts, aName || "Team A", bName || "Team B") : null;
  const verdictColor = (data && typeof data.gapPts === 'number')
    ? colorFromGap(data.gapPts)
    : "text-gray-300";

  return (
    <div className="mt-3">
      {/* collapsed line */}
      {!open && (
        <div className="flex items-center gap-3 text-sm">
          <button onClick={load} className="rounded bg-blue-600 px-2.5 py-1 text-xs hover:bg-blue-500">
            Analyze
          </button>
          {!data ? (
            <span className="text-gray-400">Quick matchup breakdown</span>
          ) : (
            <>
              <span className={`${verdictColor} font-medium`}>{verdictText}</span>
              <span className="text-gray-300">
                {typeof data.winProbA === 'number' && typeof data.winProbB === 'number' ? Math.max(data.winProbA, data.winProbB) : '--'}% win chance · {typeof data.gapPts === 'number' ? fmtGap(data.gapPts) : '--'}
              </span>
              <span className="text-gray-400 truncate">— “{data.headline}”</span>
            </>
          )}
        </div>
      )}

      {/* expanded */}
      {open && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-4">
          <div className="flex items-end gap-3">
            {data ? <WinMeter a={data.winProbA} b={data.winProbB} aLabel={aName || "Team A"} bLabel={bName || "Team B"}/> : null}
            <div className="text-sm text-gray-300">
              <div className="font-semibold">
                <span className={verdictColor}>{(data && typeof data.gapPts === 'number') ? verdictFromGap(data.gapPts, aName || "Team A", bName || "Team B") : "…"}</span>{" "}
                {(data && typeof data.gapPts === 'number') ? <span className="text-gray-400">· {fmtGap(data.gapPts)}</span> : null}
              </div>
              <div className="text-xs text-gray-400">{(data && data.headline) ? `“${data.headline}”` : null}</div>
            </div>
            <button onClick={()=>setOpen(false)} className="ml-auto rounded border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs hover:bg-gray-800">
              Close
            </button>
          </div>

          {loading && <div className="text-sm text-gray-400">Crunching numbers…</div>}
          {err && <div className="text-sm text-red-300">{err}</div>}

          {data && (
            <>
              <div className="space-y-4 mt-4 mb-2">
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
                <div className="rounded border border-blue-700 bg-blue-950 p-4 mt-4 mb-2">
                  <div className="mb-2 text-xs text-blue-300 font-semibold flex items-center gap-2">
                    <span>🤖</span> <span>AI Analysis</span>
                  </div>
                  <div className="text-base text-blue-100 whitespace-pre-line leading-relaxed">{(data as any).aiAnalysis}</div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <Tile title="Recent Form (last 3 games)" icon="📈">
                  <Line>{aName || "Team A"}: {data.recentForm?.a || "-"}</Line>
                  <Line>{bName || "Team B"}: {data.recentForm?.b || "-"}</Line>
                </Tile>
                <Tile title="Rivalry History" icon="🏟️"><Line>{data.rivalry || "-"}</Line></Tile>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Tile title="Injuries & Byes" icon="🚑">
                  <div className="flex flex-wrap gap-2">
                    {!Array.isArray(data.injuries) || data.injuries.length===0 ? <Sub>None</Sub> :
                      data.injuries.map((g,i)=>(
                        <Pill key={i} tone={g.o||g.ir?"bad":g.q?"warn":"info"}>
                          {(g.team==="A"?(aName||"Team A"):(bName||"Team B"))}: {formatInjuryGroup(g)}
                        </Pill>
                      ))
                    }
                  </div>
                </Tile>
                {data.weather ? (
                  <Tile title="Weather" icon="🌧️">
                    <Line>{data.weather}</Line>
                    {Array.isArray(data.weatherOpportunities) && data.weatherOpportunities.length>0 ? (
                      <div className="mt-2 space-y-2">
                        <Sub>Weather Opportunities</Sub>
                        {data.weatherOpportunities.slice(0,2).map((o,i)=> (
                          <div key={i} className="rounded border border-emerald-700 bg-emerald-950 p-2">
                            <div className="text-xs text-emerald-300 font-semibold">{o.title}</div>
                            <div className="text-xs text-emerald-200">{o.why}</div>
                            <div className="text-xs text-emerald-200">Action: {o.action} · Confidence: {o.confidence}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Tile>
                ) : null}
                <Tile title="Bench Help" icon="�"><Line>{data.benchHelp || "—"}</Line></Tile>
                {data.funFact ? (
                  <Tile title="League Fun Fact" icon="�"><Line>{data.funFact}</Line></Tile>
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
function verdictFromGap(gap:number, nameA:string="Team A", nameB:string="Team B"){
  const s = Math.abs(gap).toFixed(1);
  if (gap > 12) return `🔥 Heavy Favorite: ${nameA} (+${s} pts)`;
  if (gap > 5)  return `💪 Strong Edge: ${nameA} (+${s} pts)`;
  if (gap >= -5) return `⚖️ Too Close to Call (${gap>=0?"+":""}${gap.toFixed(1)} pts)`;
  if (gap >= -12) return `💪 Strong Edge: ${nameB} (+${s} pts)`;
  return `🔥 Heavy Favorite: ${nameB} (+${s} pts)`;
}
function colorFromGap(gap:number){
  if (gap > 12) return "text-emerald-300";
  if (gap > 5)  return "text-emerald-200";
  if (gap >= -5) return "text-gray-300";
  if (gap >= -12) return "text-amber-300";
  return "text-red-300";
}
function fmtGap(x:number){ return `${x>=0?"+":""}${x.toFixed(1)} pts`; }
function formatInjuryGroup(g:{q?:number;o?:number;ir?:number;bye?:boolean}){
  const parts:string[]=[]; if(g.q)parts.push(`${g.q} Questionable`); if(g.o)parts.push(`${g.o} Out`);
  if(g.ir)parts.push(`${g.ir} IR`); if(g.bye)parts.push(`Defense on bye`); return parts.join(", ")||"—";
}
function WinMeter({ a, b, aLabel, bLabel }:{ a:number; b:number; aLabel:string; bLabel:string }){
  const A=Math.round(a), B=Math.round(b);
  return (
    <div className="w-full max-w-xs">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
  <span>{aLabel} win chance: {A}%</span><span>{bLabel} win chance: {B}%</span>
      </div>
      <div className="h-2 w-full rounded bg-gray-800 overflow-hidden flex">
        <div className="h-full bg-emerald-500" style={{ width: `${A}%` }} />
        <div className="h-full bg-rose-500" style={{ width: `${B}%` }} />
      </div>
    </div>
  );
}
function Tile({ title, icon, children }:{ title:string; icon:string; children:React.ReactNode }){
  return (
    <div className="rounded border border-gray-800 bg-gray-900 p-3">
      <div className="mb-1 text-xs text-gray-400 flex items-center gap-2">
        <span>{icon}</span><span>{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Line({ children }:{ children: React.ReactNode }){ return <div className="text-sm text-gray-200">{children}</div>; }
function Sub({ children }:{ children: React.ReactNode }){ return <div className="text-xs text-gray-400">{children}</div>; }
function Pill({ children, tone="info" }:{ children: React.ReactNode; tone?: "info"|"warn"|"bad" }){
  const tones:Record<string,string>={info:"bg-blue-500/15 text-blue-300 border-blue-500/30",warn:"bg-amber-500/15 text-amber-300 border-amber-500/30",bad:"bg-rose-500/15 text-rose-300 border-rose-500/30"};
  return <span className={`text-xs px-2 py-0.5 rounded border ${tones[tone]}`}>{children}</span>;
}
