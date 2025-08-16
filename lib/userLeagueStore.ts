import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "lib", "yahoo-users");

function ensureDir() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }

function leagueFile(userId: string) {
  ensureDir();
  return path.join(DIR, `${userId}.league.json`);
}

export function readUserLeague(userId: string): string | null {
  try { return fs.readFileSync(leagueFile(userId), "utf8").trim() || null; } catch { return null; }
}

export function saveUserLeague(userId: string, leagueKey: string) {
  fs.writeFileSync(leagueFile(userId), leagueKey);
  return leagueKey;
}

export function deleteUserLeague(userId: string) {
  try { fs.unlinkSync(leagueFile(userId)); } catch {}
}
