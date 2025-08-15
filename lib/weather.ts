// Lightweight weather utility using Open-Meteo (no API key required)
// Provides real weather snapshots for NFL team home cities/stadiums.

export type StadiumInfo = {
  team: string; // NFL abbr (e.g., KC)
  city: string;
  stadium: string;
  lat: number;
  lon: number;
  indoor: boolean; // true = dome/roof (minimal weather impact)
};

export const NFL_STADIUMS: Record<string, StadiumInfo> = {
  KC: { team: "KC", city: "Kansas City, MO", stadium: "GEHA Field at Arrowhead Stadium", lat: 39.049, lon: -94.484, indoor: false },
  MIN: { team: "MIN", city: "Minneapolis, MN", stadium: "U.S. Bank Stadium", lat: 44.974, lon: -93.258, indoor: true },
  MIA: { team: "MIA", city: "Miami Gardens, FL", stadium: "Hard Rock Stadium", lat: 25.958, lon: -80.238, indoor: false },
  SF: { team: "SF", city: "Santa Clara, CA", stadium: "Levi's Stadium", lat: 37.403, lon: -121.97, indoor: false },
  LAC: { team: "LAC", city: "Inglewood, CA", stadium: "SoFi Stadium", lat: 33.953, lon: -118.339, indoor: true },
  BAL: { team: "BAL", city: "Baltimore, MD", stadium: "M&T Bank Stadium", lat: 39.278, lon: -76.623, indoor: false },
  DET: { team: "DET", city: "Detroit, MI", stadium: "Ford Field", lat: 42.339, lon: -83.045, indoor: true },
  DAL: { team: "DAL", city: "Arlington, TX", stadium: "AT&T Stadium", lat: 32.747, lon: -97.094, indoor: true },
  ATL: { team: "ATL", city: "Atlanta, GA", stadium: "Mercedes-Benz Stadium", lat: 33.755, lon: -84.401, indoor: true },
  NYG: { team: "NYG", city: "East Rutherford, NJ", stadium: "MetLife Stadium", lat: 40.813, lon: -74.074, indoor: false },
  NYJ: { team: "NYJ", city: "East Rutherford, NJ", stadium: "MetLife Stadium", lat: 40.813, lon: -74.074, indoor: false },
  CIN: { team: "CIN", city: "Cincinnati, OH", stadium: "Paycor Stadium", lat: 39.095, lon: -84.516, indoor: false },
  PHI: { team: "PHI", city: "Philadelphia, PA", stadium: "Lincoln Financial Field", lat: 39.901, lon: -75.167, indoor: false },
  BUF: { team: "BUF", city: "Orchard Park, NY", stadium: "Highmark Stadium", lat: 42.773, lon: -78.786, indoor: false },
  SEA: { team: "SEA", city: "Seattle, WA", stadium: "Lumen Field", lat: 47.595, lon: -122.331, indoor: false },
  CLE: { team: "CLE", city: "Cleveland, OH", stadium: "Cleveland Browns Stadium", lat: 41.506, lon: -81.699, indoor: false },
  NO: { team: "NO", city: "New Orleans, LA", stadium: "Caesars Superdome", lat: 29.951, lon: -90.081, indoor: true },
  TEN: { team: "TEN", city: "Nashville, TN", stadium: "Nissan Stadium", lat: 36.166, lon: -86.771, indoor: false },
  LV: { team: "LV", city: "Las Vegas, NV", stadium: "Allegiant Stadium", lat: 36.09, lon: -115.183, indoor: true },
  // Extend mapping as needed
};

export type WeatherSnapshot = {
  abbr: string;
  city: string;
  stadium: string;
  indoor: boolean;
  tempF?: number;
  windMph?: number;
  precipProb?: number; // daily max probability %
  summary: string; // human-friendly one-liner
};

function toF(c: number) { return Math.round((c * 9) / 5 + 32); }
function toMph(kmh: number) { return Math.round(kmh / 1.609); }

export async function fetchStadiumWeather(abbr: string): Promise<WeatherSnapshot | null> {
  const info = NFL_STADIUMS[abbr];
  if (!info) return null;
  if (info.indoor) {
    return {
      abbr,
      city: info.city,
      stadium: info.stadium,
      indoor: true,
      summary: `${info.stadium} is indoors — no weather impact expected.`,
    };
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(info.lat));
  url.searchParams.set("longitude", String(info.lon));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("daily", "precipitation_probability_max");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`weather_http_${res.status}`);
    const data = await res.json();
    const tempF = typeof data?.current_weather?.temperature === "number" ? toF(data.current_weather.temperature) : undefined;
    const windMph = typeof data?.current_weather?.windspeed === "number" ? toMph(data.current_weather.windspeed) : undefined;
    const precipProb = Array.isArray(data?.daily?.precipitation_probability_max) ? data.daily.precipitation_probability_max[0] : undefined;
    const parts: string[] = [];
    if (typeof tempF === "number") parts.push(`${tempF}°F`);
    if (typeof windMph === "number") parts.push(`wind ${windMph} mph`);
    if (typeof precipProb === "number") parts.push(`precip ${precipProb}%`);
    let impact = "minimal";
    if ((windMph ?? 0) >= 18 || (precipProb ?? 0) >= 50) impact = "noticeable";
    if ((windMph ?? 0) >= 25 || (precipProb ?? 0) >= 70) impact = "high";
    const summary = parts.length
      ? `${info.city}: ${parts.join(", ")} — outdoor, ${impact} impact potential.`
      : `${info.city}: outdoor venue — weather impact unknown.`;
    return { abbr, city: info.city, stadium: info.stadium, indoor: false, tempF, windMph, precipProb, summary };
  } catch {
    return { abbr, city: info.city, stadium: info.stadium, indoor: false, summary: `${info.city}: weather fetch failed — outdoor venue.` };
  }
}

export async function getWeatherForTeams(abbrs: string[]): Promise<WeatherSnapshot[]> {
  const uniq = [...new Set(abbrs.filter(Boolean))];
  const snaps = await Promise.all(uniq.map(fetchStadiumWeather));
  return snaps.filter(Boolean) as WeatherSnapshot[];
}

export function summarizeWeather(snaps: WeatherSnapshot[]): string {
  if (!snaps.length) return "No relevant weather effects expected.";
  const lines = snaps.map((s) => `• ${s.abbr} @ ${s.stadium} — ${s.summary}`);
  return lines.join("\n");
}

// Compact, single-line summary aimed to be <= ~200 chars.
export function summarizeWeatherBrief(snaps: WeatherSnapshot[], maxChars = 200): string {
  if (!snaps.length) return "Weather: none.";
  const outdoors = snaps.filter(s => !s.indoor);
  const items: string[] = [];
  for (const s of outdoors) {
    const parts: string[] = [];
    const w = s.windMph ?? 0;
    const p = s.precipProb ?? 0;
    const t = s.tempF;
    if (p >= 50) parts.push(`precip ${p}%`);
    else if (p >= 30) parts.push(`rain ${p}%`);
    if (w >= 22) parts.push(`wind ${w} mph`);
    else if (w >= 15) parts.push(`breeze ${w} mph`);
    if (typeof t === 'number' && (t <= 25 || t >= 95)) parts.push(`${t}°F`);
    if (parts.length) items.push(`${s.abbr}: ${parts.join("/")}`);
  }
  // If nothing notable outdoors
  if (!items.length) {
    const indoors = snaps.filter(s => s.indoor).length;
    if (outdoors.length === 0 && indoors > 0) return "Indoor games — no weather impact.";
    return "No notable weather impact.";
  }
  // Order by severity heuristics
  items.sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let used = 0;
  for (const it of items) {
    const need = (out.length ? 3 : 0) + it.length; // ' · '
    if (used + need > Math.max(30, maxChars)) break;
    out.push(it);
    used += need;
  }
  if (out.length < items.length) out.push("others minimal");
  return out.join(" · ");
}
