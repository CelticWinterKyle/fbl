// This script generates a teams.json file from the current standings for use in roster generation.
import fs from 'fs';
import path from 'path';
import { getYahooAuthed } from "@/lib/yahoo";

async function main() {
  const { yf } = await getYahooAuthed();
  const gameKey = process.env.YAHOO_GAME_KEY || "461";
  const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;
  const standingsRaw = await yf.league.standings(leagueKey).catch(() => null);
  let teamsSource = standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];
  if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
    const lt = await yf.league.teams(leagueKey).catch(() => null);
    teamsSource = lt?.teams ?? lt?.league?.teams ?? [];
  }
  const teams = teamsSource.map((t: any) => ({
    name: t.name || t.team_name,
    owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner"
  }));
  fs.writeFileSync(path.join(process.cwd(), 'data', 'teams.json'), JSON.stringify(teams, null, 2));
}

main();
