// NFL team accent themes. Each team maps to a single accent hex chosen to be
// legible on the dark "pitch" background (often the team's brighter/secondary
// color). The app's dark base + fonts never change — only the accent does.
//
// accentVarsForHex() derives the three CSS vars the UI uses (--accent + lighter
// "soft" + deeper "strong") from one hex, so a team only needs one color.

export type NflTeam = { id: string; name: string; accent: string };

export const NFL_TEAMS: NflTeam[] = [
  { id: "ari", name: "Arizona Cardinals", accent: "#e84d6b" },
  { id: "atl", name: "Atlanta Falcons", accent: "#e8344e" },
  { id: "bal", name: "Baltimore Ravens", accent: "#8c6bf0" },
  { id: "buf", name: "Buffalo Bills", accent: "#4a90ff" },
  { id: "car", name: "Carolina Panthers", accent: "#2ec6f0" },
  { id: "chi", name: "Chicago Bears", accent: "#fb6a2e" },
  { id: "cin", name: "Cincinnati Bengals", accent: "#fb7022" },
  { id: "cle", name: "Cleveland Browns", accent: "#ff7a33" },
  { id: "dal", name: "Dallas Cowboys", accent: "#6fa8ff" },
  { id: "den", name: "Denver Broncos", accent: "#fb7a30" },
  { id: "det", name: "Detroit Lions", accent: "#4ab8e8" },
  { id: "gb", name: "Green Bay Packers", accent: "#ffb612" },
  { id: "hou", name: "Houston Texans", accent: "#e8485f" },
  { id: "ind", name: "Indianapolis Colts", accent: "#5aa0ff" },
  { id: "jax", name: "Jacksonville Jaguars", accent: "#19b6c4" },
  { id: "kc", name: "Kansas City Chiefs", accent: "#ff3b4e" },
  { id: "lv", name: "Las Vegas Raiders", accent: "#c8cdd6" },
  { id: "lac", name: "Los Angeles Chargers", accent: "#38c6f4" },
  { id: "lar", name: "Los Angeles Rams", accent: "#ffa300" },
  { id: "mia", name: "Miami Dolphins", accent: "#18c6c0" },
  { id: "min", name: "Minnesota Vikings", accent: "#9b7dea" },
  { id: "ne", name: "New England Patriots", accent: "#6fa8ff" },
  { id: "no", name: "New Orleans Saints", accent: "#d3bc8d" },
  { id: "nyg", name: "New York Giants", accent: "#5aa0ff" },
  { id: "nyj", name: "New York Jets", accent: "#2bd66a" },
  { id: "phi", name: "Philadelphia Eagles", accent: "#1fb6c0" },
  { id: "pit", name: "Pittsburgh Steelers", accent: "#ffc20e" },
  { id: "sf", name: "San Francisco 49ers", accent: "#e8344e" },
  { id: "sea", name: "Seattle Seahawks", accent: "#69be28" },
  { id: "tb", name: "Tampa Bay Buccaneers", accent: "#ff4b3e" },
  { id: "ten", name: "Tennessee Titans", accent: "#4b92db" },
  { id: "was", name: "Washington Commanders", accent: "#e8b04b" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const channels = (rgb: number[]) => rgb.map(clamp).join(" ");
const mix = (rgb: [number, number, number], target: number, amt: number): [number, number, number] => [
  rgb[0] + (target - rgb[0]) * amt,
  rgb[1] + (target - rgb[1]) * amt,
  rgb[2] + (target - rgb[2]) * amt,
];

/** Derive the --accent / --accent-soft / --accent-strong CSS vars from one hex. */
export function accentVarsForHex(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex);
  return {
    "--accent": channels(rgb),
    "--accent-soft": channels(mix(rgb, 255, 0.32)),
    "--accent-strong": channels(mix(rgb, 0, 0.14)),
  };
}

/** CSS vars for a team id, or null for the default (amber) theme. */
export function accentVarsForTeam(teamId?: string | null): Record<string, string> | null {
  if (!teamId) return null;
  const team = NFL_TEAMS.find((t) => t.id === teamId);
  return team ? accentVarsForHex(team.accent) : null;
}
