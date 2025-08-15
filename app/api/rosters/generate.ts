import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const rostersPath = path.join(process.cwd(), 'data', 'rosters.json');
const teamsPath = path.join(process.cwd(), 'data', 'teams.json');

// Placeholder player pool
const playerPool = [
  { name: "Patrick Mahomes", position: "QB", team: "KC" },
  { name: "Josh Allen", position: "QB", team: "BUF" },
  { name: "Jalen Hurts", position: "QB", team: "PHI" },
  { name: "Christian McCaffrey", position: "RB", team: "SF" },
  { name: "Austin Ekeler", position: "RB", team: "LAC" },
  { name: "Bijan Robinson", position: "RB", team: "ATL" },
  { name: "Justin Jefferson", position: "WR", team: "MIN" },
  { name: "Tyreek Hill", position: "WR", team: "MIA" },
  { name: "Amon-Ra St. Brown", position: "WR", team: "DET" },
  { name: "Travis Kelce", position: "TE", team: "KC" },
  { name: "Mark Andrews", position: "TE", team: "BAL" },
  { name: "George Kittle", position: "TE", team: "SF" },
  { name: "Eagles D/ST", position: "DST", team: "PHI" },
  { name: "49ers D/ST", position: "DST", team: "SF" },
  { name: "Cowboys D/ST", position: "DST", team: "DAL" }
];

export async function POST(req: NextRequest) {
  // Read teams from teams.json (should be generated from standings)
  const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf-8'));
  let playerIdx = 0;
  const rosters = teams.map((t: any) => ({
    team: t.name,
    owner: t.owner,
    roster: Array.from({ length: 5 }).map(() => {
      const p = playerPool[playerIdx % playerPool.length];
      playerIdx++;
      return { ...p, points: 0 };
    })
  }));
  fs.writeFileSync(rostersPath, JSON.stringify(rosters, null, 2));
  return NextResponse.json({ ok: true, count: rosters.length });
}
