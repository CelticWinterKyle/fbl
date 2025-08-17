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
  try { 
    const league = fs.readFileSync(leagueFile(userId), "utf8").trim() || null;
    if (league) return league;
  } catch { 
    // If primary userId doesn't work, try to find any league file in the directory
    try {
      ensureDir();
      const base = (global as any).__YAHOO_USER_ROOT || DIR;
      const files = fs.readdirSync(base);
      const leagueFiles = files.filter(f => f.endsWith('.league.json'));
      
      // Try to read the first league file we find
      for (const file of leagueFiles) {
        try {
          const content = fs.readFileSync(path.join(base, file), "utf8").trim();
          if (content) {
            console.log(`[UserLeague] Found league ${content} in file ${file} for userId ${userId}`);
            return content;
          }
        } catch { continue; }
      }
    } catch { /* ignore directory errors */ }
  }
  return null;
}

export function saveUserLeague(userId: string, leagueKey: string) {
  fs.writeFileSync(leagueFile(userId), leagueKey);
  return leagueKey;
}

export function deleteUserLeague(userId: string) {
  try { fs.unlinkSync(leagueFile(userId)); } catch {}
}
