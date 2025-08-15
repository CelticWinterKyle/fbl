export type Starter = { name: string; pos: string; team: string };
export type WeatherSnapshot = {
  abbr: string;
  city: string;
  stadium: string;
  indoor: boolean;
  tempF?: number;
  windMph?: number;
  precipProb?: number;
  summary: string;
};

export type WeatherOpportunity = {
  title: string;
  why: string;
  action: string;
  confidence: "low" | "med" | "high";
  players?: { name: string; pos: string; team: string }[];
};

function severityOf(snaps: WeatherSnapshot[]) {
  // Consider only outdoor
  const outdoors = snaps.filter(s => !s.indoor);
  if (!outdoors.length) return { level: 0, snap: null as WeatherSnapshot | null };
  // Pick the most severe by wind/precip
  let best = outdoors[0];
  for (const s of outdoors) {
    const w = s.windMph ?? 0;
    const p = s.precipProb ?? 0;
    const score = Math.max(w / 5, p / 10); // rough severity score
    const bScore = Math.max((best.windMph ?? 0) / 5, (best.precipProb ?? 0) / 10);
    if (score > bScore) best = s;
  }
  const wind = best.windMph ?? 0;
  const precip = best.precipProb ?? 0;
  const temp = best.tempF ?? 70;
  if (wind >= 25 || precip >= 70) return { level: 3, snap: best };
  if (wind >= 18 || precip >= 50) return { level: 2, snap: best };
  if (temp <= 25 || temp >= 95) return { level: 1, snap: best };
  return { level: 0, snap: best };
}

export function assessWeatherSeverity(snaps: WeatherSnapshot[]) {
  const { level, snap } = severityOf(snaps);
  if (!snap) return { level: 0, runTilt: false, kickerRisk: false, snap: null as WeatherSnapshot | null };
  const wind = snap.windMph ?? 0;
  const precip = snap.precipProb ?? 0;
  const temp = snap.tempF ?? 70;
  const runTilt = level >= 2 || temp <= 25;
  const kickerRisk = wind >= 22 || precip >= 60 || temp <= 20;
  return { level, runTilt, kickerRisk, snap };
}

function pickPlayers(starters: Starter[], pos: string, limit = 2) {
  return starters.filter(s => String(s.pos).toUpperCase().includes(pos.toUpperCase())).slice(0, limit);
}

export function generateWeatherOpportunities(
  startersA: Starter[],
  startersB: Starter[],
  snaps: WeatherSnapshot[],
  teamAName?: string,
  teamBName?: string
) {
  const ops: WeatherOpportunity[] = [];
  const { level, snap } = severityOf(snaps);
  if (!snap || level === 0) return ops; // nothing strong to report

  const A_RBs = pickPlayers(startersA, "RB");
  const B_RBs = pickPlayers(startersB, "RB");
  const A_TEs = pickPlayers(startersA, "TE", 1);
  const B_TEs = pickPlayers(startersB, "TE", 1);
  const A_K = pickPlayers(startersA, "K", 1);
  const B_K = pickPlayers(startersB, "K", 1);

  const wind = snap.windMph ?? 0;
  const precip = snap.precipProb ?? 0;
  const temp = snap.tempF ?? 70;

  // Primary opportunity: run tilt in rain/wind/cold
  if (level >= 2 || temp <= 25) {
    const title = `Weather tilt favors the run`;
    const why = `Outdoor conditions (${wind ? `${wind} mph wind` : ''}${wind && precip ? ', ' : ''}${precip ? `${precip}% precip` : ''}${(!wind && !precip) ? `${temp}°F` : ''}) reduce efficiency for deep passing.`;
    const players = [...A_RBs, ...B_RBs].slice(0, 3);
    const action = players.length
      ? `Lean into RB usage (${players.map(p=>`${p.name} (${p.pos} ${p.team})`).join(', ')}). Temper deep WR/QB expectations.`
      : `Lean into RB usage. Temper deep WR/QB expectations.`;
    ops.push({ title, why, action, confidence: level === 3 ? "high" : "med", players });
  }

  // Secondary opportunity: kicker caution on high wind/precip or extreme cold
  if ((wind >= 22 || precip >= 60 || temp <= 20) && ops.length < 2) {
    const candidates = [...A_K, ...B_K];
    const title = `Kicker volatility in the elements`;
    const why = `Wind/precip${temp <= 20 ? ' and cold' : ''} can reduce long FG reliability.`;
    const action = candidates.length
      ? `Consider alternatives or adjust expectations for ${candidates.map(k=>`${k.name} (${k.team})`).join(', ')}.`
      : `Consider safer kicker options or expect fewer long attempts.`;
    ops.push({ title, why, action, confidence: "med", players: candidates });
  }

  return ops.slice(0, 2);
}
