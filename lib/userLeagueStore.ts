import fs from "fs";
import path from "path";

const DIR = process.env.YAHOO_TOKEN_DIR || (process.cwd().startsWith("/var/task") ? "/tmp/yahoo-users" : path.join(process.cwd(), "lib", "yahoo-users"));

function ensureDir() { try { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); } catch {}
  if (!fs.existsSync(DIR) && !DIR.startsWith('/tmp')) {
    const fb = '/tmp/yahoo-users';
    try { if (!fs.existsSync(fb)) fs.mkdirSync(fb, { recursive: true }); (global as any).__YAHOO_USER_ROOT = fb; } catch {}
  }
}

function leagueFile(userId: string) {
  ensureDir();
  const base = (global as any).__YAHOO_USER_ROOT || DIR;
  return path.join(base, `${userId}.league.json`);
}

export function readUserLeague(userId: string): string | null {
  const filePath = leagueFile(userId);
  try { 
    const exists = fs.existsSync(filePath);
    if (!exists) {
      console.log(`userLeagueStore: No league file found for user ${userId} at ${filePath}`);
      return null;
    }
    const content = fs.readFileSync(filePath, "utf8").trim() || null;
    console.log(`userLeagueStore: Read league for user ${userId}:`, content);
    return content;
  } catch (error) { 
    console.error(`Error reading user league for ${userId}:`, error);
    return null; 
  }
}

export function saveUserLeague(userId: string, leagueKey: string) {
  fs.writeFileSync(leagueFile(userId), leagueKey);
  return leagueKey;
}

export function deleteUserLeague(userId: string) {
  try { fs.unlinkSync(leagueFile(userId)); } catch {}
}
