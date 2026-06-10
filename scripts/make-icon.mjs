// One-off generator: derives public/icon.svg from the brand SVG in components/Logo.tsx.
// Takes the emblem (football + bolt, the first path of each fill group) and centers
// it on a pitch-dark square with maskable-safe padding.
import fs from "fs";

const src = fs.readFileSync("components/Logo.tsx", "utf8");
const m = src.match(/const SVG_INNER = ("(?:[^"\\]|\\.)*");/);
if (!m) {
  console.error("Could not find SVG_INNER in components/Logo.tsx");
  process.exit(1);
}
const inner = JSON.parse(m[1]);

// Two fill groups: green (currentColor) shapes, then ink shapes. The first path
// of each is the emblem; the rest are the LEAGUE BLITZ wordmark letters.
const groups = inner.split("</g>");
function firstPath(g) {
  const i = g.indexOf("<path");
  const j = g.indexOf("/>", i);
  return g.slice(i, j + 2);
}
const green = firstPath(groups[0]);
const ink = firstPath(groups[1]);

// Emblem bbox is roughly x 262..970.5, y 241.7..815.2 (708.5 x 573.4).
// Scale to 620px wide and center in a 1024 square: the content half-diagonal
// (~399px) stays inside the 409.6px maskable safe-zone circle.
const s = 620 / 708.5;
const tx = (1024 - 620) / 2 - 262.07 * s;
const ty = (1024 - 573.4 * s) / 2 - 241.77 * s;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="#0d0e14"/>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})">
<g fill="#fbbf24">
${green}
</g>
<g fill="#ffffff">
${ink}
</g>
</g>
</svg>
`;

fs.writeFileSync("public/icon.svg", svg);
console.log("wrote public/icon.svg", svg.length, "bytes");
