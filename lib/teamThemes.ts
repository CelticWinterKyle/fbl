// NFL team accent themes. Each team maps to a single accent hex chosen to be
// legible on the dark "pitch" background (often the team's brighter/secondary
// color). The app's dark base + fonts never change — only the accent does.
//
// accentVarsForHex() derives the three CSS vars the UI uses (--accent + lighter
// "soft" + deeper "strong") from one hex, so a team only needs one color.

export type NflTeam = { id: string; name: string; accent: string };

// Accents use the team's OFFICIAL hex where it reads on the near-black base;
// teams whose primary is too dark (navy/forest/deep maroon/purple) use the
// official secondary, or a lightened version of the official primary. The
// "official" source is noted on adjusted entries so they're easy to tweak.
export const NFL_TEAMS: NflTeam[] = [
  { id: "ari", name: "Arizona Cardinals", accent: "#be3450" },   // lightened from official #97233F
  { id: "atl", name: "Atlanta Falcons", accent: "#c5283f" },     // lightened from official #A71930
  { id: "bal", name: "Baltimore Ravens", accent: "#6e5ce0" },    // lightened from official #241773
  { id: "buf", name: "Buffalo Bills", accent: "#3d7be6" },       // lightened from official #00338D
  { id: "car", name: "Carolina Panthers", accent: "#0085ca" },   // official
  { id: "chi", name: "Chicago Bears", accent: "#c83803" },       // official (secondary)
  { id: "cin", name: "Cincinnati Bengals", accent: "#fb4f14" },  // official
  { id: "cle", name: "Cleveland Browns", accent: "#ff3c00" },    // official (secondary)
  { id: "dal", name: "Dallas Cowboys", accent: "#4a7fe0" },      // lightened from official #003594
  { id: "den", name: "Denver Broncos", accent: "#fb4f14" },      // official
  { id: "det", name: "Detroit Lions", accent: "#0076b6" },       // official
  { id: "gb", name: "Green Bay Packers", accent: "#ffb612" },    // official (secondary, gold)
  { id: "hou", name: "Houston Texans", accent: "#c5283f" },      // lightened from official #A71930
  { id: "ind", name: "Indianapolis Colts", accent: "#4a86e0" },  // lightened from official #002C5F
  { id: "jax", name: "Jacksonville Jaguars", accent: "#d7a22a" },// official (secondary, gold)
  { id: "kc", name: "Kansas City Chiefs", accent: "#e31837" },   // official
  { id: "lv", name: "Las Vegas Raiders", accent: "#a5acaf" },    // official (secondary, silver)
  { id: "lac", name: "Los Angeles Chargers", accent: "#0080c6" },// official (powder blue)
  { id: "lar", name: "Los Angeles Rams", accent: "#ffa300" },    // official (secondary, gold)
  { id: "mia", name: "Miami Dolphins", accent: "#00b5bd" },      // lightened from official #008E97
  { id: "min", name: "Minnesota Vikings", accent: "#8458d6" },   // lightened from official #4F2683
  { id: "ne", name: "New England Patriots", accent: "#e23a55" }, // lightened from official red #C60C30
  { id: "no", name: "New Orleans Saints", accent: "#d3bc8d" },   // official (old gold)
  { id: "nyg", name: "New York Giants", accent: "#4670d6" },     // lightened from official #0B2265
  { id: "nyj", name: "New York Jets", accent: "#34a65a" },       // lightened from official #125740
  { id: "phi", name: "Philadelphia Eagles", accent: "#1b8a93" }, // lightened from official #004C54
  { id: "pit", name: "Pittsburgh Steelers", accent: "#ffb612" }, // official (gold)
  { id: "sf", name: "San Francisco 49ers", accent: "#c8202e" },  // lightened from official #AA0000
  { id: "sea", name: "Seattle Seahawks", accent: "#69be28" },    // official (action green)
  { id: "tb", name: "Tampa Bay Buccaneers", accent: "#e5312b" }, // lightened from official #D50A0A
  { id: "ten", name: "Tennessee Titans", accent: "#4b92db" },    // official (secondary)
  { id: "was", name: "Washington Commanders", accent: "#c0566c" },// lightened from official burgundy #5A1414
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
